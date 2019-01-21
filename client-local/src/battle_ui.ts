let current_selected_entity: EntityId | undefined = undefined;
let current_state = Player_State.not_logged_in;
let this_player_id: number;
let battle: UI_Battle;
let current_targeted_ability: AbilityId | undefined;

const control_panel: Control_Panel = {
    panel: $("#hero_rows"),
    hero_rows: []
};

const battle_cell_size = 128;

type UI_Unit_Data = Visualizer_Unit_Data & {
    stat_bar_panel: Panel,
    level_label: LabelPanel,
    health_label: LabelPanel,
    mana_label: LabelPanel
}

type UI_Battle = Battle & {
    world_origin: XY;
    entity_id_to_unit_data: { [entity_id: number]: UI_Unit_Data },
    unit_id_to_facing: { [unit_id: number]: XY };
    cells: UI_Cell[];
    cell_index_to_unit: Unit[];
}

type UI_Cell = Cell & {
    associated_particle: ParticleId;
}

type Control_Panel = {
    panel: Panel;
    hero_rows: Hero_Row[];
}

type Stat_Indicator = {
    label: LabelPanel;
}

type Hero_Row = {
    unit_id: number;
    ability_buttons: Hero_Ability_Button[];
    health: Stat_Indicator;
    mana: Stat_Indicator;
    level: Stat_Indicator;
}

type Hero_Ability_Button = {
    ability: AbilityId;
    ability_panel: Panel;
    cooldown_layer: Panel;
}

type Cost_Population_Result = {
    cell_index_to_cost: number[];
    cell_index_to_parent_index: number[];
}

function find_unit_by_entity_id(battle: UI_Battle, entity_id: EntityId | undefined): Unit | undefined {
    if (entity_id == undefined) return;

    const unit_data = battle.entity_id_to_unit_data[entity_id];

    if (!unit_data) return;

    return find_unit_by_id(battle, unit_data.id);
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

        case Battle_Delta_Type.unit_unit_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (unit && target) {
                battle.unit_id_to_facing[unit.id] = xy_sub(target.position, unit.position);
            }

            break;
        }

        case Battle_Delta_Type.unit_ground_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                battle.unit_id_to_facing[unit.id] = xy_sub(delta.target_position, unit.position);
            }

            break;
        }
    }
}

function rebuild_cell_index_to_unit() {
    battle.cell_index_to_unit = [];

    for (const unit of battle.units) {
        if (!unit.dead) {
            battle.cell_index_to_unit[grid_cell_index(battle, unit.position)] = unit;
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

        const flat_deltas = flatten_deltas([ delta ]);

        for (let flat_delta of flat_deltas) {
            update_related_visual_data_from_delta(flat_delta, delta_paths);
            collapse_delta(battle, flat_delta);

            if (flat_delta.type == Battle_Delta_Type.unit_spawn) {
                const spawned_unit = find_unit_by_id(battle, flat_delta.unit_id);

                if (spawned_unit && spawned_unit.owner_player_id == this_player_id) {
                    add_spawned_hero_to_control_panel(spawned_unit);
                }
            }
        }
    }

    for (const unit of battle.units) {
        update_hero_control_panel_state(unit);
    }

    const visualiser_head = get_visualiser_delta_head();

    if (visualiser_head != undefined && battle.delta_head - visualiser_head > 20) {
        fire_event<Fast_Forward_Event>("fast_forward", make_battle_snapshot());
    } else if (deltas.length > 0) {
        fire_event<Put_Battle_Deltas_Event>("put_battle_deltas", {
            deltas: deltas,
            delta_paths: delta_paths,
            from_head: head_before_merge
        });
    }

    if (deltas.length > 0) {
        rebuild_cell_index_to_unit();
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

function process_state_transition(from: Player_State, new_state: Player_Net_Table) {
    $.Msg(`Transition from ${from} to ${new_state.state}`);

    if (from == Player_State.in_battle) {
        for (const cell of battle.cells) {
            Particles.DestroyParticleEffect(cell.associated_particle, true);
            Particles.ReleaseParticleIndex(cell.associated_particle);
        }
    }

    if (new_state.state == Player_State.in_battle) {
        battle = {
            players: from_server_array(new_state.battle.participants),
            units: [],
            delta_head: 0,
            grid_size: xy(new_state.battle.grid_size.width, new_state.battle.grid_size.height),
            turning_player_index: 0,
            deltas: [],
            world_origin: new_state.battle.world_origin,
            cells: [],
            cell_index_to_unit: [],
            entity_id_to_unit_data: {},
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
        clear_control_panel();

        $("#health_bar_container").RemoveAndDeleteChildren();
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

    if (current_selected_entity != undefined) {
        selected_unit = find_unit_by_entity_id(battle, current_selected_entity);

        if (selected_unit) {
            selected_entity_path = populate_path_costs(selected_unit.position);
        }
    }

    function color_cell(cell: UI_Cell, color: XYZ, alpha: number) {
        Particles.SetParticleControl(cell.associated_particle, 2, color);
        Particles.SetParticleControl(cell.associated_particle, 3, [ alpha, 0, 0 ]);
    }

    const your_turn = this_player_id == battle.players[battle.turning_player_index].id;

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);

        let cell_color: XYZ = color_nothing;
        let alpha = 20;

        const unit_in_cell = battle.cell_index_to_unit[index];

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

            alpha = 50;

            if (selected_unit == unit_in_cell) {
                alpha = 255;
            }
        }

        if (selected_unit && selected_entity_path) {
            if (current_targeted_ability != undefined) {
                const ability = find_unit_ability(selected_unit, current_targeted_ability);

                if (ability) {
                    switch (ability.type) {
                        case Ability_Type.target_ground: {
                            if (can_ground_target_ability_be_cast_at_target_from_source(ability.targeting, selected_unit.position, cell.position)) {
                                alpha = 80;
                                cell_color = color_red;
                            }

                            break;
                        }
                    }
                }
            } else {
                const cost = selected_entity_path.cell_index_to_cost[index];

                if (cost <= selected_unit.move_points && !selected_unit.has_taken_an_action_this_turn) {
                    cell_color = color_green;
                    alpha = 35;
                }
            }
        }

        color_cell(cell, cell_color, alpha);
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

function create_ui_unit_data(data: Visualizer_Unit_Data): UI_Unit_Data {
    const panel = $.CreatePanel("Panel", $("#health_bar_container"), "");
    const level_label = $.CreatePanel("Label", panel, "level_label");
    const health_label = $.CreatePanel("Label", panel, "health_label");
    const mana_label = $.CreatePanel("Label", panel, "mana_label");

    panel.AddClass("unit_stat_bar");

    return {
        id: data.id,
        health: data.health,
        mana: data.mana,
        level: data.level,
        stat_bar_panel: panel,
        level_label: level_label,
        health_label: health_label,
        mana_label: mana_label
    }
}

function update_unit_stat_bar_data(data: UI_Unit_Data) {
    data.level_label.text = data.level.toString();
    data.health_label.text = data.health.toString();
    data.mana_label.text = data.mana.toString();

    function try_find_associated_unit() {
        const unit = find_unit_by_id(battle, data.id);

        if (unit) {
            data.stat_bar_panel.SetHasClass("enemy", unit.owner_player_id != this_player_id);
        } else {
            $.Schedule(0, try_find_associated_unit);
        }
    }

    try_find_associated_unit();
}

function process_state_update(state: Player_Net_Table) {
    if (state.state == Player_State.not_logged_in) {
        return;
    }

    this_player_id = state.id;

    if (battle && state.state == Player_State.in_battle) {
        for (const entity_id in state.battle.entity_id_to_unit_data) {
            const new_data = state.battle.entity_id_to_unit_data[entity_id];
            const existing_data = battle.entity_id_to_unit_data[entity_id];

            if (existing_data) {
                existing_data.health = new_data.health;
                existing_data.mana = new_data.mana;

                update_unit_stat_bar_data(existing_data);
            } else {
                const created_data = create_ui_unit_data(new_data);
                update_unit_stat_bar_data(created_data);

                battle.entity_id_to_unit_data[entity_id] = created_data;
            }
        }
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
                level: unit.level,
                health: unit.health,
                mana: unit.mana,
                position: unit.position,
                type: unit.type,
                facing: battle.unit_id_to_facing[unit.id]
            })),
        delta_head: battle.delta_head
    }
}

function clear_control_panel() {
    $("#hero_rows").RemoveAndDeleteChildren();

    control_panel.hero_rows = [];
}

function get_ability_icon(ability_id: Ability_Id): string {
    switch (ability_id) {
        case Ability_Id.basic_attack: throw "Basic ability doesn't have an icon";
        case Ability_Id.pudge_hook: return "pudge_meat_hook";
        case Ability_Id.pudge_rot: return "pudge_rot";
        case Ability_Id.pudge_flesh_heap: return "pudge_flesh_heap";
        case Ability_Id.pudge_dismember: return "pudge_dismember";
        case Ability_Id.sniper_shrapnel: return "sniper_shrapnel";
    }

    return unreachable(ability_id);
}

function get_hero_name(type: Unit_Type): string {
    switch (type) {
        case Unit_Type.sniper: return "sniper";
        case Unit_Type.pudge: return "pudge";
        case Unit_Type.ursa: return "ursa";

        default: return unreachable(type);
    }
}

function safely_set_panel_background_image(panel: Panel, image: string) {
    panel.style.backgroundImage = `url('${image}')`;
    panel.AddClass("fix_bg");
    panel.RemoveClass("fix_bg");
}

function add_spawned_hero_to_control_panel(unit: Unit) {
    function create_indicator(parent: Panel, id: string, value: number): Stat_Indicator {
        const indicator = $.CreatePanel("Panel", parent, id);
        const label = $.CreatePanel("Label", indicator, "");

        indicator.AddClass("indicator");
        label.text = value.toString();

        return {
            label: label
        }
    }

    const hero_row = $.CreatePanel("Panel", control_panel.panel, "");
    hero_row.AddClass("hero_row");

    const portrait = $.CreatePanel("Panel", hero_row, "hero_portrait");
    const abilities = $.CreatePanel("Panel", hero_row, "ability_row");

    safely_set_panel_background_image(portrait, `file://{images}/heroes/npc_dota_hero_${get_hero_name(unit.type)}.png`);

    const indicators = $.CreatePanel("Panel", portrait, "indicators");

    const level = create_indicator(indicators, "level_indicator", unit.level);
    const health = create_indicator(indicators, "health_indicator", unit.health);
    const mana = create_indicator(indicators, "mana_indicator", unit.mana);

    const ability_buttons: Hero_Ability_Button[] = [];

    for (const ability of unit.abilities) {
        const ability_panel = $.CreatePanel("Panel", abilities, "");
        ability_panel.AddClass("ability_button");

        const ability_image = $.CreatePanel("Panel", ability_panel, "ability_image");
        safely_set_panel_background_image(ability_image, `file://{images}/spellicons/${get_ability_icon(ability.id)}.png`);

        const cooldown_layer = $.CreatePanel("Panel", ability_panel, "cooldown_layer");

        ability_buttons.push({
            ability: ability.id,
            ability_panel: ability_panel,
            cooldown_layer: cooldown_layer
        })
    }

    const new_row: Hero_Row = {
        unit_id: unit.id,
        ability_buttons: ability_buttons,
        health: health,
        mana: mana,
        level: level
    };

    control_panel.hero_rows.push(new_row);
}

function update_hero_control_panel_state(unit: Unit) {
    const row = control_panel.hero_rows.find(row => row.unit_id == unit.id);

    if (!row) return;

    // TODO if we had deltas for mana change we would be able to granularly update labels
    row.health.label.text = unit.health.toString();
    row.mana.label.text = unit.mana.toString();
    row.level.label.text = unit.level.toString();

    for (const ability_button of row.ability_buttons) {
        const ability = find_unit_ability(unit, ability_button.ability);

        if (!ability) continue;
        if (ability.id == Ability_Id.basic_attack) continue;

        const is_available = unit.level >= ability.available_since_level;

        ability_button.ability_panel.SetHasClass("not_learned", !is_available);

        if (is_available && ability.type != Ability_Type.passive) {
            const on_cooldown = ability.cooldown_remaining > 0;
            const not_enough_mana = ability.mana_cost > unit.mana;

            ability_button.ability_panel.SetHasClass("on_cooldown", on_cooldown);
            ability_button.ability_panel.SetHasClass("not_enough_mana", !on_cooldown && not_enough_mana);
        }
    }
}

function set_current_targeted_ability(new_ability_id: Ability_Id | undefined) {
    current_targeted_ability = new_ability_id;

    update_grid_visuals();
}

function update_current_ability_based_on_cursor_state() {
    const click_behaviors = GameUI.GetClickBehaviors();

    switch (click_behaviors) {
        case CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_ATTACK: {
            set_current_targeted_ability(Ability_Id.basic_attack);

            break;
        }

        default: {
            if (current_targeted_ability == Ability_Id.basic_attack) {
                set_current_targeted_ability(undefined);
            }

            break;
        }
    }
}

function update_stat_bar_positions() {
    const screen_ratio = Game.GetScreenHeight() / 1080;

    // TODO with the fixed camera we can have the luxury of updating only when units actually move
    for (const entity_id_string in battle.entity_id_to_unit_data) {
        const entity_id = Number(entity_id_string); // TODO holy shit why javascript, why
        const unit_data = battle.entity_id_to_unit_data[entity_id_string];
        const entity_origin = Entities.GetAbsOrigin(entity_id);

        if (!entity_origin) continue;

        const offset = -40;

        const screen_x = Game.WorldToScreenX(entity_origin[0] + 30, entity_origin[1], entity_origin[2] + offset);
        const screen_y = Game.WorldToScreenY(entity_origin[0] + 30, entity_origin[1], entity_origin[2] + offset);

        if (screen_x == -1 || screen_y == -1) {
            continue
        }

        unit_data.stat_bar_panel.style.x = Math.floor(screen_x / screen_ratio) - unit_data.stat_bar_panel.actuallayoutwidth / 2.0 + "px";
        unit_data.stat_bar_panel.style.y = Math.floor(screen_y / screen_ratio) + "px";
    }
}

function periodically_update_ui() {
    $.Schedule(0, periodically_update_ui);

    if (current_state != Player_State.in_battle) return;

    update_current_ability_based_on_cursor_state();
    update_stat_bar_positions();
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
            const world_position = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
            const battle_position = world_position_to_battle_position(world_position);
            const cursor_entity = get_entity_under_cursor();
            const cursor_entity_unit = find_unit_by_entity_id(battle, cursor_entity);
            const selected_unit = find_unit_by_entity_id(battle, current_selected_entity);

            if (current_selected_entity != undefined && current_targeted_ability != undefined) {
                const wants_to_use_ability =
                    button == MouseButton.LEFT;

                const wants_to_cancel =
                    button == MouseButton.RIGHT;


                if (!selected_unit) {
                    return true;
                }

                if (wants_to_cancel) {
                    set_current_targeted_ability(undefined);

                    if (click_behaviors != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE) {
                        return false;
                    }
                } else if (wants_to_use_ability) {
                    if (!selected_unit) return true;

                    const ability = find_unit_ability(selected_unit, current_targeted_ability);

                    if (!ability) return true;

                    switch (ability.type) {
                        case Ability_Type.target_ground: {
                            if (can_ground_target_ability_be_cast_at_target_from_source(ability.targeting, selected_unit.position, battle_position)) {
                                take_battle_action({
                                    type: Action_Type.ground_target_ability,
                                    unit_id: selected_unit.id,
                                    ability_id: current_targeted_ability,
                                    to: battle_position
                                });
                            } else {
                                show_ability_error(Ability_Error.invalid_target);

                                return true;
                            }

                            break;
                        }

                        case Ability_Type.target_unit: {
                            if (cursor_entity_unit) {
                                take_battle_action({
                                    type: Action_Type.unit_target_ability,
                                    unit_id: selected_unit.id,
                                    ability_id: current_targeted_ability,
                                    target_id: cursor_entity_unit.id
                                });
                            }
                        }

                        case Ability_Type.no_target:
                        case Ability_Type.passive: {
                            break;
                        }

                        default: unreachable(ability);
                    }

                    set_current_targeted_ability(undefined);
                }

                return true;
            }

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

            if (!selected_unit) {
                return true;
            }

            if (wants_to_perform_automatic_action) {
                if (cursor_entity_unit) {
                    if (cursor_entity != current_selected_entity) {
                        take_battle_action({
                            type: Action_Type.ground_target_ability,
                            ability_id: selected_unit.attack.id,
                            unit_id: selected_unit.id,
                            to: {
                                x: cursor_entity_unit.position.x,
                                y: cursor_entity_unit.position.y
                            }
                        })
                    }
                } else {
                    order_unit_to_move(selected_unit.id, battle_position);
                    move_order_particle(world_position);
                }
            } else if (wants_to_move_unconditionally) {
                order_unit_to_move(selected_unit.id, battle_position);
                move_order_particle(world_position);
            } else if (wants_to_attack_unconditionally) {
                take_battle_action({
                    type: Action_Type.ground_target_ability,
                    ability_id: selected_unit.attack.id,
                    unit_id: selected_unit.id,
                    to: battle_position
                })
            }
        }

        return true;
    });
}

function ability_error_to_reason(error: Ability_Error): number {
    switch (error) {
        case Ability_Error.other: return 0; // TODO
        case Ability_Error.dead: return 20;
        case Ability_Error.no_mana: return 14;
        case Ability_Error.on_cooldown: return 15;
        case Ability_Error.invalid_target: return 0; // TODO
        case Ability_Error.not_learned_yet: return 16;
        case Ability_Error.already_acted_this_turn: return 0; // TODO

        default: return unreachable(error);
    }
}

function show_ability_error(error: Ability_Error) {
    const error_data = { reason: ability_error_to_reason(error) };
    GameEvents.SendEventClientSide("dota_hud_error_message", error_data);
}

function setup_custom_ability_hotkeys() {
    // TODO check that unit belongs to the player
    // TODO check ability targeting

    function bind_ability_at_index_to_command(command: string, index: number) {
        GameUI.CustomUIConfig().register_key_bind(command, () => {
            const unit = find_unit_by_entity_id(battle, current_selected_entity);

            if (!unit) {
                return;
            }

            const ability = unit.abilities[index];

            if (!ability) return;

            const ability_use = authorize_ability_use_by_unit(unit, ability.id);

            if (ability_use.success) {
                if (ability.type == Ability_Type.no_target) {
                    take_battle_action({
                        type: Action_Type.use_no_target_ability,
                        unit_id: unit.id,
                        ability_id: ability.id
                    })
                } else {
                    set_current_targeted_ability(ability.id);
                }
            } else {
                show_ability_error(ability_use.error);
            }

            $.Msg("clicked ", get_ability_icon(ability.id));
        });
    }

    bind_ability_at_index_to_command("AbilityPrimary1", 0);
    bind_ability_at_index_to_command("AbilityPrimary2", 1);
    bind_ability_at_index_to_command("AbilityPrimary3", 2);
    bind_ability_at_index_to_command("AbilityUltimate", 3);
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
setup_custom_ability_hotkeys();
periodically_update_ui();
periodically_drop_selection_in_battle();
periodically_request_battle_deltas_when_in_battle();