let current_selected_entity: EntityId | undefined = undefined;
let current_state = Player_State.not_logged_in;
let battle: Battle;

const battle_cell_size = 128;

type XY = {
    x: number,
    y: number
}

type Battle_Unit = {
    id: number,
    position: XY,
    move_points: number,
    max_move_points: number,
    health: number,
    has_taken_an_action_this_turn: boolean
}

type Cell = {
    position: XY;
    occupied: boolean;
    cost: number;
    associated_particle: ParticleId;
}

type Battle = {
    deltas: Battle_Delta[];
    delta_head: number;
    world_origin: XY;
    units: Battle_Unit[];
    cells: Cell[];
    grid_size: XY;
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

function update_state_after_turn_ends() {
    for (const unit of battle.units) {
        unit.move_points = unit.max_move_points;
        unit.has_taken_an_action_this_turn = false;
    }
}

function collapse_delta(delta: Battle_Delta) {
    switch (delta.type) {
        case Battle_Delta_Type.unit_move: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                const path = populate_path_costs(unit.position, delta.to_position);

                if (!path) {
                    $.Msg(`Couldn't find path: ${unit.position} -> ${delta.to_position}`);
                    return;
                }

                const cost = path.cell_index_to_cost[grid_cell_index(delta.to_position)];

                grid_cell_at_unchecked(unit.position).occupied = false;
                grid_cell_at_unchecked(delta.to_position).occupied = true;

                unit.position = delta.to_position;
                unit.move_points -= cost;
            }

            break;
        }

        case Battle_Delta_Type.unit_spawn: {
            const definition = unit_definition_by_type(delta.unit_type);

            battle.units.push({
                id: delta.unit_id,
                position: delta.at_position,
                move_points: definition.move_points,
                max_move_points: definition.move_points,
                health: definition.health,
                has_taken_an_action_this_turn: false
            });

            grid_cell_at_unchecked(delta.at_position).occupied = true;

            break;
        }

        case Battle_Delta_Type.health_change: {
            break;
        }

        case Battle_Delta_Type.unit_attack: {
            break;
        }

        case Battle_Delta_Type.end_turn: {
            update_state_after_turn_ends();

            break;
        }

        default: unreachable(delta);
    }
}

function try_collapse_deltas() {
    for (; battle.delta_head < battle.deltas.length; battle.delta_head++) {
        const delta = battle.deltas[battle.delta_head];

        if (!delta) {
            break;
        }

        collapse_delta(delta);
    }
}

function receive_battle_deltas(head_before_merge: number, deltas: Battle_Delta[]) {
    $.Msg(`Received ${deltas.length} new deltas`);

    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    // TODO We should do the following after we move the path finding to panorama:
    // TODO 1. Calculate paths for each move delta while collapsing the state
    // TODO 2. Send those paths in absolute coordinates to the server
    // TODO 3. Remove server knowledge of cell sizes and the like, tons of garbage just goes away
    try_collapse_deltas();

    if (battle.deltas.length > 0) {
        fire_event<Put_Battle_Deltas_Event>("put_battle_deltas", {
            deltas: deltas,
            from_head: head_before_merge
        });
    }

    if (current_selected_entity) {
        update_visuals_from_selected_entity(current_selected_entity);
    }
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

function process_state_transition(from: Player_State, to: Player_State, state_data: Player_Net_Table) {
    $.Msg(`Transition from ${from} to ${to}`);

    // TODO if state_data was discriminated then this check wouldn't be needed
    if (to == Player_State.in_battle && state_data.battle) {
        $.Msg("got battle");
        $.Msg(state_data.battle);

        battle = {
            units: [],
            delta_head: 0,
            grid_size: xy(12, 12),
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

        for (let index of indices_not_checked) {
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

            for (let neighbor of neighbors) {
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

function update_visuals_from_selected_entity(entity: EntityId) {
    const unit_id = battle.entity_id_to_unit_id[entity];
    const unit = find_unit_by_id(unit_id);

    if (!unit) {
        clear_selection();
        return;
    }

    const costs = populate_path_costs(unit.position);

    if (!costs) {
        clear_selection();
        return;
    }

    for (const cell of battle.cells) {
        const index = grid_cell_index(cell.position);
        const cost = costs.cell_index_to_cost[index];

        if (cost <= unit.move_points) {
            Particles.SetParticleControl(cell.associated_particle, 2, [128, 255, 128]);
        } else {
            Particles.SetParticleControl(cell.associated_particle, 2, [255, 255, 255]);
        }
    }
}

function clear_selection() {
    for (const cell of battle.cells) {
        Particles.SetParticleControl(cell.associated_particle, 2, [255, 255, 255]);
    }
}

function periodically_drop_selection_in_battle() {
    $.Schedule(0, periodically_drop_selection_in_battle);

    if (current_state != Player_State.in_battle) {
        return;
    }

    const selected_entities = Players.GetSelectedEntities(Players.GetLocalPlayer());

    if (selected_entities.length > 0) {
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
    if (battle && state.battle) {
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

        for (let entity of entities_under_cursor) {
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
        if (event == "pressed") {
            const wants_to_select_unit =
                button == MouseButton.LEFT &&
                GameUI.GetClickBehaviors() == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            const wants_to_perform_automatic_action =
                button == MouseButton.RIGHT &&
                GameUI.GetClickBehaviors() == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            const wants_to_move_unconditionally =
                current_selected_entity != undefined &&
                button == MouseButton.LEFT &&
                GameUI.GetClickBehaviors() == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_MOVE;

            const wants_to_attack_unconditionally =
                current_selected_entity != undefined &&
                button == MouseButton.LEFT &&
                GameUI.GetClickBehaviors() == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_ATTACK;

            const wants_to_cancel_current_behavior =
                button == MouseButton.RIGHT &&
                GameUI.GetClickBehaviors() != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            if (wants_to_cancel_current_behavior) {
                return false;
            }

            const world_position = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
            const battle_position = world_position_to_battle_position(world_position);
            const cursor_entity = get_entity_under_cursor();
            const cursor_entity_unit = cursor_entity ? find_unit_by_id(battle.entity_id_to_unit_id[cursor_entity]) : undefined;

            if (wants_to_select_unit) {
                current_selected_entity = cursor_entity;

                if (cursor_entity) {
                    update_visuals_from_selected_entity(cursor_entity);
                } else {
                    clear_selection();
                }

                return true;
            }

            const selected_unit_id = current_selected_entity ? battle.entity_id_to_unit_id[current_selected_entity] : undefined;

            if (selected_unit_id == undefined) {
                $.Msg(`Couldn't find a unit by entity id ${current_selected_entity}`);

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
    $.Msg("state");

    if (current_state != data.state) {
        process_state_transition(current_state, data.state, data);

        current_state = data.state;
    }

    process_state_update(data);
});

setup_mouse_filter();
periodically_drop_selection_in_battle();
periodically_request_battle_deltas_when_in_battle();

