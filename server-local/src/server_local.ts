function xy(x: number, y: number): XY {
    return { x: x, y: y };
}

type Player = {
    id: number;
    hero_unit: CDOTA_BaseNPC_Hero;
    movement_history: Movement_History_Entry[]
}

type Main_Player = {
    token: string;
    player_id: PlayerID;
    hero_unit: CDOTA_BaseNPC_Hero;
    movement_history: Movement_History_Entry[]
    current_order_x: number;
    current_order_y: number;
    state: Player_State;
}

type Battle_Unit = {
    id: number;
    handle: CDOTA_BaseNPC;
    position: XY;
    is_playing_a_delta: boolean;
}

type XY = {
    x: number,
    y: number
}

type Cell = {
    position: XY;
    occupied: boolean;
    cost: number;
}

type Battle = {
    deltas: Battle_Delta[];
    delta_head: number;
    world_origin: XY;
    units: Battle_Unit[];
    cells: Cell[];
    grid_size: XY;
    camera_dummy: CDOTA_BaseNPC;
}

type Player_Map = { [id: number]: Player };

declare let battle: Battle;

const movement_history_submit_rate = 0.7;
const movement_history_length = 30;
const battle_cell_size = 128;

function xy_equal(a: XY, b: XY) {
    return a.x == b.x && a.y == b.y;
}

function unreachable(x: never): never {
    throw "Didn't expect to get here";
}

// TODO array.find doesn't work in TSTL
function array_find<T>(array: Array<T>, predicate: (element: T) => boolean): T | undefined {
    for (let element of array) {
        if (predicate(element)) {
            return element;
        }
    }

    return undefined;
}

function find_unit_by_id(id: number): Battle_Unit | undefined {
    return array_find(battle.units, unit => unit.id == id);
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

function main() {
    const mode = GameRules.GetGameModeEntity();

    mode.SetCustomGameForceHero("npc_dota_hero_lina");
    mode.SetFogOfWarDisabled(true);

    GameRules.SetPreGameTime(0);
    GameRules.SetCustomGameSetupAutoLaunchDelay(0);
    GameRules.SetCustomGameSetupTimeout(0);
    GameRules.SetCustomGameSetupRemainingTime(0);

    const scheduler: Scheduler = {
        tasks: new Map<Coroutine<any>, Task>()
    };

    // TODO hack, pushes the context_scheduler
    update_scheduler(scheduler);

    mode.SetContextThink("scheduler_think", () => {
        update_scheduler(scheduler);
        return 0;
    }, 0);

    fork(game_loop);
}

// TODO this looks more like game state table right now, rename?
function update_player_state_net_table(main_player: Main_Player) {
    let battle_data: Battle_Net_Table_Data | undefined = undefined;

    if (main_player.state == Player_State.in_battle) {
        const entity_id_to_unit_id: { [entity_id:number]:number } = {};

        for (const unit of battle.units) {
            entity_id_to_unit_id[unit.handle.entindex()] = unit.id;
        }

        battle_data = {
            world_origin: battle.world_origin,
            current_visual_head: battle.delta_head,
            entity_id_to_unit_id: entity_id_to_unit_id
        }
    }

    const data: Player_Net_Table = {
        token: main_player.token,
        state: main_player.state,
        battle: battle_data
    };

    CustomNetTables.SetTableValue("main", "player", data);
}

function update_access_token(main_player: Main_Player, new_token: string) {
    main_player.token = new_token;

    update_player_state_net_table(main_player);
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

// TODO utilize this for responsiveness
function pre_visualize_action(action: Turn_Action) {
    switch (action.type) {
        case Action_Type.attack: {
            const unit = find_unit_by_id(action.unit_id);

            if (unit && !unit.is_playing_a_delta) {
                unit.handle.FaceTowards(battle_position_to_world_position_center(action.to));
            }

            break;
        }

        case Action_Type.move: {
            const unit = find_unit_by_id(action.unit_id);

            if (unit && !unit.is_playing_a_delta) {
                const path = find_grid_path(unit.position, action.to);

                if (!path) {
                    print("Couldn't find path");
                    return;
                }

                unit.handle.FaceTowards(battle_position_to_world_position_center(path[0]));
            }

            break;
        }
    }

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

function query_other_players_movement(main_player: Main_Player, players: Player_Map) {
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

function on_custom_event_async<T>(event_name: string, callback: (data: T) => void) {
    CustomGameEventManager.RegisterListener(event_name, (user_id, event) => callback(event as T));
}

function process_initial_player_state(main_player: Main_Player, state_data: Player_State_Data) {
    if (state_data.state == Player_State.not_logged_in) {
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

    FindClearSpaceForUnit(main_player.hero_unit, Vector(state_data.player_position.x, state_data.player_position.y), true);

    main_player.current_order_x = state_data.player_position.x;
    main_player.current_order_y = state_data.player_position.y;
}

function process_state_transition(main_player: Main_Player, current_state: Player_State, next_state: Player_State) {
    if (next_state == Player_State.in_battle) {
        print("Battle started");

        battle.delta_head = 0;
        battle.units = [];
        battle.deltas = [];
        battle.cells = [];

        for (let x = 0; x < battle.grid_size.x; x++) {
            for (let y = 0; y < battle.grid_size.y; y++) {
                battle.cells.push({
                    position: xy(x, y),
                    occupied: false,
                    cost: 1
                });
            }
        }

        PlayerResource.SetCameraTarget(main_player.player_id, battle.camera_dummy);
    }

    main_player.state = next_state;

    update_player_state_net_table(main_player);
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

function merge_battle_deltas(head_before_merge: number, deltas: Battle_Delta[]) {
    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }
}

function battle_position_to_world_position_center(position: { x: number, y: number }): Vec {
    return Vector(
        battle.world_origin.x + position.x * battle_cell_size + battle_cell_size / 2,
        battle.world_origin.y + position.y * battle_cell_size + battle_cell_size / 2
    )
}

function grid_cell_index(at: XY) {
    return at.x * battle.grid_size.y + at.y;
}

function grid_cell_at_unchecked(at: XY): Cell {
    return battle.cells[grid_cell_index(at)];
}

function grid_cell_at(at: XY): Cell | undefined {
    if (at.x < 0 || at.x >= battle.grid_size.x || at.y < 0 || at.y >= battle.grid_size.y) {
        return undefined;
    }

    return battle.cells[grid_cell_index(at)];
}

type Cost_Population_Result = {
    cell_index_to_cost: number[];
    cell_index_to_parent_index: number[];
}

function populate_path_costs(from: XY, to: XY): Cost_Population_Result | undefined {
    const cell_index_to_cost: number[] = [];
    const cell_index_to_parent_index: number[] = [];
    const indices_already_checked: boolean[] = [];
    const from_index = grid_cell_index(from);

    let indices_not_checked: number[] = [];

    indices_not_checked.push(from_index);
    indices_already_checked[from_index] = true;
    cell_index_to_cost[from_index] = 0;

    for (let current_cost = 0; indices_not_checked.length > 0; current_cost++) {
        const new_indices: number[] = [];

        for (let index of indices_not_checked) {
            const cell = battle.cells[index];
            const at = cell.position;

            cell_index_to_cost[index] = current_cost;

            if (xy_equal(to, at)) {
                return {
                    cell_index_to_cost: cell_index_to_cost,
                    cell_index_to_parent_index: cell_index_to_parent_index
                };
            }

            const neighbors = [
                grid_cell_at(xy(at.x + 1, at.y)),
                grid_cell_at(xy(at.x - 1, at.y)),
                grid_cell_at(xy(at.x, at.y + 1)),
                grid_cell_at(xy(at.x, at.y - 1))
            ];

            // for (let neighbor of neighbors) doesn't work there after being transpiled into lua, because
            // #array with nils in the middle won't always give 4
            for (let neighbor_index = 0; neighbor_index < 4; neighbor_index++) {
                const neighbor = neighbors[neighbor_index];

                if (!neighbor) continue;

                const neighbor_cell_index = grid_cell_index(neighbor.position);

                if (indices_already_checked[neighbor_cell_index]) continue;
                if (neighbor.occupied) {
                    indices_already_checked[neighbor_cell_index] = true;
                    continue;
                }

                new_indices.push(neighbor_cell_index);

                cell_index_to_parent_index[neighbor_cell_index] = index;
                indices_already_checked[neighbor_cell_index] = true;
            }
        }

        indices_not_checked = new_indices;
    }

    return undefined;
}

function find_grid_path(from: XY, to: XY): XY[] | undefined {
    const cell_from = grid_cell_at(from);
    const cell_to = grid_cell_at(to);

    print(`Path from ${from.x} ${from.y} -> ${to.x} ${to.y}`);

    if (!cell_from || !cell_to) {
        return;
    }

    const populated = populate_path_costs(from, to);

    if (!populated) {
        return;
    }

    let current_cell_index = populated.cell_index_to_parent_index[grid_cell_index(to)];
    const to_index = grid_cell_index(from);
    const path = [];

    path.push(to);

    while (to_index != current_cell_index) {
        path.push(battle.cells[current_cell_index].position);
        current_cell_index = populated.cell_index_to_parent_index[current_cell_index];
    }

    // path.push(from);

    return path.reverse();
}

function game_time_formatted() {
    return string.format("%.2f", GameRules.GetGameTime());
}

function spawn_unit_for_battle(unit_id: number, at: XY): Battle_Unit {
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName("npc_dota_hero_ursa", world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    handle.SetControllableByPlayer(0, true);
    handle.SetBaseMoveSpeed(500);

    const unit = {
        handle: handle,
        id: unit_id,
        position: at,
        is_playing_a_delta: false
    };

    battle.units.push(unit);

    grid_cell_at_unchecked(at).occupied = true;

    return unit;
}

function fast_forward_delta(delta: Battle_Delta) {
    // TODO first collapse deltas into an internal state, then do actual operations on handles so the server doesn't lag
    switch (delta.type) {
        case Battle_Delta_Type.unit_spawn: {
            spawn_unit_for_battle(delta.unit_id, delta.at_position);

            break;
        }

        case Battle_Delta_Type.unit_move: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                grid_cell_at_unchecked(unit.position).occupied = false;
                grid_cell_at_unchecked(delta.to_position).occupied = true;

                unit.position = delta.to_position;

                // TODO set facing to between the before-last and last point in the path
                FindClearSpaceForUnit(unit.handle, battle_position_to_world_position_center(delta.to_position), true);
            }

            break;
        }

        case Battle_Delta_Type.unit_attack: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.handle.SetForwardVector(Vector(delta.attacked_position.x - unit.position.x, delta.attacked_position.y - unit.position.y));
            }

            break;
        }

        case Battle_Delta_Type.end_turn: {
            break;
        }

        case Battle_Delta_Type.health_change: {
            break;
        }

        default: unreachable(delta);
    }
}

function play_delta(delta: Battle_Delta) {
    print(`Well delta type is: ${delta.type}`);

    switch (delta.type) {
        case Battle_Delta_Type.unit_spawn: {
            const unit = spawn_unit_for_battle(delta.unit_id, delta.at_position);
            unit.is_playing_a_delta = true;

            wait(1);

            unit.is_playing_a_delta = false;

            break;
        }

        case Battle_Delta_Type.unit_move: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.is_playing_a_delta = true;

                const path = find_grid_path(unit.position, delta.to_position);

                if (!path) {
                    print("Couldn't find path");
                    break;
                }

                grid_cell_at_unchecked(unit.position).occupied = false;
                grid_cell_at_unchecked(delta.to_position).occupied = true;

                unit.position = delta.to_position;

                for (let battle_position of path) {
                    const world_position = battle_position_to_world_position_center(battle_position);

                    unit.handle.MoveToPosition(world_position);

                    // TODO guarded_wait_until
                    const guard_hit = guarded_wait_until(3, () => {
                        return (unit.handle.GetAbsOrigin() - world_position as Vec).Length2D() < battle_cell_size / 4;
                    });

                    if (guard_hit) {
                        log_chat_debug_message(`Failed waiting on MoveToPosition ${battle_position.x}/${battle_position.y}`);
                    }
                }

                unit.is_playing_a_delta = false;
            }

            break;
        }

        case Battle_Delta_Type.unit_attack: {
            const attacked_world_position = battle_position_to_world_position_center(delta.attacked_position);
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                const desired_forward = ((attacked_world_position - attacker.handle.GetAbsOrigin()) * Vector(1, 1, 0) as Vec).Normalized();

                {
                    // TODO guarded_wait_until
                    const guard_hit = guarded_wait_until(3, () => {
                        attacker.handle.FaceTowards(attacked_world_position);

                        return desired_forward.Dot(attacker.handle.GetForwardVector()) > 0.95;
                    });

                    if (guard_hit) {
                        log_chat_debug_message(`Failed waiting on FaceTowards`);
                    }
                }
                /*while (true) {
                    attacker.handle.FaceTowards(attacked_world_position);

                    if (desired_forward.Dot(attacker.handle.GetForwardVector()) > 0.95) {
                        break;
                    }

                    wait_one_frame();
                }*/

                attacker.handle.StopFacing();
                attacker.handle.Stop();
                attacker.handle.ForcePlayActivityOnce(GameActivity_t.ACT_DOTA_ATTACK);

                const sequence = attacker.handle.GetSequence();
                const sequence_duration = attacker.handle.SequenceDuration(sequence);
                const start_time = GameRules.GetGameTime();

                while (GameRules.GetGameTime() - start_time < sequence_duration * 0.9) {
                    if (attacker.handle.GetSequence() != sequence) {
                        attacker.handle.ForcePlayActivityOnce(GameActivity_t.ACT_DOTA_ATTACK);
                    }

                    wait_one_frame();
                }

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Battle_Delta_Type.end_turn: {
            break;
        }

        case Battle_Delta_Type.health_change: {
            break;
        }

        default: unreachable(delta);
    }
}

function load_battle_data() {
    // TODO load it from server
    const grid_size = xy(12, 12);
    const origin = Entities.FindByName(undefined, "battle_bottom_left").GetAbsOrigin();
    const battle_center = origin + Vector(grid_size.x, grid_size.y) * battle_cell_size / 2 as Vec;

    // TODO incorrect definition
    const camera_entity = CreateModifierThinker(
        // @ts-ignore
        undefined,
        undefined,
        "",
        {},
        battle_center,
        DOTATeam_t.DOTA_TEAM_GOODGUYS,
        false
    ) as CDOTA_BaseNPC;

    camera_entity.SetAbsOrigin(battle_center);

    battle = {
        deltas: [],
        delta_head: 0,
        world_origin: {
            x: origin.x,
            y: origin.y
        },
        units: [],
        cells: [],
        grid_size: grid_size,
        camera_dummy: camera_entity
    };
}

/** !TupleReturn */
declare function next(a: any, prev: any): [any, any];
declare function type(a: any): "table" | "string" | "number";
declare function tonumber(a: string): number;

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

function game_loop() {
    let player_id: PlayerID | undefined = undefined;
    let player_token: string | undefined;
    let player_unit: CDOTA_BaseNPC_Hero | undefined = undefined;
    let players: Player_Map = {};

    load_battle_data();

    on_player_connected_async(id => player_id = id);

    while (player_id == undefined) wait_one_frame();

    print(`Player ${PlayerResource.GetSteamID(player_id).toString()} has connected`);

    PlayerResource.GetPlayer(player_id).SetTeam(DOTATeam_t.DOTA_TEAM_GOODGUYS);

    // We hope that hero spawn happens strictly after player connect, otherwise it doesn't make sense anyway
    on_player_hero_spawned_async(player_id, entity => player_unit = entity);

    while ((player_token = try_authorize_user(player_id, get_dedicated_server_key())) == undefined) wait(3);
    while ((player_unit == undefined)) wait_one_frame();

    print(`Authorized, hero handle found`);

    const main_player: Main_Player = {
        player_id: player_id,
        hero_unit: player_unit,
        token: player_token,
        movement_history: [],
        current_order_x: 0,
        current_order_y: 0,
        state: Player_State.not_logged_in
    };

    update_access_token(main_player, player_token);

    const player_state = try_with_delays_until_success(1, () => try_get_player_state(main_player));

    print(`State received`);

    process_initial_player_state(main_player, player_state);
    process_state_transition(main_player, Player_State.not_logged_in, main_player.state);

    on_player_order_async(order => {
        if (main_player.state == Player_State.on_global_map) {
            return process_player_global_map_order(main_player, players, order);
        }

        return false;
    });

    on_custom_event_async<Put_Battle_Deltas_Event>("put_battle_deltas", event => {
        merge_battle_deltas(event.from_head, from_client_array(event.deltas));
    });

    let state_transition: Player_State_Data | undefined = undefined;

    fork(() => submit_and_query_movement_loop(main_player, players));
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
        // TS thinks we can never assign it
        const transition = state_transition as (Player_State_Data | undefined);

        if (transition) {
            process_state_transition(main_player, main_player.state, transition.state);
            state_transition = undefined;
        }

        switch (main_player.state) {
            case Player_State.on_global_map: {
                update_main_player_movement_history(main_player);

                break;
            }

            case Player_State.in_battle: {
                if (battle.deltas.length - battle.delta_head > 20) {
                    for (let delta of battle.deltas) {
                        if (!delta) break;

                        fast_forward_delta(delta);
                    }

                    battle.delta_head = battle.deltas.length;

                    update_player_state_net_table(main_player);
                }

                for (; battle.delta_head < battle.deltas.length; battle.delta_head++) {
                    const delta = battle.deltas[battle.delta_head];

                    if (!delta) break;

                    print(`Playing delta ${battle.delta_head}`);

                    play_delta(delta);
                    update_player_state_net_table(main_player);
                }

                break;
            }
        }

        wait_one_frame();
    }
}