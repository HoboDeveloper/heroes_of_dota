import {Player, report_battle_over} from "./server";
import {readFileSync} from "fs";

eval(readFileSync("dist/battle_sim.js", "utf8"));

let battle_id_auto_increment = 0;

export type Battle_Record = Battle & {
    id: number,
    unit_id_auto_increment: number,
    modifier_id_auto_increment: number,
    finished: boolean,
    modifiers: Modifier_Data[]
}

const battles: Battle_Record[] = [];

// This will only work correctly if cells are on the same line
function direction_normal_between_points(battle: Battle, from: XY, to: XY): XY {
    const delta = xy_sub(to, from);

    return xy(Math.sign(delta.x), Math.sign(delta.y));
}

declare const enum Modifier_Data_Type {
    field_change = 0
}

type Modifier_Data_Base = {
    id: number
    ability_id: Ability_Id
    target: Unit
    source: Unit
    duration_remaining: number
}

type Modifier_Data_Field_Change = Modifier_Data_Base & {
    type: Modifier_Data_Type.field_change
    field: Unit_Field,
    change: number
}

type Modifier_Data = Modifier_Data_Field_Change;

type Scan_Result_Hit = {
    hit: true,
    unit: Unit
}

type Scan_Result_Missed = {
    hit: false,
    final_point: XY
}

function field_change<T extends Unit_Field>(
    battle: Battle_Record,
    duration: number,
    source: Unit,
    target: Unit,
    ability_id: Ability_Id,
    field: T,
    change: number
): Modifier_Data_Field_Change & { field: T } {
    return {
        id: get_next_modifier_id(battle),
        type: Modifier_Data_Type.field_change,
        ability_id: ability_id,
        source: source,
        target: target,
        field: field,
        change: change,
        duration_remaining: duration
    }
}

function scan_for_unit_in_direction(
    battle: Battle,
    from_exclusive: XY,
    to: XY,
    max_scan_distance: number,
    direction_normal: XY = direction_normal_between_points(battle, from_exclusive, to)
): Scan_Result_Hit | Scan_Result_Missed {
    let current_cell = xy(from_exclusive.x, from_exclusive.y);

    for (let scanned = 0; scanned < max_scan_distance; scanned++) {
        current_cell.x += direction_normal.x;
        current_cell.y += direction_normal.y;

        const unit = unit_at(battle, current_cell);

        if (unit) {
            return { hit: true, unit: unit };
        }

        const cell = grid_cell_at(battle, current_cell);

        if (!cell) {
            return {
                hit: false,
                final_point: xy(current_cell.x - direction_normal.x, current_cell.y - direction_normal.y)
            };
        }

        if (cell.occupied) {
            return { hit: false, final_point: current_cell };
        }
    }

    return { hit: false, final_point: current_cell };
}

function query_units_in_manhattan_area(battle: Battle, from_exclusive: XY, distance_inclusive: number): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (unit.dead) continue;

        const distance = manhattan(unit.position, from_exclusive);

        if (distance > 0 && distance <= distance_inclusive) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_in_rectangular_area(battle: Battle, from_exclusive: XY, distance_inclusive: number): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (unit.dead) continue;

        const unit_position = unit.position;
        const distance = rectangular(unit_position, from_exclusive);

        if (distance > 0 && distance <= distance_inclusive) {
            units.push(unit);
        }
    }

    return units;
}

function heal_delta(source: Unit, source_ability: Ability_Id, target: Unit, heal: number, max_health_override: number = target[Unit_Field.max_health]): Delta_Health_Change {
    return {
        source_unit_id: source.id,
        source_ability_id: source_ability,
        target_unit_id: target.id,
        type: Delta_Type.health_change,
        new_value: Math.min(max_health_override, target.health + heal),
        value_delta: heal
    };
}

function field_change_delta<T extends Unit_Field>(field: T, source: Unit, source_ability: Ability_Id, target: Unit, value_delta: number): Delta_Field_Change & { field: T } {
    return {
        type: Delta_Type.unit_field_change,
        field: field,
        source_unit_id: source.id,
        source_ability_id: source_ability,
        target_unit_id: target.id,
        new_value: target[field] + value_delta,
        value_delta: value_delta
    }
}

function apply_modifier_delta<T extends Ability_Effect>(battle: Battle_Record, source: Unit, target: Unit, effect: T): Delta_Modifier_Applied<T> {
    return {
        type: Delta_Type.modifier_appled,
        modifier_id: get_next_modifier_id(battle),
        target_unit_id: target.id,
        source_unit_id: source.id,
        effect: effect
    };
}

function damage_delta(source: Unit, source_ability: Ability_Id, target: Unit, damage: number): Delta_Health_Change {
    return {
        source_unit_id: source.id,
        source_ability_id: source_ability,
        target_unit_id: target.id,
        type: Delta_Type.health_change,
        new_value: Math.max(0, target.health - damage),
        value_delta: -damage
    };
}

function field_change_to_modifier<T extends Unit_Field, U extends Ability_Effect>(
    battle: Battle_Record,
    modifier_data: Modifier_Data & { field: T },
    effect_supplier: (delta: Delta_Field_Change & { field: T }) => U
): Delta_Modifier_Applied<U> {
    battle.modifiers.push(modifier_data);

    const delta = field_change_delta(modifier_data.field, modifier_data.source, modifier_data.ability_id, modifier_data.target, modifier_data.change);

    return {
        type: Delta_Type.modifier_appled,
        modifier_id: modifier_data.id,
        target_unit_id: modifier_data.target.id,
        source_unit_id: modifier_data.source.id,
        effect: effect_supplier(delta)
    };
}

function perform_ability_cast_ground(battle: Battle, unit: Unit, ability: Ability & { type: Ability_Type.target_ground }, target: XY): Delta_Ground_Target_Ability | undefined {
    switch (ability.id) {
        case Ability_Id.basic_attack: {
            const scan = scan_for_unit_in_direction(battle, unit.position, target, ability.targeting.line_length);

            if (scan.hit) {
                const damage = Math.max(0, ability.damage + unit[Unit_Field.attack_bonus] - scan.unit[Unit_Field.armor]);
                const delta = damage_delta(unit, ability.id, scan.unit, damage);

                return {
                    type: Delta_Type.use_ground_target_ability,
                    unit_id: unit.id,
                    target_position: target,
                    ability_id: Ability_Id.basic_attack,
                    result: {
                        hit: true,
                        delta: delta
                    }
                };
            } else {
                return {
                    type: Delta_Type.use_ground_target_ability,
                    unit_id: unit.id,
                    target_position: target,
                    ability_id: Ability_Id.basic_attack,
                    result: {
                        hit: false,
                        final_point: scan.final_point
                    }
                };
            }
        }

        case Ability_Id.pudge_hook: {
            const distance = ability.targeting.line_length;
            const direction = direction_normal_between_points(battle, unit.position, target);
            const scan = scan_for_unit_in_direction(battle, unit.position, target, distance, direction);

            if (scan.hit) {
                const damage = damage_delta(unit, ability.id, scan.unit, ability.damage);
                const move: Delta_Force_Move = {
                    type: Delta_Type.unit_force_move,
                    unit_id: scan.unit.id,
                    to_position: xy(unit.position.x + direction.x, unit.position.y + direction.y)
                };

                return {
                    type: Delta_Type.use_ground_target_ability,
                    unit_id: unit.id,
                    target_position: target,
                    ability_id: ability.id,
                    result: { hit: true, deltas: [ damage , move ] }
                };
            } else {
                return {
                    type: Delta_Type.use_ground_target_ability,
                    unit_id: unit.id,
                    target_position: target,
                    ability_id: ability.id,
                    result: { hit: false, final_point: scan.final_point }
                }
            }
        }

        default: unreachable(ability.type);
    }
}

function perform_ability_cast_no_target(battle: Battle_Record, unit: Unit, ability: Ability & { type: Ability_Type.no_target }): Delta_Use_No_Target_Ability | undefined {
    switch (ability.id) {
        case Ability_Id.pudge_rot: {
            const targets = query_units_in_rectangular_area(battle, unit.position, ability.targeting.area_radius);
            const deltas = targets.map(target => damage_delta(unit, ability.id, target, ability.damage));

            deltas.push(damage_delta(unit, ability.id, unit, ability.damage));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                deltas: deltas
            }
        }

        case Ability_Id.tide_anchor_smash: {
            const reduce_by = -ability.attack_reduction;
            const targets = query_units_in_rectangular_area(battle, unit.position, ability.targeting.area_radius);
            const deltas = targets
                .map(target => field_change(battle, 1, unit, target, ability.id, Unit_Field.attack_bonus, reduce_by))
                .map(data => field_change_to_modifier(battle, data, field_change => ({
                    ability_id: ability.id,
                    type: Ability_Effect_Type.modifier,
                    deltas: [
                        damage_delta(unit, data.ability_id, data.target, ability.damage),
                        field_change
                    ]
                })));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                deltas: deltas
            };
        }

        case Ability_Id.tide_ravage: {
            const targets = query_units_in_manhattan_area(battle, unit.position, ability.targeting.distance);
            const deltas = targets
                .map(target => field_change(battle, 1, unit, target, ability.id, Unit_Field.state_stunned_counter, 1))
                .map(data => field_change_to_modifier(battle, data, field_change => ({
                    ability_id: ability.id,
                    type: Ability_Effect_Type.modifier,
                    deltas: [
                        damage_delta(unit, data.ability_id, data.target, ability.damage),
                        field_change
                    ]
                })));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                deltas: deltas
            };
        }

        default: unreachable(ability.type);
    }
}

function perform_ability_cast_unit_target(battle: Battle_Record, unit: Unit, ability: Ability & { type: Ability_Type.target_unit }, target: Unit): Delta_Unit_Target_Ability | undefined {
    switch (ability.id) {
        case Ability_Id.pudge_dismember: {
            return {
                type: Delta_Type.use_unit_target_ability,
                unit_id: unit.id,
                target_unit_id: target.id,
                ability_id: ability.id,
                heal_delta: heal_delta(unit, ability.id, unit, 14),
                damage_delta: damage_delta(unit, ability.id, target, 14)
            };
        }

        case Ability_Id.tide_gush: {
            const change = field_change(battle, 1, unit, target, ability.id, Unit_Field.max_move_points, -ability.move_points_reduction);
            const modifier_applied = field_change_to_modifier(battle, change, field_change => ({
                ability_id: ability.id,
                type: Ability_Effect_Type.modifier,
                deltas: [
                    damage_delta(unit, ability.id, target, ability.damage),
                    field_change
                ]
            }));

            return {
                type: Delta_Type.use_unit_target_ability,
                unit_id: unit.id,
                target_unit_id: target.id,
                ability_id: ability.id,
                delta: modifier_applied
            };
        }

        default: unreachable(ability.type);
    }
}

function on_target_attacked(target: Unit): Delta | undefined {
    const ability = find_unit_ability(target, Ability_Id.tide_kraken_shell);

    if (ability && target[Unit_Field.level] >= ability.available_since_level) {
        return {
            type: Delta_Type.ability_effect_applied,
            effect: {
                ability_id: Ability_Id.tide_kraken_shell,
                unit_id: target.id
            }
        };
    }
}

function turn_action_to_new_deltas(battle: Battle_Record, player: Player, action: Turn_Action): Delta[] | undefined {
    function find_valid_unit_for_action(id: number): Unit | undefined {
        const unit = find_unit_by_id(battle, id);

        if (!unit) return;
        if (unit.dead) return;
        if (unit.owner_player_id != player.id) return;
        if (unit.has_taken_an_action_this_turn) return;
        if (is_unit_stunned(unit)) return;

        return unit;
    }

    function find_valid_unit_and_authorize_ability(unit_id: number, ability_id: number): { unit: Unit, ability: Ability } | undefined {
        const unit = find_valid_unit_for_action(unit_id);

        if (!unit) return;

        const ability_use = authorize_ability_use_by_unit(unit, ability_id);

        if (!ability_use.success) return;

        const ability = ability_use.ability;

        return { unit: unit, ability: ability };
    }

    function mana_change(unit: Unit, mana_change: number): Delta_Mana_Change {
        return {
            type: Delta_Type.mana_change,
            unit_id: unit.id,
            mana_change: mana_change,
            new_mana: Math.max(0, Math.min(unit[Unit_Field.max_mana], unit.mana + mana_change))
        }
    }

    switch (action.type) {
        case Action_Type.move: {
            const unit = find_valid_unit_for_action(action.unit_id);

            if (!unit) return;
            if (xy_equal(unit.position, action.to)) return;

            const [could_find_path, cost] = can_find_path(battle, unit.position, action.to, unit.move_points);

            if (!could_find_path) {
                return;
            }

            return [{
                type: Delta_Type.unit_move,
                move_cost: cost,
                unit_id: unit.id,
                to_position: action.to
            }];
        }

        case Action_Type.use_no_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.no_target) return;

            const cast = perform_ability_cast_no_target(battle, actors.unit, actors.ability);

            if (!cast) return;

            return [
                mana_change(actors.unit, -actors.ability.mana_cost),
                cast
            ]
        }

        case Action_Type.unit_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.target_unit) return;

            const target = find_unit_by_id(battle, action.target_id);

            if (!target) return;
            if (!can_ability_be_cast_at_target_from_source(actors.ability.targeting, actors.unit.position, target.position)) return;

            const cast = perform_ability_cast_unit_target(battle, actors.unit, actors.ability, target);

            if (!cast) return;

            return [
                mana_change(actors.unit, -actors.ability.mana_cost),
                cast
            ]
        }

        case Action_Type.ground_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.target_ground) return;

            const cell = grid_cell_at(battle, action.to);

            if (!cell) return;
            if (!can_ability_be_cast_at_target_from_source(actors.ability.targeting, actors.unit.position, action.to)) return;

            const cast = perform_ability_cast_ground(battle, actors.unit, actors.ability, action.to);

            if (!cast) return;

            const deltas: Delta[] = [
                mana_change(actors.unit, -actors.ability.mana_cost),
                cast
            ];

            if (cast.ability_id == Ability_Id.basic_attack) {
                if (cast.result.hit) {
                    const damage_delta = cast.result.delta;
                    const target = find_unit_by_id(battle, damage_delta.target_unit_id)!;
                    const new_delta = on_target_attacked(target);

                    if (new_delta) {
                        deltas.push(new_delta);
                    }
                }
            }

            return deltas;
        }

        case Action_Type.end_turn: {
            return [{
                type: Delta_Type.end_turn,
                of_player_index: battle.turning_player_index
            }];
        }

        default: unreachable(action);
    }
}

function spawn_unit(battle: Battle_Record, owner: Player, at_position: XY, type: Unit_Type) : Delta_Spawn {
    const id = get_next_unit_id(battle);

    return {
        type: Delta_Type.unit_spawn,
        at_position: at_position,
        owner_id: owner.id,
        unit_type: type,
        unit_id: id
    };
}

function get_next_unit_id(battle: Battle_Record) {
    return battle.unit_id_auto_increment++;
}

function get_next_modifier_id(battle: Battle_Record) {
    return battle.modifier_id_auto_increment++;
}

function try_compute_battle_winner(battle: Battle): number | undefined {
    let last_alive_unit_player_id: number | undefined = undefined;

    for (const unit of battle.units) {
        if (!unit.dead) {
            if (last_alive_unit_player_id == undefined) {
                last_alive_unit_player_id = unit.owner_player_id;
            } else if (last_alive_unit_player_id != unit.owner_player_id) {
                return undefined;
            }
        }
    }

    return last_alive_unit_player_id;
}

function push_modifier_removed_deltas(battle: Battle_Record, data: Modifier_Data, target_deltas: Delta[]) {
    switch (data.type) {
        case Modifier_Data_Type.field_change: {
            const field = data.field;
            const change = data.change;

            switch (field) {
                // IDK why those can't go under the same case, literally the same code!
                case Unit_Field.max_health: {
                    target_deltas.push(field_change_delta(field, data.source, data.ability_id, data.target, -change));
                    break;
                }

                case Unit_Field.max_mana: {
                    target_deltas.push(field_change_delta(field, data.source, data.ability_id, data.target, -change));
                    break;
                }

                case Unit_Field.max_move_points: {
                    target_deltas.push(field_change_delta(field, data.source, data.ability_id, data.target, -change));
                    break;
                }

                case Unit_Field.attack_bonus: {
                    target_deltas.push(field_change_delta(field, data.source, data.ability_id, data.target, -change));
                    break;
                }

                case Unit_Field.state_stunned_counter: {
                    target_deltas.push(field_change_delta(field, data.source, data.ability_id, data.target, -change));
                    break;
                }

                case Unit_Field.armor: {
                    target_deltas.push(field_change_delta(field, data.source, data.ability_id, data.target, -change));
                    break;
                }

                case Unit_Field.level: {
                    break;
                }

                default: unreachable(field);
            }

            break;
        }

        default: unreachable(data.type);
    }
}

function push_pudge_flesh_heap_deltas(battle: Battle_Record, pudge: Unit, ability: Ability_Pudge_Flesh_Heap, target_deltas: Delta[]) {
    const delta = apply_modifier_delta(battle, pudge, pudge, {
        ability_id: ability.id,
        deltas: [
            field_change_delta(Unit_Field.max_health, pudge, ability.id, pudge, ability.health_per_kill),
            heal_delta(pudge, ability.id, pudge, ability.health_per_kill, pudge[Unit_Field.max_health] + ability.health_per_kill)
        ]
    });

    target_deltas.push(delta);
}

function process_on_death_delta(battle: Battle_Record, delta: Delta_Health_Change, target_deltas: Delta[]) {
    const source = find_unit_by_id(battle, delta.source_unit_id);
    const target = find_unit_by_id(battle, delta.target_unit_id);

    if (!source || !target) return;
    if (source.owner_player_id == target.owner_player_id) return;

    const source_level = source[Unit_Field.level];

    if (source_level < max_unit_level) {
        target_deltas.push({
            type: Delta_Type.unit_field_change,
            field: Unit_Field.level,
            received_from_enemy_kill: true,
            target_unit_id: source.id,
            new_value: source_level + 1,
            value_delta: 1,
            source_unit_id: source.id,
            source_ability_id: delta.source_ability_id
        });
    }

    for (const ability of source.abilities) {
        if (source_level < ability.available_since_level) continue;

        if (ability.id == Ability_Id.pudge_flesh_heap) {
            push_pudge_flesh_heap_deltas(battle, source, ability, target_deltas);
        }
    }
}

function on_level_up(battle: Battle_Record, delta: Delta_Level_Change, target_deltas: Delta[]) {
    const unit = find_unit_by_id(battle, delta.target_unit_id);

    if (!unit) return;

    const new_level = unit[Unit_Field.level];
    const previous_level = unit[Unit_Field.level] - delta.value_delta;

    for (const ability of unit.abilities) {
        if (unit[Unit_Field.level] < ability.available_since_level) continue;

        const just_received_this_ability = new_level >= ability.available_since_level && previous_level < ability.available_since_level;

        if (just_received_this_ability) {
            switch (ability.id) {
                case Ability_Id.pudge_flesh_heap: {
                    if (delta.received_from_enemy_kill) {
                        push_pudge_flesh_heap_deltas(battle, unit, ability, target_deltas);
                    }

                    break;
                }

                case Ability_Id.tide_kraken_shell: {
                    target_deltas.push(field_change_delta(Unit_Field.armor, unit, Ability_Id.tide_kraken_shell, unit, 3));

                    break;
                }
            }
        }

    }
}

function process_collapsed_deltas(battle: Battle_Record, deltas: Delta[]): Delta[] | undefined {
    const new_deltas: Delta[] = [];

    for (const delta of deltas) {
        switch (delta.type) {
            case Delta_Type.health_change: {
                if (delta.new_value == 0) {
                    process_on_death_delta(battle, delta, new_deltas);
                }

                break;
            }

            case Delta_Type.unit_field_change: {
                if (delta.field == Unit_Field.level) {
                    on_level_up(battle, delta, new_deltas);
                }

                break;
            }

            case Delta_Type.modifier_removed: {
                const index = battle.modifiers.findIndex(modifier => modifier.id == delta.modifier_id);

                if (index != -1) {
                    battle.modifiers.splice(index, 1);
                }

                break;
            }

            case Delta_Type.end_turn: {
                const turning_player_id = battle.players[delta.of_player_index].id;

                for (const modifier of battle.modifiers) {
                    if (modifier.target.owner_player_id != turning_player_id) {
                        continue;
                    }

                    modifier.duration_remaining--;

                    if (modifier.duration_remaining == 0) {
                        new_deltas.push({
                            type: Delta_Type.modifier_removed,
                            modifier_id: modifier.id
                        });

                        push_modifier_removed_deltas(battle, modifier, new_deltas);
                    }
                }

                new_deltas.push({
                    type: Delta_Type.start_turn
                });

                break;
            }
        }
    }

    if (new_deltas.length == 0) {
        return;
    }

    return new_deltas;
}

export function try_take_turn_action(battle: Battle_Record, player: Player, action: Turn_Action): Delta[] | undefined {
    if (battle.finished) {
        return;
    }

    if (get_turning_player(battle).id != player.id) {
        return;
    }

    const initial_head = battle.delta_head;
    const new_deltas = turn_action_to_new_deltas(battle, player, action);
    const collapsed_anything = submit_battle_deltas(battle, new_deltas);

    if (collapsed_anything) {
        const possible_winner = try_compute_battle_winner(battle);

        if (possible_winner != undefined) {
            battle.finished = true;

            report_battle_over(battle, possible_winner);
        }
    }

    return get_battle_deltas_after(battle, initial_head);
}

export function submit_battle_deltas(battle: Battle_Record, battle_deltas: Delta[] | undefined): boolean {
    let new_deltas = battle_deltas;
    let collapsed_anything = false;

    while (new_deltas) {
        const flattened_deltas = collapse_deltas(battle, battle.delta_head, new_deltas);
        new_deltas = process_collapsed_deltas(battle, flattened_deltas);

        collapsed_anything = true;
    }

    return collapsed_anything;
}

export function get_battle_deltas_after(battle: Battle, head: number): Delta[] {
    return battle.deltas.slice(head);
}

export function find_battle_by_id(id: number): Battle_Record | undefined {
    return battles.find(battle => battle.id == id);
}

export function start_battle(players: Player[]): number {
    const battle: Battle_Record = {
        id: battle_id_auto_increment++,
        delta_head: 0,
        unit_id_auto_increment: 0,
        modifier_id_auto_increment: 0,
        modifiers: [],
        units: [],
        players: players.map(player => ({
            id: player.id,
            name: player.name
        })),
        deltas: [],
        cells: [],
        grid_size: xy(12, 12),
        turning_player_index: 0,
        finished: false
    };

    fill_grid(battle);

    const spawn_deltas = [
        spawn_unit(battle, players[0], xy(1, 1), Unit_Type.ursa),
        spawn_unit(battle, players[0], xy(3, 1), Unit_Type.sniper),
        spawn_unit(battle, players[0], xy(5, 1), Unit_Type.pudge),
        spawn_unit(battle, players[0], xy(7, 1), Unit_Type.tidehunter),
        spawn_unit(battle, players[0], xy(9, 1), Unit_Type.luna),

        spawn_unit(battle, players[1], xy(2, 7), Unit_Type.ursa),
        spawn_unit(battle, players[1], xy(4, 7), Unit_Type.sniper),
        spawn_unit(battle, players[1], xy(6, 7), Unit_Type.pudge),
        spawn_unit(battle, players[1], xy(8, 7), Unit_Type.tidehunter),
        spawn_unit(battle, players[1], xy(10, 7), Unit_Type.luna),
    ];

    collapse_deltas(battle, battle.delta_head, spawn_deltas);

    battles.push(battle);

    return battle.id;
}