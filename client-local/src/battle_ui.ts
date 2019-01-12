let current_selected_entity: EntityId | undefined = undefined;
let current_state = Player_State.not_logged_in;
let this_player_id: number;
let battle: UI_Battle;

const battle_cell_size = 128;

type UI_Battle = Battle & {
    world_origin: XY;
    entity_id_to_unit_id: { [entity_id: number]: number };
    unit_id_to_facing: { [unit_id: number]: XY };
    cells: UI_Cell[];
}

type UI_Cell = Cell & {
    associated_particle: ParticleId;
}

type Cost_Population_Result = {
    cell_index_to_cost: number[];
    cell_index_to_parent_index: number[];
}

function update_related_visual_data_from_delta(delta: Battle_Delta, delta_paths: Move_Delta_Paths) {
    switch (delta.type) {
        case Battle_Delta_Type.unit_spawn: {
            battle.unit_id_to_facing[delta.unit_id] = xy(1, 0);

            break;
        }

        case Battle_Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                const path = find_grid_path(unit.position, delta.to_position);

                if (path) {
                    delta_paths[battle.delta_head] = path;

                    const to = delta.to_position;

                    battle.unit_id_to_facing[unit.id] = path.length > 1
                        ? xy_sub(to, path[path.length - 2])
                        : xy_sub(to, unit.position);
                }
            }

            break;
        }

        case Battle_Delta_Type.unit_attack: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                battle.unit_id_to_facing[unit.id] = xy_sub(delta.attacked_position, unit.position);
            }

            break;
        }
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

        update_related_visual_data_from_delta(delta, delta_paths);
        collapse_delta(battle, delta);
    }

    const visualiser_head = get_visualiser_delta_head();

    if (visualiser_head != undefined && battle.delta_head - visualiser_head > 20) {
        fire_event<Fast_Forward_Event>("fast_forward", make_battle_snapshot());
    }

    if (battle.deltas.length > 0) {
        fire_event<Put_Battle_Deltas_Event>("put_battle_deltas", {
            deltas: deltas,
            delta_paths: delta_paths,
            from_head: head_before_merge
        });

        update_grid_visuals();
    }
}

function take_battle_action(action: Turn_Action) {
    const request = {
        access_token: get_access_token(),
        action: action
    };

    remote_request<Take_Battle_Action_Request, Take_Battle_Action_Response>("/take_battle_action", request, response => {
        receive_battle_deltas(response.previous_head, response.deltas);
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

    if (from == Player_State.in_battle) {
        for (const cell of battle.cells) {
            Particles.DestroyParticleEffect(cell.associated_particle, true);
            Particles.ReleaseParticleIndex(cell.associated_particle);
        }
    }

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
            entity_id_to_unit_id: {},
            unit_id_to_facing: {}
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
    const from_index = grid_cell_index(battle, from);

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
                grid_cell_at(battle, xy(at.x + 1, at.y)),
                grid_cell_at(battle, xy(at.x - 1, at.y)),
                grid_cell_at(battle, xy(at.x, at.y + 1)),
                grid_cell_at(battle, xy(at.x, at.y - 1))
            ];

            for (const neighbor of neighbors) {
                if (!neighbor) continue;

                const neighbor_cell_index = grid_cell_index(battle, neighbor.position);

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
    const cell_from = grid_cell_at(battle, from);
    const cell_to = grid_cell_at(battle, to);

    if (!cell_from || !cell_to) {
        return;
    }

    const populated = populate_path_costs(from, to);

    if (!populated) {
        return;
    }

    let current_cell_index = populated.cell_index_to_parent_index[grid_cell_index(battle, to)];
    const to_index = grid_cell_index(battle, from);
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

function update_grid_visuals() {
    let selected_unit: Unit | undefined;
    let selected_entity_path: Cost_Population_Result | undefined;

    if (current_selected_entity) {
        selected_unit = find_unit_by_id(battle, battle.entity_id_to_unit_id[current_selected_entity]);

        if (selected_unit) {
            selected_entity_path = populate_path_costs(selected_unit.position);
        }
    }

    function color_cell(cell: UI_Cell, color: XYZ, alpha: number) {
        Particles.SetParticleControl(cell.associated_particle, 2, color);
        Particles.SetParticleControl(cell.associated_particle, 3, [ alpha, 0, 0 ]);
    }

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);

        let cell_color: XYZ = color_nothing;
        let alpha = 20;

        if (selected_unit && selected_entity_path) {
            const cost = selected_entity_path.cell_index_to_cost[index];

            if (cost <= selected_unit.move_points && !selected_unit.has_taken_an_action_this_turn) {
                cell_color = color_green;
                alpha = 35;
            }
        }

        color_cell(cell, cell_color, alpha);
    }

    const your_turn = this_player_id == battle.players[battle.turning_player_index].id;

    for (const unit_in_cell of battle.units) {
        if (unit_in_cell.dead) {
            continue;
        }

        const is_ally = unit_in_cell.owner_player_id == this_player_id;

        let cell_color: XYZ = color_nothing;
        let alpha = 10;

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

        alpha = 50;

        if (selected_unit == unit_in_cell) {
            alpha = 255;
        }

        const cell = grid_cell_at(battle, unit_in_cell.position);

        if (cell) {
            color_cell(cell as UI_Cell, cell_color, alpha);
        }
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

function make_battle_snapshot(): Battle_Snapshot {
    return {
        units: battle.units
            .filter(unit => !unit.dead)
            .map(unit => ({
                id: unit.id,
                position: unit.position,
                type: unit.type,
                facing: battle.unit_id_to_facing[unit.id]
            })),
        delta_head: battle.delta_head
    }
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
            const cursor_entity_unit = cursor_entity ? find_unit_by_id(battle, battle.entity_id_to_unit_id[cursor_entity]) : undefined;

            if (wants_to_select_unit) {
                current_selected_entity = cursor_entity;

                if (cursor_entity) {
                    const particle = Particles.CreateParticle("particles/ui_mouseactions/select_unit.vpcf", ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, cursor_entity);

                    Particles.SetParticleControl(particle, 1, [ 255, 255, 255 ]);
                    Particles.SetParticleControl(particle, 2, [ 64, 255, 0 ]);
                    Particles.ReleaseParticleIndex(particle);
                }

                update_grid_visuals();

                return true;
            }

            const selected_unit_id = current_selected_entity ? battle.entity_id_to_unit_id[current_selected_entity] : undefined;

            if (selected_unit_id == undefined) {
                return true;
            }

            if (wants_to_perform_automatic_action) {
                if (cursor_entity_unit) {
                    if (cursor_entity != current_selected_entity) {
                        take_battle_action({
                            type: Action_Type.attack,
                            to: cursor_entity_unit.position,
                            unit_id: selected_unit_id
                        })
                    }
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

