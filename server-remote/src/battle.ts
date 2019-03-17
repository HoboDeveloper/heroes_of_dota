import {Player, report_battle_over} from "./server";
import {readFileSync} from "fs";

eval(readFileSync("dist/battle_sim.js", "utf8"));

let battle_id_auto_increment = 0;

export type Battle_Record = Battle & {
    id: number
    unit_id_auto_increment: number
    modifier_id_auto_increment: number
    card_id_auto_increment: number
    finished: boolean
    modifiers: Modifier_Data[]
}

const battles: Battle_Record[] = [];

function random_int_up_to(upper_bound: number) {
    return Math.floor(Math.random() * upper_bound);
}

function random_in_array<T>(array: T[], length = array.length): T | undefined {
    if (length == 0) return;

    return array[random_int_up_to(length)];
}

declare const enum Modifier_Data_Type {
    field_change = 0
}

type Modifier_Data_Base = {
    id: number
    ability_id: Ability_Id
    target: Unit
    source: Unit
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

function register_modifier(battle: Battle_Record, modifier: Delta_Modifier_Applied<Ability_Effect>) {
    const flat = flatten_deltas([ modifier ]);

    for (const delta of flat) {
        if (delta.type == Delta_Type.unit_field_change) {
            battle.modifiers.push({
                id: modifier.modifier_id,
                type: Modifier_Data_Type.field_change,
                ability_id: delta.source_ability_id,
                source: find_unit_by_id(battle, delta.source_unit_id)!,
                target: find_unit_by_id(battle, delta.target_unit_id)!,
                field: delta.field,
                change: delta.value_delta,
            });
        }
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

function query_units_in_rectangular_area_around_point(battle: Battle, from_exclusive: XY, distance_inclusive: number): Unit[] {
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

function query_units_for_no_target_ability(battle: Battle, caster: Unit, targeting: Ability_Targeting_Unit_In_Manhattan_Distance | Ability_Targeting_Rectangular_Area_Around_Caster): Unit[] {
    const from_exclusive = caster.position;

    switch (targeting.type) {
        case Ability_Targeting_Type.unit_in_manhattan_distance: {
            return query_units_in_manhattan_area(battle, from_exclusive, targeting.distance);
        }

        case Ability_Targeting_Type.rectangular_area_around_caster: {
            return query_units_in_rectangular_area_around_point(battle, from_exclusive, targeting.area_radius);
        }
    }
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

function field_change_delta<T extends Unit_Field>(field: T, source: Unit, target: Unit, source_ability: Ability_Id, value_delta: number): Delta_Field_Change & { field: T } {
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

function apply_modifier_delta<T extends Ability_Effect>(battle: Battle_Record, source: Unit, target: Unit, duration: number, effect: T): Delta_Modifier_Applied<T> {
    return {
        type: Delta_Type.modifier_appled,
        modifier_id: get_next_modifier_id(battle),
        target_unit_id: target.id,
        source_unit_id: source.id,
        duration: duration,
        effect: effect
    };
}

function apply_ability_effect_delta<T extends Ability_Effect>(effect: T): Delta_Ability_Effect_Applied<T> {
    return {
        type: Delta_Type.ability_effect_applied,
        effect: effect
    }
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
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
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
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const modifier_applied_deltas: Delta_Modifier_Applied<Ability_Effect_Tide_Anchor_Smash>[] = [];

            for (const target of targets) {
                const damage = damage_delta(unit, ability.id, target, ability.damage);
                const reduction = field_change_delta(Unit_Field.attack_bonus, unit, target, ability.id, reduce_by);
                const modifier = apply_modifier_delta(battle, unit, target, 1, {
                    ability_id: Ability_Id.tide_anchor_smash,
                    deltas: [damage, reduction]
                });

                register_modifier(battle, modifier);

                modifier_applied_deltas.push(modifier);
            }

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                deltas: modifier_applied_deltas
            };
        }

        case Ability_Id.tide_ravage: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const modifier_applied_deltas: Delta_Modifier_Applied<Ability_Effect_Tide_Ravage>[] = [];

            for (const target of targets) {
                const damage = damage_delta(unit, ability.id, target, ability.damage);
                const stun = field_change_delta(Unit_Field.state_stunned_counter, unit, target, ability.id, 1);
                const modifier = apply_modifier_delta(battle, unit, target, 1, {
                    ability_id: Ability_Id.tide_ravage,
                    deltas: [damage, stun]
                });

                register_modifier(battle, modifier);

                modifier_applied_deltas.push(modifier);
            }

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                deltas: modifier_applied_deltas
            };
        }

        case Ability_Id.luna_eclipse: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                unit: target,
                beams_applied: 0
            }));

            let remaining_targets = targets.length;
            let remaining_beams = ability.total_beams;

            for (; remaining_beams > 0 && remaining_targets > 0; remaining_beams--) {
                const target_index = random_int_up_to(remaining_targets);
                const random_target = targets[target_index];

                random_target.beams_applied++;

                if (random_target.beams_applied == random_target.unit.health) {
                    const last_target = targets[remaining_targets - 1];

                    targets[remaining_targets - 1] = random_target;
                    targets[target_index] = last_target;

                    remaining_targets--;
                }
            }

            const damage_deltas: Delta_Health_Change[] = targets.map(target => damage_delta(unit, ability.id, target.unit, target.beams_applied));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                deltas: damage_deltas,
                missed_beams: remaining_beams
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
            const damage = damage_delta(unit, ability.id, target, ability.damage);
            const slow = field_change_delta(Unit_Field.max_move_points, unit, target, ability.id, -ability.move_points_reduction);
            const modifier = apply_modifier_delta(battle, unit, target, 1, {
                ability_id: Ability_Id.tide_gush,
                deltas: [damage, slow]
            });

            register_modifier(battle, modifier);

            return {
                type: Delta_Type.use_unit_target_ability,
                unit_id: unit.id,
                target_unit_id: target.id,
                ability_id: ability.id,
                delta: modifier
            };
        }

        case Ability_Id.luna_lucent_beam: {
            const damage = damage_delta(unit, ability.id, target, ability.damage);

            return {
                type: Delta_Type.use_unit_target_ability,
                unit_id: unit.id,
                target_unit_id: target.id,
                ability_id: ability.id,
                delta: damage
            };
        }

        default: unreachable(ability.type);
    }
}

function on_target_attacked(battle: Battle_Record, source: Unit, target: Unit, damage: number): Delta | undefined {
    for (const ability of source.abilities) {
        if (source[Unit_Field.level] < ability.available_since_level) continue;

        switch (ability.id) {
            case Ability_Id.luna_moon_glaive: {
                const is_ally = (target: Unit) => target.owner_player_id == source.owner_player_id;
                const targets = query_units_in_rectangular_area_around_point(battle, target.position, 2);
                const allies = targets.filter(target => is_ally(target) && target != source);
                const enemies = targets.filter(target => !is_ally(target));
                const glaive_target = enemies.length > 0 ? random_in_array(enemies) : random_in_array(allies);

                if (glaive_target) {
                    const delta = damage_delta(source, ability.id, glaive_target, damage);

                    return apply_ability_effect_delta({
                        original_target_id: target.id,
                        ability_id: ability.id,
                        delta: delta
                    });
                }
            }
        }
    }


    for (const ability of target.abilities) {
        if (target[Unit_Field.level] < ability.available_since_level) continue;

        switch (ability.id) {
            case Ability_Id.tide_kraken_shell: {
                return apply_ability_effect_delta({
                    ability_id: ability.id,
                    unit_id: target.id
                });
            }
        }
    }
}

function turn_action_to_new_deltas(battle: Battle_Record, player: Battle_Player, action: Turn_Action): Delta[] | undefined {
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
                    const new_delta = on_target_attacked(battle, actors.unit, target, -damage_delta.value_delta);

                    if (new_delta) {
                        deltas.push(new_delta);
                    }
                }
            }

            return deltas;
        }

        case Action_Type.use_hero_card: {
            const card = find_player_card_by_id(player, action.card_id);

            if (!card) return;
            if (card.type != Card_Type.hero) return;
            if (player.has_used_a_card_this_turn) return;

            const cell = grid_cell_at(battle, action.at);

            if (!cell || cell.occupied) return;

            return [
                use_card(player, card),
                spawn_unit(battle, player, action.at, card.unit_type)
            ]
        }

        case Action_Type.end_turn: {
            return [{
                type: Delta_Type.end_turn
            }];
        }

        default: unreachable(action);
    }
}

function spawn_unit(battle: Battle_Record, owner: Battle_Player, at_position: XY, type: Unit_Type) : Delta_Spawn {
    const id = get_next_unit_id(battle);

    return {
        type: Delta_Type.unit_spawn,
        at_position: at_position,
        owner_id: owner.id,
        unit_type: type,
        unit_id: id
    };
}

function draw_hero_card(battle: Battle_Record, player: Battle_Player, unit_type: Unit_Type): Delta_Draw_Card {
    return {
        type: Delta_Type.draw_card,
        player_id: player.id,
        card: {
            type: Card_Type.hero,
            id: get_next_card_id(battle),
            unit_type: unit_type
        }
    }
}

function use_card(player: Battle_Player, card: Card): Delta_Use_Card {
    return {
        type: Delta_Type.use_card,
        player_id: player.id,
        card_id: card.id
    }
}

function get_next_unit_id(battle: Battle_Record) {
    return battle.unit_id_auto_increment++;
}

function get_next_modifier_id(battle: Battle_Record) {
    return battle.modifier_id_auto_increment++;
}

function get_next_card_id(battle: Battle_Record) {
    return battle.card_id_auto_increment++;
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
                    target_deltas.push(field_change_delta(field, data.source, data.target, data.ability_id, -change));
                    break;
                }

                case Unit_Field.max_mana: {
                    target_deltas.push(field_change_delta(field, data.source, data.target, data.ability_id, -change));
                    break;
                }

                case Unit_Field.max_move_points: {
                    target_deltas.push(field_change_delta(field, data.source, data.target, data.ability_id, -change));
                    break;
                }

                case Unit_Field.attack_bonus: {
                    target_deltas.push(field_change_delta(field, data.source, data.target, data.ability_id, -change));
                    break;
                }

                case Unit_Field.state_stunned_counter: {
                    target_deltas.push(field_change_delta(field, data.source, data.target, data.ability_id, -change));
                    break;
                }

                case Unit_Field.armor: {
                    target_deltas.push(field_change_delta(field, data.source, data.target, data.ability_id, -change));
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

function push_pudge_flesh_heap_deltas(pudge: Unit, ability: Ability_Pudge_Flesh_Heap, target_deltas: Delta[]) {
    const delta = apply_ability_effect_delta( {
        ability_id: ability.id,
        deltas: [
            field_change_delta(Unit_Field.max_health, pudge, pudge, ability.id, ability.health_per_kill),
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
            push_pudge_flesh_heap_deltas(source, ability, target_deltas);
        }
    }
}

function on_ability_received(battle: Battle_Record, unit: Unit, ability: Ability, from_enemy_kill: boolean, target_deltas: Delta[]) {
    switch (ability.id) {
        case Ability_Id.pudge_flesh_heap: {
            if (from_enemy_kill) {
                push_pudge_flesh_heap_deltas(unit, ability, target_deltas);
            }

            break;
        }

        case Ability_Id.tide_kraken_shell: {
            const armor = field_change_delta(Unit_Field.armor, unit, unit, Ability_Id.tide_kraken_shell, 3);

            target_deltas.push(armor);

            break;
        }

        case Ability_Id.luna_lunar_blessing: {
            for (const target of battle.units) {
                // Even if dead
                if (target.owner_player_id == unit.owner_player_id) {
                    const effect = apply_ability_effect_delta({
                        ability_id: Ability_Id.luna_lunar_blessing,
                        delta: field_change_delta(Unit_Field.attack_bonus, unit, target, ability.id, ability.attack_bonus)
                    });

                    target_deltas.push(effect);
                }
            }

            break;
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
            on_ability_received(battle, unit, ability, delta.received_from_enemy_kill, target_deltas);
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
                for (const unit of battle.units) {
                    if (unit.dead) continue;

                    for (const modifier of unit.modifiers) {
                        if (modifier.duration_remaining == 0) {
                            new_deltas.push({
                                type: Delta_Type.modifier_removed,
                                modifier_id: modifier.id
                            });

                            for (let index = 0; index < battle.modifiers.length; index++) {
                                const modifier_data = battle.modifiers[index];

                                if (modifier_data.id == modifier.id) {
                                    push_modifier_removed_deltas(battle, modifier_data, new_deltas);

                                    battle.modifiers.splice(index, 1);
                                    index--;
                                }
                            }
                        }
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

export function try_take_turn_action(battle: Battle_Record, player: Battle_Player, action: Turn_Action): Delta[] | undefined {
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

    if (!collapsed_anything) {
        return;
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
    const battle_players: Battle_Player[] = players.map(player => ({
        id: player.id,
        name: player.name,
        hand: [],
        has_used_a_card_this_turn: false
    }));

    const battle: Battle_Record = {
        id: battle_id_auto_increment++,
        delta_head: 0,
        unit_id_auto_increment: 0,
        modifier_id_auto_increment: 0,
        card_id_auto_increment: 0,
        modifiers: [],
        units: [],
        players: battle_players,
        deltas: [],
        cells: [],
        grid_size: xy(12, 12),
        turning_player_index: 0,
        finished: false
    };

    fill_grid(battle);

    const spawn_deltas = [
        draw_hero_card(battle, battle_players[0], Unit_Type.sniper),
        draw_hero_card(battle, battle_players[0], Unit_Type.pudge),
        draw_hero_card(battle, battle_players[0], Unit_Type.tidehunter),
        draw_hero_card(battle, battle_players[0], Unit_Type.luna),

        draw_hero_card(battle, battle_players[1], Unit_Type.sniper),
        draw_hero_card(battle, battle_players[1], Unit_Type.pudge),
        draw_hero_card(battle, battle_players[1], Unit_Type.tidehunter),
        draw_hero_card(battle, battle_players[1], Unit_Type.luna)
    ];

    collapse_deltas(battle, battle.delta_head, spawn_deltas);

    battles.push(battle);

    return battle.id;
}