type Player = {
    id: number;
    hero_unit: CDOTA_BaseNPC_Hero;
    movement_history: Movement_History_Entry[]
    last_recorded_x: number
    last_recorded_y: number
}

type Main_Player = {
    token: string;
    remote_id: number,
    player_id: PlayerID;
    hero_unit: CDOTA_BaseNPC_Hero;
    movement_history: Movement_History_Entry[]
    current_order_x: number;
    current_order_y: number;
    state: Player_State;
}

type Player_Map = Record<number, Player>;

const movement_history_submit_rate = 0.7;
const movement_history_length = 30;

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

function process_player_global_map_order(main_player: Main_Player, players: Player_Map, order: ExecuteOrderEvent): boolean {
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
    return {
        id: response.id,
        movement_history: response.movement_history,
        hero_unit: CreateUnitByName(
            "npc_dota_hero_lina",
            Vector(response.current_location.x, response.current_location.y),
            true,
            null,
            null,
            DOTATeam_t.DOTA_TEAM_GOODGUYS
        ) as CDOTA_BaseNPC_Hero,
        last_recorded_x: response.current_location.x,
        last_recorded_y: response.current_location.y
    };
}

function update_player_from_movement_history(player: Player) {
    const current_unit_position = player.hero_unit.GetAbsOrigin();
    const snap_distance = 400;

    let closest_entry: Movement_History_Entry | undefined;
    let minimum_distance = 1e6;
    let closest_entry_index = 0;

    player.movement_history.forEach((entry, entry_index) => {
        const delta = current_unit_position - Vector(entry.location_x, entry.location_y) as Vector;
        const distance = delta.Length2D();

        if (distance <= snap_distance && distance <= minimum_distance) {
            minimum_distance = distance;
            closest_entry = entry;
            closest_entry_index = entry_index;
        }
    });

    // player.hero_unit.SetBaseMoveSpeed(295 + (movement_history_length - closest_entry_index) * 20);

    if (closest_entry) {
        if (minimum_distance > 0) {
            player.hero_unit.MoveToPosition(Vector(closest_entry.order_x, closest_entry.order_y));
        }
    } else if (player.movement_history.length > 0) {
        const last_entry = player.movement_history[player.movement_history.length - 1];

        FindClearSpaceForUnit(player.hero_unit, Vector(last_entry.location_x, last_entry.location_y), true);
        player.hero_unit.MoveToPosition(Vector(last_entry.order_x, last_entry.order_y));
    } else {
        FindClearSpaceForUnit(player.hero_unit, Vector(player.last_recorded_x, player.last_recorded_y), true);
    }
}

function query_other_players_movement(main_player: Main_Player, players: Player_Map) {
    const request: Query_Players_Movement_Request = {
        access_token: main_player.token,
        dedicated_server_key: get_dedicated_server_key()
    };

    const response = remote_request_with_retry_on_403<Query_Players_Movement_Request, Query_Players_Movement_Response>("/trusted/query_players_movement", main_player, request);

    if (!response) {
        return;
    }

    const received_movement_history_this_frame: Record<number, boolean> = {};

    for (const id in players) {
        received_movement_history_this_frame[id] = false;
    }

    response.forEach(player_data => {
        const player = players[player_data.id];

        received_movement_history_this_frame[player_data.id] = true;

        if (player) {
            player.movement_history = player_data.movement_history;
            player.last_recorded_x = player_data.current_location.x;
            player.last_recorded_y = player_data.current_location.y;

            update_player_from_movement_history(player);
        } else {
            const new_player = create_new_player_from_response(player_data);

            players[new_player.id] = new_player;

            update_player_from_movement_history(new_player);
        }
    });

    for (const id in players) {
        const player = players[id];
        const should_be_kept = received_movement_history_this_frame[id];

        if (!should_be_kept) {
            delete players[id];

            player.hero_unit.RemoveSelf();
        }
    }
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

function submit_and_query_movement_loop(main_player: Main_Player, players: Player_Map) {
    while (true) {
        // TODO decide if we want to query other players movements even in battle
        wait_until(() => main_player.state == Player_State.on_global_map);
        wait(movement_history_submit_rate);

        fork(() => submit_player_movement(main_player));
        fork(() => query_other_players_movement(main_player, players));
    }
}

function attack_player(main_player: Main_Player, target_player_id: number) {
    const new_player_state = remote_request<Attack_Player_Request, Attack_Player_Response>("/trusted/attack_player", {
        access_token: main_player.token,
        dedicated_server_key: get_dedicated_server_key(),
        target_player_id: target_player_id
    });

    if (new_player_state) {
        try_submit_state_transition(main_player, new_player_state);
    }
}
