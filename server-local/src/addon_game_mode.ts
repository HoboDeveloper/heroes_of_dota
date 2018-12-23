require("scheduler");
require("requests");
require("calls");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    PrecacheResource("", "", context);
}

interface Player {
    id: number;
    hero_unit: CDOTA_BaseNPC_Hero;
    movement_history: Movement_History_Entry[]
}

interface Main_Player {
    token: string;
    player_id: PlayerID;
    hero_unit: CDOTA_BaseNPC_Hero;
    movement_history: Movement_History_Entry[]
    current_order_x: number;
    current_order_y: number;
    state: Player_State;
}

const players: { [id: number]: Player } = {};
const movement_history_submit_rate = 0.7;
const movement_history_length = 30;

function log_message(message: string) {
    const final_message = `[${GameRules.GetGameTime()}] ${message}`;

    CustomGameEventManager.Send_ServerToAllClients("log_message", { message: final_message });

    print(final_message);
}

function get_dedicated_server_key() {
    return GetDedicatedServerKey("v1");
}

function main() {
    const mode = GameRules.GetGameModeEntity();

    mode.SetCustomGameForceHero("npc_dota_hero_lina");
    mode.SetFogOfWarDisabled(true);

    GameRules.SetPreGameTime(0);
    GameRules.SetCustomGameSetupAutoLaunchDelay(0);
    GameRules.SetCustomGameSetupTimeout(0);
    GameRules.SetCustomGameSetupRemainingTime(0);

    mode.SetContextThink("scheduler_think", () => {
        update_scheduler();
        return 0;
    }, 0);

    fork(game_loop);
}

function submit_player_movement(main_player: Main_Player) {
    const current_location = main_player.hero_unit.GetAbsOrigin();
    const request: Submit_Player_Movement_Request = {
        access_token: main_player.token,
        current_location: {
            x: current_location.x,
            y: current_location.y
        },
        movement_history: main_player.movement_history.map(entry => ({
            order_x: entry.order_x,
            order_y: entry.order_y,
            location_x: entry.location_x,
            location_y: entry.location_y
        })),
        dedicated_server_key: get_dedicated_server_key()
    };

    remote_request_with_retry_on_403("/trusted/submit_player_movement", main_player, request);
}

function process_player_order(main_player: Main_Player, order: ExecuteOrderEvent): boolean {
    for (let index in order.units) {
        if (order.units[index] == main_player.hero_unit.entindex()) {
            if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_MOVE_TO_POSITION) {
                main_player.current_order_x = order.position_x;
                main_player.current_order_y = order.position_y;
            } else if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_ATTACK_TARGET) {
                const attacked_entity = EntIndexToHScript(order.entindex_target);

                for (let player_id in players) {
                    const player = players[player_id];

                    if (player.hero_unit == attacked_entity) {
                        fork(() => {
                            attack_player(main_player, player.id);
                        });

                        break;
                    }
                }

                return false;
            } else {
                return false;
            }

            break;
        }
    }

    return true;
}

function create_new_player_from_response(response: Player_Movement_Data): Player {
    const current_location = response.movement_history[response.movement_history.length - 1];

    return {
        id: response.id,
        movement_history: response.movement_history,
        hero_unit: CreateUnitByName(
            "npc_dota_hero_lina",
            Vector(current_location.location_x, current_location.location_y),
            true,
            null,
            null,
            DOTATeam_t.DOTA_TEAM_GOODGUYS
        ) as CDOTA_BaseNPC_Hero
    };
}

function update_player_from_movement_history(player: Player) {
    const current_unit_position = player.hero_unit.GetAbsOrigin();
    const snap_distance = 400;

    let closest_entry: Movement_History_Entry | undefined;
    let minimum_distance = 1e6;
    let closest_entry_index = 0;

    player.movement_history.forEach((entry, entry_index) => {
        const delta = current_unit_position - Vector(entry.location_x, entry.location_y) as Vec;
        const distance = delta.Length2D();

        if (distance <= snap_distance && distance <= minimum_distance) {
            minimum_distance = distance;
            closest_entry = entry;
            closest_entry_index = entry_index;
        }
    });

    // player.hero_unit.SetBaseMoveSpeed(295 + (movement_history_length - closest_entry_index) * 20);

    if (closest_entry) {
        player.hero_unit.MoveToPosition(Vector(closest_entry.order_x, closest_entry.order_y));
    } else {
        const last_entry = player.movement_history[player.movement_history.length - 1];

        FindClearSpaceForUnit(player.hero_unit, Vector(last_entry.location_x, last_entry.location_y), true);
        player.hero_unit.MoveToPosition(Vector(last_entry.order_x, last_entry.order_y));
    }
}

function query_other_players_movement(main_player: Main_Player) {
    const request: Query_Players_Movement_Request = {
        access_token: main_player.token,
        dedicated_server_key: get_dedicated_server_key()
    };

    const response = remote_request_with_retry_on_403<Query_Players_Movement_Request, Query_Players_Movement_Response>("/trusted/query_players_movement", main_player, request);

    if (!response) {
        return;
    }

    response.forEach(player_data => {
        const player = players[player_data.id] as Player | undefined;

        if (player) {
            player.movement_history = player_data.movement_history;

            update_player_from_movement_history(player);
        } else {
            const new_player = create_new_player_from_response(player_data);

            players[new_player.id] = new_player;

            update_player_from_movement_history(new_player);
        }
    })
}

function update_main_player_movement_history(main_player: Main_Player) {
    const location = main_player.hero_unit.GetAbsOrigin();

    main_player.movement_history.push({
        order_x: main_player.current_order_x,
        order_y: main_player.current_order_y,
        location_x: location.x,
        location_y: location.y
    });

    if (main_player.movement_history.length > movement_history_length) {
        main_player.movement_history.shift();
    }
}

function attack_player(main_player: Main_Player, target_player_id: number) {
    const attack_result = remote_request<Attack_Player_Request, Attack_Player_Response>("/trusted/attack_player", {
        access_token: main_player.token,
        dedicated_server_key: get_dedicated_server_key(),
        target_player_id: target_player_id
    });

    if (!attack_result) {
        throw "Failed to perform attack";
    }

    // TODO set state immediately after we verify that independent state transitions work
}

function on_player_connected_async(callback: (player_id: PlayerID) => void) {
    ListenToGameEvent("player_connect_full", event => callback(event.PlayerID), null);
}

function on_player_hero_spawned_async(player_id: PlayerID, callback: (entity: CDOTA_BaseNPC_Hero) => void) {
    ListenToGameEvent("npc_spawned", event => {
        const entity = EntIndexToHScript(event.entindex) as CDOTA_BaseNPC;

        if (entity.IsRealHero() && entity.GetPlayerID() == player_id) {
            callback(entity);
        }

    }, null);
}

function on_player_order_async(callback: (event: ExecuteOrderEvent) => boolean) {
    const mode = GameRules.GetGameModeEntity();

    mode.SetExecuteOrderFilter((context, event) => {
        return callback(event);
    }, mode);
}

function process_player_state(main_player: Main_Player, state_data: Player_State_Data) {
    main_player.state = state_data.state;

    switch (state_data.state) {
        case Player_State.not_logged_in: {
            const characters = try_with_delays_until_success(3, () => try_query_characters(main_player));
            let selected_character: number;

            if (characters.length == 0) {
                const new_character = try_with_delays_until_success(3, () => try_create_new_character(main_player));

                selected_character = new_character.id;
            } else {
                selected_character = characters[0].id;
            }

            try_with_delays_until_success(3, () => try_log_in_with_character(main_player, selected_character));

            break;
        }

        case Player_State.on_global_map: {
            break;
        }

        case Player_State.in_battle: {
            break;
        }
    }

    FindClearSpaceForUnit(main_player.hero_unit, Vector(state_data.player_position.x, state_data.player_position.y), true);

    main_player.current_order_x = state_data.player_position.x;
    main_player.current_order_y = state_data.player_position.y;
}

function process_state_transition(main_player: Main_Player, player_state: Player_State_Data) {
    const current_state = main_player.state;
    const next_state = player_state.state;

    main_player.state = next_state;

    if (current_state == Player_State.on_global_map && next_state == Player_State.in_battle) {
        print("Battle started");
    }
}

function submit_and_query_movement_loop(main_player: Main_Player) {
    while (true) {
        // TODO decide if we want to query other players movements even in battle
        wait_until(() => main_player.state == Player_State.on_global_map);
        wait(movement_history_submit_rate);

        fork(() => submit_player_movement(main_player));
        fork(() => query_other_players_movement(main_player));
    }
}

function game_loop() {
    let player_id: PlayerID | undefined = undefined;
    let player_token: string | undefined;
    let player_unit: CDOTA_BaseNPC_Hero | undefined = undefined;

    on_player_connected_async(id => player_id = id);

    while (player_id == undefined) wait_one_frame();

    print(`Player ${PlayerResource.GetSteamID(player_id).toString()} has connected`);

    PlayerResource.GetPlayer(player_id).SetTeam(DOTATeam_t.DOTA_TEAM_GOODGUYS);

    // We hope that hero spawn happens strictly after player connect, otherwise it doesn't make sense anyway
    on_player_hero_spawned_async(player_id, entity => player_unit = entity);

    while ((player_token = try_authorize_user(player_id, get_dedicated_server_key())) == undefined) wait(3);
    while ((player_unit == undefined)) wait_one_frame();

    print(`Authorized, hero unit found`);

    const main_player: Main_Player = {
        player_id: player_id,
        hero_unit: player_unit,
        token: player_token,
        movement_history: [],
        current_order_x: 0,
        current_order_y: 0,
        state: Player_State.not_logged_in
    };

    const player_state = try_with_delays_until_success(1, () => try_get_player_state(main_player));

    print(`State received`);

    process_player_state(main_player, player_state);

    on_player_order_async(order => process_player_order(main_player, order));

    let state_transition: Player_State_Data | undefined = undefined;

    fork(() => submit_and_query_movement_loop(main_player));
    fork(() => {
        while(true) {
            const state_data = try_get_player_state(main_player);

            if (state_data && state_data.state != main_player.state) {
                print(`Well I have a new state transition and it is ${main_player.state} -> ${state_data.state}`);

                state_transition = state_data;
            }

            wait(2);
        }
    });

    fork(() => {
        while(true) {
            update_main_player_movement_history(main_player);
            wait_one_frame();
        }
    });

    while (true) {
        if (state_transition) {
            process_state_transition(main_player, state_transition);
            state_transition = undefined;
        }

        wait_one_frame();
    }
}