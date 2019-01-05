let current_selected_entity: EntityId | undefined = undefined;
let current_state = Player_State.not_logged_in;
let this_player_id: number;
let battle: Battle;

const battle_cell_size = 128;

type XY = {
    x: number,
    y: number
}

type Battle_Unit = {
    id: number,
    owner_player_id: number,
    position: XY,
    move_points: number,
    max_move_points: number,
    health: number,
    has_taken_an_action_this_turn: boolean,
    dead: boolean
}

type Cell = {
    position: XY;
    occupied: boolean;
    cost: number;
    associated_particle: ParticleId;
}

type Battle = {
    players: Battle_Player[],
    deltas: Battle_Delta[];
    delta_head: number;
    world_origin: XY;
    units: Battle_Unit[];
    cells: Cell[];
    grid_size: XY;
    turning_player_index: number,
    entity_id_to_unit_id: { [entity_id: number]: number };
}

type Cost_Population_Result = {
    cell_index_to_cost: number[];
    cell_index_to_parent_index: number[];
}

function xy(x: number, y: number): XY {
    return { x: x, y: y };
}

function xy_equal(a: XY, b: XY) {
    return a.x == b.x && a.y == b.y;
}

function find_unit_by_id(id: number): Battle_Unit | undefined {
    return array_find(battle.units, unit => unit.id == id);
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

function pass_turn_to_next_player() {
    battle.turning_player_index++;

    if (battle.turning_player_index == battle.players.length) {
        battle.turning_player_index -= battle.players.length;
    }
}

function update_state_after_turn_ends() {
    for (const unit of battle.units) {
        unit.move_points = unit.max_move_points;
        unit.has_taken_an_action_this_turn = false;
    }
}

function collapse_move_delta(delta: Battle_Delta_Unit_Move, path_cost: number) {
    const unit = find_unit_by_id(delta.unit_id);

    if (unit) {
        grid_cell_at_unchecked(unit.position).occupied = false;
        grid_cell_at_unchecked(delta.to_position).occupied = true;

        unit.position = delta.to_position;
        unit.move_points -= path_cost;
    }
}

function collapse_delta(delta: Battle_Delta) {
    switch (delta.type) {
        case Battle_Delta_Type.unit_move: {
            throw "Use collapse_move_delta";
        }

        case Battle_Delta_Type.unit_spawn: {
            const definition = unit_definition_by_type(delta.unit_type);

            battle.units.push({
                id: delta.unit_id,
                owner_player_id: delta.owner_id,
                position: delta.at_position,
                move_points: definition.move_points,
                max_move_points: definition.move_points,
                health: definition.health,
                dead: false,
                has_taken_an_action_this_turn: false
            });

            grid_cell_at_unchecked(delta.at_position).occupied = true;

            break;
        }

        case Battle_Delta_Type.health_change: {
            const target = find_unit_by_id(delta.target_unit_id);

            if (target && delta.new_health == 0) {
                grid_cell_at_unchecked(target.position).occupied = false;

                target.dead = true;
            }

            break;
        }

        case Battle_Delta_Type.unit_attack: {
            switch (delta.effect.type) {
                case Battle_Effect_Type.nothing: break;
                case Battle_Effect_Type.basic_attack: {
                    collapse_delta(delta.effect.delta);

                    break;
                }

                default: unreachable(delta.effect);
            }

            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.has_taken_an_action_this_turn = true;
            }

            break;
        }

        case Battle_Delta_Type.end_turn: {
            update_state_after_turn_ends();
            pass_turn_to_next_player();

            break;
        }

        default: unreachable(delta);
    }
}

function receive_battle_deltas(head_before_merge: number, deltas: Battle_Delta[]) {
    $.Msg(`Received ${deltas.length} new deltas`);

    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    const delta_paths: Move_Delta_Paths = {};

    for (; battle.delta_head < battle.deltas.length; battle.delta_head++) {
        const delta = battle.deltas[battle.delta_head];

        if (!delta) {
            break;
        }

        if (delta.type == Battle_Delta_Type.unit_move) {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                const path = find_grid_path(unit.position, delta.to_position);

                if (path) {
                    delta_paths[battle.delta_head] = path.map(battle_position_to_world_position_center).map(xyz => ({
                        world_x: xyz[0],
                        world_y: xyz[1]
                    }));

                    collapse_move_delta(delta, path.length);
                }
            }
        } else {
            collapse_delta(delta);
        }
    }

    if (battle.deltas.length > 0) {
        fire_event<Put_Battle_Deltas_Event>("put_battle_deltas", {
            deltas: deltas,
            delta_paths: delta_paths,
            from_head: head_before_merge
        });
    }

    update_grid_visuals();
}

function take_battle_action(action: Turn_Action) {
    const request = {
        access_token: get_access_token(),
        action: action
    };

    remote_request<Take_Battle_Action_Request, Take_Battle_Action_Response>("/take_battle_action", request, response => {
        receive_battle_deltas(response.previous_head, response.deltas)
    });
}

function periodically_request_battle_deltas_when_in_battle() {
    $.Schedule(2.0, periodically_request_battle_deltas_when_in_battle);

    if (current_state != Player_State.in_battle) {
        return;
    }

    const head_before = battle.delta_head;
    const request: Query_Battle_Deltas_Request = {
        access_token: get_access_token(),
        since_delta: head_before
    };

    remote_request<Query_Battle_Deltas_Request, Query_Battle_Deltas_Response>("/query_battle_deltas", request, response => {
        receive_battle_deltas(head_before, response.deltas);
    });
}

function create_cell_particle_at(position: XYZ) {
    const particle = Particles.CreateParticle("particles/ui/square_overlay.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

    Particles.SetParticleControl(particle, 0, position);
    Particles.SetParticleControl(particle, 1, [battle_cell_size / 2, 0, 0]);
    Particles.SetParticleControl(particle, 2, [255, 255, 255]);
    Particles.SetParticleControl(particle, 3, [50, 0, 0]);

    return particle;
}

function process_state_transition(from: Player_State, state_data: Player_Net_Table) {
    $.Msg(`Transition from ${from} to ${state_data.state}`);

    if (state_data.state == Player_State.in_battle) {
        battle = {
            players: from_server_array(state_data.battle.participants),
            units: [],
            delta_head: 0,
            grid_size: xy(state_data.battle.grid_size.width, state_data.battle.grid_size.height),
            turning_player_index: 0,
            deltas: [],
            world_origin: state_data.battle.world_origin,
            cells: [],
            entity_id_to_unit_id: {}
        };

        const particle_bottom_left_origin: XYZ = [
            battle.world_origin.x + battle_cell_size / 2,
            battle.world_origin.y + battle_cell_size / 2,
            128
        ];

        for (let x = 0; x < battle.grid_size.x; x++) {
            for (let y = 0; y < battle.grid_size.y; y++) {
                const particle = create_cell_particle_at([
                    particle_bottom_left_origin[0] + x * battle_cell_size,
                    particle_bottom_left_origin[1] + y * battle_cell_size,
                    particle_bottom_left_origin[2]
                ]);

                battle.cells.push({
                    position: xy(x, y),
                    occupied: false,
                    cost: 1,
                    associated_particle: particle
                });

                register_particle_for_reload(particle);
            }
        }

        update_grid_visuals();
    }
}

function populate_path_costs(from: XY, to: XY | undefined = undefined): Cost_Population_Result | undefined {
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

        for (const index of indices_not_checked) {
            const cell = battle.cells[index];
            const at = cell.position;

            cell_index_to_cost[index] = current_cost;

            if (to && xy_equal(to, at)) {
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

            for (const neighbor of neighbors) {
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

    if (to) {
        return undefined;
    } else {
        return {
            cell_index_to_cost: cell_index_to_cost,
            cell_index_to_parent_index: cell_index_to_parent_index
        };
    }
}

function find_grid_path(from: XY, to: XY): XY[] | undefined {
    const cell_from = grid_cell_at(from);
    const cell_to = grid_cell_at(to);

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

const color_nothing: XYZ = [ 255, 255, 255 ];
const color_green: XYZ = [ 128, 255, 128 ];
const color_red: XYZ = [ 255, 128, 128 ];
const color_yellow: XYZ = [ 255, 255, 0 ];

// TODO too expensive, consider storing units in cells
function find_unit_by_cell(at: XY) {
    return array_find(battle.units, unit => !unit.dead && unit.position.x == at.x && unit.position.y == at.y);
}

function update_grid_visuals() {
    let selected_unit: Battle_Unit | undefined;
    let selected_entity_path: Cost_Population_Result | undefined;

    if (current_selected_entity) {
        selected_unit = find_unit_by_id(battle.entity_id_to_unit_id[current_selected_entity]);

        if (selected_unit) {
            selected_entity_path = populate_path_costs(selected_unit.position);
        }
    }

    function color_cell(cell: Cell, color: XYZ) {
        Particles.SetParticleControl(cell.associated_particle, 2, color);
    }

    const your_turn = this_player_id == battle.players[battle.turning_player_index].id;

    for (const cell of battle.cells) {
        const index = grid_cell_index(cell.position);

        let cell_color: XYZ = color_nothing;

        if (selected_unit && selected_entity_path) {
            const cost = selected_entity_path.cell_index_to_cost[index];

            if (cost <= selected_unit.move_points && !selected_unit.has_taken_an_action_this_turn) {
                cell_color = color_green;
            }
        }

        // TODO expensive
        const unit_in_cell = find_unit_by_cell(cell.position);

        if (unit_in_cell) {
            const is_ally = unit_in_cell.owner_player_id == this_player_id;

            if (is_ally) {
                if (your_turn) {
                    if (unit_in_cell.has_taken_an_action_this_turn) {
                        cell_color = color_yellow;
                    } else {
                        cell_color = color_green;
                    }
                } else {
                    cell_color = color_yellow;
                }
            } else {
                cell_color = color_red;
            }
        }

        color_cell(cell, cell_color);
    }
}

function periodically_drop_selection_in_battle() {
    $.Schedule(0, periodically_drop_selection_in_battle);

    if (current_state != Player_State.in_battle) {
        return;
    }

    const local_player = Players.GetLocalPlayer();
    const selected_entities = Players.GetSelectedEntities(local_player);
    const hero = Players.GetPlayerHeroEntityIndex(local_player);

    if (selected_entities.length > 0 && selected_entities[0] != hero) {
        GameUI.SelectUnit(-1, false);
    }
}

// Used from XML
function end_turn() {
    take_battle_action({
        type: Action_Type.end_turn
    });
}

function process_state_update(state: Player_Net_Table) {
    if (state.state == Player_State.not_logged_in) {
        return;
    }

    this_player_id = state.id;

    if (battle && state.state == Player_State.in_battle) {
        battle.entity_id_to_unit_id = state.battle.entity_id_to_unit_id;
    }
}

function world_position_to_battle_position(position: XYZ): XY {
    return {
        x: Math.floor((position[0] - battle.world_origin.x) / battle_cell_size),
        y: Math.floor((position[1] - battle.world_origin.y) / battle_cell_size)
    }
}

function battle_position_to_world_position_center(position: XY): XYZ {
    return [
        battle.world_origin.x + position.x * battle_cell_size + battle_cell_size / 2,
        battle.world_origin.y + position.y * battle_cell_size + battle_cell_size / 2,
        0
    ]
}

function move_order_particle(world_position: XYZ) {
    const particle = Particles.CreateParticle("particles/ui_mouseactions/clicked_moveto.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

    Particles.SetParticleControl(particle, 0, [ world_position[0], world_position[1], world_position[2] + 32 ]);
    Particles.SetParticleControl(particle, 1, [ 128, 255, 128 ]);

    Particles.ReleaseParticleIndex(particle);
}

function order_unit_to_move(unit_id: number, move_where: XY) {
    take_battle_action({
        type: Action_Type.move,
        to: move_where,
        unit_id: unit_id
    });
}

function setup_mouse_filter() {
    function get_entity_under_cursor(): EntityId | undefined {
        const entities_under_cursor = GameUI.FindScreenEntities(GameUI.GetCursorPosition());

        for (const entity of entities_under_cursor) {
            if (entity.accurateCollision) {
                return entity.entityIndex;
            }
        }

        if (entities_under_cursor.length > 0) {
            return entities_under_cursor[0].entityIndex;
        }

        return undefined;
    }

    GameUI.SetMouseCallback((event, button) => {
        if (current_state != Player_State.in_battle) {
            return false;
        }

        if (event == "pressed") {
            const click_behaviors = GameUI.GetClickBehaviors();

            const wants_to_select_unit =
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            const wants_to_perform_automatic_action =
                button == MouseButton.RIGHT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            const wants_to_move_unconditionally =
                current_selected_entity != undefined &&
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_MOVE;

            const wants_to_attack_unconditionally =
                current_selected_entity != undefined &&
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_ATTACK;

            const wants_to_cancel_current_behavior =
                button == MouseButton.RIGHT &&
                click_behaviors != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            if (wants_to_cancel_current_behavior) {
                return false;
            }

            const world_position = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
            const battle_position = world_position_to_battle_position(world_position);
            const cursor_entity = get_entity_under_cursor();
            const cursor_entity_unit = cursor_entity ? find_unit_by_id(battle.entity_id_to_unit_id[cursor_entity]) : undefined;

            if (wants_to_select_unit) {
                current_selected_entity = cursor_entity;

                update_grid_visuals();

                return true;
            }

            const selected_unit_id = current_selected_entity ? battle.entity_id_to_unit_id[current_selected_entity] : undefined;

            if (selected_unit_id == undefined) {
                return true;
            }

            if (wants_to_perform_automatic_action) {
                if (cursor_entity_unit) {
                    take_battle_action({
                        type: Action_Type.attack,
                        to: cursor_entity_unit.position,
                        unit_id: selected_unit_id
                    })
                } else {
                    order_unit_to_move(selected_unit_id, battle_position);
                    move_order_particle(world_position);
                }
            } else if (wants_to_move_unconditionally) {
                order_unit_to_move(selected_unit_id, battle_position);
                move_order_particle(world_position);
            } else if (wants_to_attack_unconditionally) {
                take_battle_action({
                    type: Action_Type.attack,
                    to: battle_position,
                    unit_id: selected_unit_id
                })
            }
        }

        return true;
    });
}

subscribe_to_net_table_key<Player_Net_Table>("main", "player", data => {
    if (current_state != data.state) {
        process_state_transition(current_state, data);

        current_state = data.state;
    }

    process_state_update(data);

    if (data.state == Player_State.in_battle) {
        update_grid_visuals();
    }
});

setup_mouse_filter();
periodically_drop_selection_in_battle();
periodically_request_battle_deltas_when_in_battle();

