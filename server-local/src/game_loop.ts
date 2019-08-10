let state_transition: Player_State_Data | undefined = undefined;

function print_table(a: object, indent: string = "") {
    let [index, value] = next(a, undefined);

    while (index != undefined) {
        print(indent, `${index} (${type(index)})`, value);

        if (type(value) == "table") {
            print_table(value, indent + "    ");
        }

        [index, value] = next(a, index);
    }
}

// Panorama arrays are passed as dictionaries with string indices
function from_client_array<T>(array: Array<T>): Array<T> {
    let [index, value] = next(array, undefined);

    const result: Array<T> = [];

    while (index != undefined) {
        result[tonumber(index.toString())] = value;

        [index, value] = next(array, index);
    }

    return result
}

function from_client_tuple<T>(array: T): T {
    let [index, value] = next(array, undefined);

    const result = [];

    while (index != undefined) {
        result[tonumber(index.toString())] = value;

        [index, value] = next(array, index);
    }

    return result as any as T;
}

function unreachable(x: never): never {
    throw "Didn't expect to get here";
}

// TODO array.find doesn't work in TSTL
function array_find<T>(array: Array<T>, predicate: (element: T) => boolean): T | undefined {
    for (const element of array) {
        if (predicate(element)) {
            return element;
        }
    }

    return undefined;
}

function array_find_index<T>(array: Array<T>, predicate: (element: T) => boolean): number {
    for (let index = 0; index < array.length; index++) {
        if (predicate(array[index])) {
            return index;
        }
    }

    return -1;
}

function game_time_formatted() {
    return string.format("%.2f", GameRules.GetGameTime());
}

function log_message(message: string) {
    const final_message = `[${game_time_formatted()}] ${message}`;

    CustomGameEventManager.Send_ServerToAllClients("log_message", { message: final_message });

    print(final_message);
}

function log_chat_debug_message(message: string) {
    const final_message = `Debug@[${game_time_formatted()}] ${message}`;
    const event: Debug_Chat_Message_Event = { message: final_message };

    CustomGameEventManager.Send_ServerToAllClients("log_chat_debug_message", event);
}

function unit_to_visualizer_unit_data(unit: Battle_Unit): Visualizer_Unit_Data {
    // TODO some of those properties are not actually needed
    const stats = unit as Unit_Stats;
    const base: Visualizer_Unit_Data_Base = assign(stats, {
        id: unit.id
    });

    switch (unit.supertype) {
        case Unit_Supertype.hero: {
            return assign<Visualizer_Unit_Data_Base, Visualizer_Hero_Data>(base, {
                supertype: Unit_Supertype.hero,
                level: unit.level
            })
        }

        case Unit_Supertype.creep: {
            return assign<Visualizer_Unit_Data_Base, Visualizer_Creep_Data>(base, {
                supertype: Unit_Supertype.creep
            })
        }
    }
}

function player_state_to_player_net_table(main_player: Main_Player): Player_Net_Table {
    switch (main_player.state) {
        case Player_State.in_battle: {
            const entity_id_to_unit_data: Record<EntityID, Visualizer_Unit_Data> = {};
            const entity_id_to_rune_id: Record<number, number> = {};
            const entity_id_to_shop_id: Record<number, number> = {};

            for (const unit of battle.units) {
                entity_id_to_unit_data[unit.handle.entindex()] = unit_to_visualizer_unit_data(unit);
            }

            for (const rune of battle.runes) {
                entity_id_to_rune_id[rune.handle.entindex()] = rune.id;
            }

            for (const shop of battle.shops) {
                entity_id_to_shop_id[shop.handle.entindex()] = shop.id;
            }

            return {
                state: main_player.state,
                id: main_player.remote_id,
                token: main_player.token,
                battle: {
                    id: battle.id,
                    participants: battle.participants,
                    players: battle.players.map(player => ({
                        id: player.id,
                        gold: player.gold
                    })),
                    world_origin: {
                        x: battle.world_origin.x,
                        y: battle.world_origin.y
                    },
                    grid_size: battle.grid_size,
                    current_visual_head: battle.delta_head,
                    entity_id_to_unit_data: entity_id_to_unit_data,
                    entity_id_to_rune_id: entity_id_to_rune_id,
                    entity_id_to_shop_id: entity_id_to_shop_id
                }
            };
        }

        case Player_State.not_logged_in: {
            return {
                state: main_player.state
            };
        }

        case Player_State.on_global_map: {
            return {
                state: main_player.state,
                id: main_player.remote_id,
                token: main_player.token
            };
        }

        default: return unreachable(main_player.state);
    }
}

// TODO this looks more like game state table right now, rename?
function update_player_state_net_table(main_player: Main_Player) {
    CustomNetTables.SetTableValue("main", "player", player_state_to_player_net_table(main_player));
}

function update_access_token(main_player: Main_Player, new_token: string) {
    main_player.token = new_token;

    update_player_state_net_table(main_player);
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

function on_custom_event_async<T>(event_name: string, callback: (data: T) => void) {
    CustomGameEventManager.RegisterListener(event_name, (user_id, event) => fork(() => callback(event as T)));
}

function select_or_create_character_and_log_in(main_player: Main_Player) {
    const characters = try_with_delays_until_success(3, () => try_query_characters(main_player));
    let selected_character: number;

    if (characters.length == 0) {
        const new_character = try_with_delays_until_success(3, () => try_create_new_character(main_player));

        selected_character = new_character.id;
    } else {
        selected_character = characters[0].id;
    }

    try_with_delays_until_success(3, () => try_log_in_with_character(main_player, selected_character));
}

function process_state_transition(main_player: Main_Player, current_state: Player_State, next_state: Player_State_Data) {
    if (next_state.state == Player_State.on_global_map) {
        FindClearSpaceForUnit(main_player.hero_unit, Vector(next_state.player_position.x, next_state.player_position.y), true);

        main_player.current_order_x = next_state.player_position.x;
        main_player.current_order_y = next_state.player_position.y;
    }

    if (current_state == Player_State.in_battle) {
        print("Battle over");

        // TODO copypaste
        // TODO remove particles
        for (const unit of battle.units) {
            unit.handle.RemoveSelf();
        }

        for (const rune of battle.runes) {
            destroy_rune(rune, true);
        }

        for (const shop of battle.shops) {
            shop.handle.RemoveSelf();
        }

        battle.delta_head = 0;
        battle.deltas = [];
        battle.delta_paths = [];
        battle.players = [];
        battle.units = [];
        battle.shops = [];
        battle.runes = [];
        battle.is_over = false;

        PlayerResource.SetCameraTarget(main_player.player_id, main_player.hero_unit);
        wait_one_frame();
        PlayerResource.SetCameraTarget(main_player.player_id, undefined);
    }

    if (next_state.state == Player_State.in_battle) {
        print("Battle started");

        battle.id = next_state.battle_id;
        battle.delta_head = 0;
        battle.units = [];
        battle.deltas = [];
        battle.players = next_state.participants.map(participant => ({
            id: participant.id,
            gold: 0
        }));
        battle.participants = next_state.participants;
        battle.grid_size = next_state.grid_size;

        const camera_look_at = battle.world_origin + Vector(next_state.grid_size.width, next_state.grid_size.height - 2) * get_battle_cell_size() / 2 as Vector;

        battle.camera_dummy.SetAbsOrigin(camera_look_at);

        PlayerResource.SetCameraTarget(main_player.player_id, battle.camera_dummy);
    }

    main_player.state = next_state.state;

    update_player_state_net_table(main_player);
}

function try_submit_state_transition(main_player: Main_Player, new_state: Player_State_Data) {
    if (new_state.state != main_player.state) {
        print(`Well I have a new state transition and it is ${main_player.state} -> ${new_state.state}`);

        state_transition = new_state;
    }
}

function main() {
    function link_modifier(name: string, path: string) {
        LinkLuaModifier(name, path, LuaModifierType.LUA_MODIFIER_MOTION_NONE);
    }

    const mode = GameRules.GetGameModeEntity();

    mode.SetCustomGameForceHero("npc_dota_hero_lina");
    mode.SetFogOfWarDisabled(true);

    GameRules.SetPreGameTime(0);
    GameRules.SetCustomGameSetupAutoLaunchDelay(0);
    GameRules.SetCustomGameSetupTimeout(0);
    GameRules.SetCustomGameSetupRemainingTime(0);

    link_modifier("Modifier_Battle_Unit", "modifiers/modifier_battle_unit");
    link_modifier("Modifier_Tide_Gush", "modifiers/modifier_tide_gush");
    link_modifier("Modifier_Damage_Effect", "modifiers/modifier_damage_effect");
    link_modifier("Modifier_Dragon_Knight_Elder_Dragon", "modifiers/modifier_dragon_knight_elder_dragon");
    link_modifier("Modifier_Lion_Hex", "modifiers/modifier_lion_hex");
    link_modifier("Modifier_Euls_Scepter", "modifiers/modifier_euls_scepter");

    mode.SetContextThink("scheduler_think", () => {
        update_scheduler();
        return 0;
    }, 0);

    fork(game_loop);
}

function game_loop() {
    let authorization: Authorize_Steam_User_Response | undefined;
    let player_id: PlayerID | undefined = undefined;
    let player_unit: CDOTA_BaseNPC_Hero | undefined = undefined;
    let players: Player_Map = {};

    load_battle_data();

    on_player_connected_async(id => player_id = id);

    while (player_id == undefined) wait_one_frame();

    print(`Player ${PlayerResource.GetSteamID(player_id).toString()} has connected`);

    PlayerResource.GetPlayer(player_id).SetTeam(DOTATeam_t.DOTA_TEAM_GOODGUYS);

    // We hope that hero spawn happens strictly after player connect, otherwise it doesn't make sense anyway
    on_player_hero_spawned_async(player_id, entity => player_unit = entity);

    while ((authorization = try_authorize_user(player_id, get_dedicated_server_key())) == undefined) wait(3);
    while (player_unit == undefined) wait_one_frame();

    print(`Authorized, hero handle found`);

    const main_player: Main_Player = {
        remote_id: authorization.id,
        player_id: player_id,
        hero_unit: player_unit,
        token: authorization.token,
        movement_history: [],
        current_order_x: 0,
        current_order_y: 0,
        state: Player_State.not_logged_in
    };

    update_access_token(main_player, authorization.token);

    const player_state = try_with_delays_until_success(1, () => try_get_player_state(main_player));

    print(`State received`);

    if (player_state.state == Player_State.not_logged_in) {
        select_or_create_character_and_log_in(main_player);
    }

    process_state_transition(main_player, Player_State.not_logged_in, player_state);

    on_player_order_async(order => {
        if (main_player.state == Player_State.on_global_map) {
            return process_player_global_map_order(main_player, players, order);
        }

        return false;
    });

    on_custom_event_async<Put_Deltas_Event>("put_battle_deltas", event => {
        merge_battle_deltas(event.from_head, from_client_array(event.deltas));
        merge_delta_paths_from_client(event.delta_paths);
    });

    on_custom_event_async<Fast_Forward_Event>("fast_forward", event => {
        fast_forward_from_snapshot(main_player, {
            players: from_client_array(event.players),
            units: from_client_array(event.units),
            runes: from_client_array(event.runes),
            shops: from_client_array(event.shops),
            delta_head: event.delta_head
        });
    });

    fork(() => submit_and_query_movement_loop(main_player, players));
    fork(() => {
        while(true) {
            const state_data = try_get_player_state(main_player);

            if (state_data) {
                try_submit_state_transition(main_player, state_data);
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

    fork(() => {
        while(true) {
            if (main_player.state == Player_State.in_battle) {
                periodically_update_battle();
            }

            wait_one_frame();
        }
    });

    while (true) {
        if (state_transition) {
            process_state_transition(main_player, main_player.state, state_transition);
            state_transition = undefined;
        }

        switch (main_player.state) {
            case Player_State.on_global_map: {
                update_main_player_movement_history(main_player);

                break;
            }

            case Player_State.in_battle: {
                while (!battle.is_over) {
                    const target_head = get_battle_remote_head();

                    for (; battle.delta_head < target_head; battle.delta_head++) {
                        const delta = battle.deltas[battle.delta_head];

                        if (!delta) break;

                        print(`Playing delta ${delta.type} (#${battle.delta_head})`);

                        play_delta(main_player, delta, battle.delta_head);
                        update_player_state_net_table(main_player);
                    }

                    wait_one_frame();
                }

                break;
            }
        }

        wait_one_frame();
    }
}