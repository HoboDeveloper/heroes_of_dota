import {Player, report_battle_over} from "./server";
import {readFileSync} from "fs";
import {submit_chat_message} from "./chat";
import {Battleground, Spawn_Type} from "./battleground";
import {XY} from "./common";

eval(readFileSync("dist/battle_sim.js", "utf8"));

let battle_id_auto_increment = 0;

export type Battle_Record = Battle & {
    id: number
    entity_id_auto_increment: number
    finished: boolean
    turn_index: number
    random_seed: number
    deferred_actions: Deferred_Action[]
    creep_targets: Map<Creep, Unit>
}

const battles: Battle_Record[] = [];

const enum Creep_Retaliation_Result {
    ok,
    target_lost,
    cant_act
}

type Deferred_Action = () => void

export function random_int_range(lower_bound: number, upper_bound: number) {
    const range = upper_bound - lower_bound;

    return lower_bound + Math.floor(Math.random() * range);
}

export function random_int_up_to(upper_bound: number) {
    return Math.floor(Math.random() * upper_bound);
}

export function random_in_array<T>(array: T[], length = array.length): T | undefined {
    if (length == 0) return;

    return array[random_int_up_to(length)];
}

function defer(battle: Battle_Record, action: () => void) {
    battle.deferred_actions.push(action);
}

function defer_delta(battle: Battle_Record, supplier: () => Delta | undefined) {
    battle.deferred_actions.push(() => {
        const delta = supplier();

        if (delta) {
            battle.deltas.push(delta);
        }
    });
}

type Scan_Result_Hit = {
    hit: true,
    unit: Unit
}

type Scan_Result_Missed = {
    hit: false,
    final_point: XY
}

function scan_for_unit_in_direction(
    battle: Battle,
    from_exclusive: XY,
    to: XY,
    max_scan_distance: number,
    direction_normal: XY = direction_normal_between_points(from_exclusive, to)
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

function query_units_in_rectangular_area_around_point(battle: Battle, from_exclusive: XY, distance_inclusive: number): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (!is_unit_a_valid_target(unit)) continue;

        const unit_position = unit.position;
        const distance = rectangular(unit_position, from_exclusive);

        if (distance > 0 && distance <= distance_inclusive) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_for_no_target_ability(battle: Battle, caster: Unit, targeting: Ability_Targeting): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (!is_unit_a_valid_target(unit)) continue;

        if (ability_targeting_fits(targeting, caster.position, unit.position)) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_with_selector(battle: Battle, from: XY, target: XY, selector: Ability_Target_Selector): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (!is_unit_a_valid_target(unit)) continue;

        if (ability_selector_fits(selector, from, target, unit.position)) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_for_point_target_ability(battle: Battle, caster: Unit, target: XY, targeting: Ability_Targeting): Unit[] {
    return query_units_with_selector(battle, caster.position, target, targeting.selector);
}

function apply_ability_effect_delta<T extends Ability_Effect>(effect: T): Delta_Ability_Effect_Applied<T> {
    return {
        type: Delta_Type.ability_effect_applied,
        effect: effect
    }
}

function unit_health_change(target: Unit, change: number): Unit_Health_Change {
    return {
        change: health_change(target, change),
        target_unit_id: target.id
    }
}

function health_change(target: Unit, change: number): Health_Change {
    return {
        new_value: Math.max(0, Math.min(target.max_health, target.health + change)),
        value_delta: change
    }
}

function convert_field_changes(changes: [Modifier_Field, number][]): Modifier_Change_Field_Change[] {
    return changes.map(change => {
        return <Modifier_Change_Field_Change> {
            type: Modifier_Change_Type.field_change,
            field: change[0],
            delta: change[1]
        };
    });
}

function new_modifier(battle: Battle_Record, id: Modifier_Id, ...changes: [Modifier_Field, number][]): Modifier_Application {
    return {
        modifier_id: id,
        modifier_handle_id: get_next_entity_id(battle),
        changes: convert_field_changes(changes)
    }
}

function new_timed_modifier(battle: Battle_Record, id: Modifier_Id, duration: number, ...changes: [Modifier_Field, number][]): Modifier_Application {
    return {
        modifier_id: id,
        modifier_handle_id: get_next_entity_id(battle),
        changes: convert_field_changes(changes),
        duration: duration
    }
}

function perform_spell_cast_no_target(battle: Battle_Record, player: Battle_Player, spell: Card_Spell_No_Target): Delta_Use_No_Target_Spell {
    const base: Delta_Use_No_Target_Spell_Base = {
        type: Delta_Type.use_no_target_spell,
        player_id: player.id
    };

    const owned_units = battle.units.filter(unit => is_unit_a_valid_target(unit) && player_owns_unit(player, unit));

    switch (spell.spell_id) {
        case Spell_Id.mekansm: {
            return {
                ...base,
                spell_id: spell.spell_id,
                targets: owned_units.map(target => ({
                    target_unit_id: target.id,
                    change: health_change(target, spell.heal),
                    modifier: new_timed_modifier(battle, Modifier_Id.spell_mekansm, spell.duration, [Modifier_Field.armor_bonus, spell.armor])
                }))
            }
        }
    }
}

function perform_spell_cast_unit_target(battle: Battle_Record, player: Battle_Player, target: Unit, spell: Card_Spell_Unit_Target): Delta_Use_Unit_Target_Spell {
    const base: Delta_Use_Unit_Target_Spell_Base = {
        type: Delta_Type.use_unit_target_spell,
        player_id: player.id,
        target_id: target.id
    };

    switch (spell.spell_id) {
        case Spell_Id.euls_scepter: {
            return {
                ...base,
                spell_id: spell.spell_id,
                modifier: new_timed_modifier(battle, Modifier_Id.spell_euls_scepter, 1, [ Modifier_Field.state_out_of_the_game_counter, 1 ])
            }
        }
    }
}

function perform_ability_cast_ground(battle: Battle_Record, unit: Unit, ability: Ability_Ground_Target, target: XY): Delta_Ground_Target_Ability{
    const base: Delta_Ground_Target_Ability_Base = {
        type: Delta_Type.use_ground_target_ability,
        unit_id: unit.id,
        target_position: target,
    };

    function calculate_basic_attack_damage_to_target(target: Unit) {
        return Math.max(0, unit.attack_damage + unit.attack_bonus - target.armor);
    }

    switch (ability.id) {
        case Ability_Id.basic_attack: {
            const scan = scan_for_unit_in_direction(battle, unit.position, target, ability.targeting.line_length);

            if (scan.hit) {
                const damage = calculate_basic_attack_damage_to_target(scan.unit);

                return {
                    ...base,
                    ability_id: Ability_Id.basic_attack,
                    result: {
                        hit: true,
                        target_unit_id: scan.unit.id,
                        damage_dealt: health_change(scan.unit, -damage)
                    }
                };
            } else {
                return {
                    ...base,
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
            const direction = direction_normal_between_points(unit.position, target);
            const scan = scan_for_unit_in_direction(battle, unit.position, target, distance, direction);

            if (scan.hit) {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: true,
                        target_unit_id: scan.unit.id,
                        damage_dealt: health_change(scan.unit, -ability.damage),
                        move_target_to: xy(unit.position.x + direction.x, unit.position.y + direction.y)
                    }
                };
            } else {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: { hit: false, final_point: scan.final_point }
                }
            }
        }

        case Ability_Id.skywrath_mystic_flare: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting).map(target => ({
                unit: target,
                damage_applied: 0
            }));

            let remaining_targets = targets.length;
            let remaining_damage = ability.damage;

            for (; remaining_damage > 0 && remaining_targets > 0; remaining_damage--) {
                const target_index = random_int_up_to(remaining_targets);
                const random_target = targets[target_index];

                random_target.damage_applied++;

                if (random_target.damage_applied == random_target.unit.health) {
                    const last_target = targets[remaining_targets - 1];

                    targets[remaining_targets - 1] = random_target;
                    targets[target_index] = last_target;

                    remaining_targets--;
                }
            }

            return {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => unit_health_change(target.unit, -target.damage_applied)),
                damage_remaining: remaining_damage
            }
        }

        case Ability_Id.dragon_knight_breathe_fire: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting)
                .map(target => unit_health_change(target, -ability.damage));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.dragon_knight_elder_dragon_form_attack: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting)
                .map(target => unit_health_change(target, -calculate_basic_attack_damage_to_target(target)));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.lion_impale: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting).map(target => ({
                target_unit_id: target.id,
                change: health_change(target, -ability.damage),
                modifier: new_timed_modifier(battle, Modifier_Id.tide_ravage, 1, [Modifier_Field.state_stunned_counter, 1])
            }));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            };
        }
    }
}

function perform_ability_cast_no_target(battle: Battle_Record, unit: Unit, ability: Ability_No_Target): Delta_Use_No_Target_Ability {
    const base: Delta_Use_No_Target_Ability_Base = {
        type: Delta_Type.use_no_target_ability,
        unit_id: unit.id,
    };

    switch (ability.id) {
        case Ability_Id.pudge_rot: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting)
                .map(target => unit_health_change(target, -ability.damage));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.tide_anchor_smash: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                target_unit_id: target.id,
                change: health_change(target, -ability.damage),
                modifier: new_timed_modifier(battle, Modifier_Id.tide_anchor_smash, 1, [Modifier_Field.attack_bonus, -ability.attack_reduction])
            }));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            };
        }

        case Ability_Id.tide_ravage: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                target_unit_id: target.id,
                change: health_change(target, -ability.damage),
                modifier: new_timed_modifier(battle, Modifier_Id.tide_ravage, 1, [Modifier_Field.state_stunned_counter, 1])
            }));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
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

            const effects = targets.map(target => unit_health_change(target.unit, -target.beams_applied));

            return {
                ...base,
                ability_id: ability.id,
                missed_beams: remaining_beams,
                targets: effects
            };
        }

        case Ability_Id.skywrath_concussive_shot: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const enemies = targets.filter(target => !are_units_allies(unit, target));
            const allies = targets.filter(target => are_units_allies(unit, target));
            const target = enemies.length > 0 ? random_in_array(enemies) : random_in_array(allies);

            if (target) {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: true,
                        target_unit_id: target.id,
                        damage: health_change(target, -ability.damage),
                        modifier: new_timed_modifier(
                            battle,
                            Modifier_Id.skywrath_concussive_shot,
                            ability.duration,
                            [Modifier_Field.move_points_bonus, -ability.move_points_reduction]
                        )
                    }
                }
            } else {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: false
                    }
                }
            }
        }

        case Ability_Id.dragon_knight_elder_dragon_form: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: {
                    modifier_id: Modifier_Id.dragon_knight_elder_dragon_form,
                    modifier_handle_id: get_next_entity_id(battle),
                    changes: [{
                        type: Modifier_Change_Type.ability_swap,
                        swap_to: Ability_Id.dragon_knight_elder_dragon_form_attack,
                        original_ability: Ability_Id.basic_attack
                    }],
                    duration: ability.duration
                },
            }
        }
    }
}

function perform_ability_cast_unit_target(battle: Battle_Record, unit: Unit, ability: Ability_Unit_Target, target: Unit): Delta_Unit_Target_Ability {
    const base: Delta_Unit_Target_Ability_Base = {
        type: Delta_Type.use_unit_target_ability,
        unit_id: unit.id,
        target_unit_id: target.id,
    };

    switch (ability.id) {
        case Ability_Id.pudge_dismember: {
            return {
                ...base,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage),
                health_restored: health_change(target, ability.damage)
            };
        }

        case Ability_Id.tide_gush: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: new_timed_modifier(battle, Modifier_Id.tide_gush, 1, [Modifier_Field.move_points_bonus, -ability.move_points_reduction]),
                damage_dealt: health_change(target, -ability.damage),
            };
        }

        case Ability_Id.luna_lucent_beam: {
            return {
                ...base,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage)
            };
        }

        case Ability_Id.skywrath_ancient_seal: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: new_timed_modifier(battle, Modifier_Id.skywrath_ancient_seal, ability.duration, [Modifier_Field.state_silenced_counter, 1]),
            }
        }

        case Ability_Id.dragon_knight_dragon_tail: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: new_timed_modifier(battle, Modifier_Id.dragon_knight_dragon_tail, 1, [Modifier_Field.state_stunned_counter, 1]),
                damage_dealt: health_change(target, -ability.damage)
            }
        }

        case Ability_Id.lion_hex: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: new_timed_modifier(battle, Modifier_Id.lion_hex, ability.duration,
                    [Modifier_Field.state_silenced_counter, 1],
                    [Modifier_Field.state_disarmed_counter, 1],
                    [Modifier_Field.move_points_bonus, -ability.move_points_reduction]
                )
            }
        }

        case Ability_Id.lion_finger_of_death: {
            return {
                ...base,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage)
            }
        }
    }
}

function equip_item(battle: Battle_Record, hero: Hero, item: Item): Delta_Equip_Item {
    switch (item.id) {
        case Item_Id.refresher_shard: {
            const changes: {
                ability_id: Ability_Id,
                charges_remaining: number
            }[] = [];

            for (const ability of hero.abilities) {
                if (ability.type != Ability_Type.passive) {
                    changes.push({
                        ability_id: ability.id,
                        charges_remaining: ability.charges
                    })
                }
            }

            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                charge_changes: changes
            }
        }

        case Item_Id.boots_of_travel: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: new_modifier(battle, Modifier_Id.item_boots_of_travel, [Modifier_Field.move_points_bonus, item.move_points_bonus])
            }
        }

        case Item_Id.divine_rapier: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: new_modifier(battle, Modifier_Id.item_divine_rapier, [Modifier_Field.attack_bonus, item.damage_bonus])
            }
        }

        case Item_Id.assault_cuirass: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: new_modifier(battle, Modifier_Id.item_assault_cuirass, [Modifier_Field.armor_bonus, item.armor_bonus])
            }
        }

        case Item_Id.tome_of_knowledge: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                new_level: Math.min(hero.level + 1, max_unit_level)
            }
        }

        case Item_Id.heart_of_tarrasque: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: new_modifier(battle, Modifier_Id.item_heart_of_tarrasque, [Modifier_Field.health_bonus, item.health_bonus])
            }
        }

        case Item_Id.satanic: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: new_modifier(battle, Modifier_Id.item_satanic)
            }
        }

        case Item_Id.mask_of_madness: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: new_modifier(battle, Modifier_Id.item_mask_of_madness,
                    [Modifier_Field.state_silenced_counter, 1],
                    [Modifier_Field.attack_bonus, item.damage_bonus]
                )
            }
        }
    }
}

function on_target_dealt_damage_by_attack(battle: Battle_Record, source: Unit, target: Unit, damage: number): void {
    if (source.supertype == Unit_Supertype.hero) {
        defer_delta(battle, () => {
            if (source.items.some(item => item.id == Item_Id.satanic)) {
                return {
                    type: Delta_Type.health_change,
                    source_unit_id: source.id,
                    target_unit_id: source.id,
                    ...health_change(source, Math.max(0, damage)) // In case we have a healing attack, I guess
                };
            }
        });
    }

    for (const ability of source.abilities) {
        if (source.supertype == Unit_Supertype.hero) {
            if (source.level < ability.available_since_level) continue;
        }

        switch (ability.id) {
            case Ability_Id.luna_moon_glaive: {
                defer_delta(battle, () => {
                    const targets = query_units_in_rectangular_area_around_point(battle, target.position, 2);
                    const allies = targets.filter(target => are_units_allies(source, target) && target != source);
                    const enemies = targets.filter(target => !are_units_allies(source, target));
                    const glaive_target = enemies.length > 0 ? random_in_array(enemies) : random_in_array(allies);

                    if (glaive_target) {
                        return apply_ability_effect_delta({
                            ability_id: ability.id,
                            source_unit_id: source.id,
                            target_unit_id: glaive_target.id,
                            original_target_id: target.id,
                            damage_dealt: health_change(glaive_target, -damage)
                        });
                    }
                })
            }
        }
    }
}

function turn_action_to_new_deltas(battle: Battle_Record, player: Battle_Player, action: Turn_Action): Delta[] | undefined {
    function find_valid_unit_for_action(id: number): Unit | undefined {
        const unit = find_valid_target_unit(id);

        if (!unit) return;
        if (unit.has_taken_an_action_this_turn) return;
        if (!player_owns_unit(player, unit)) return;
        if (is_unit_stunned(unit)) return;

        return unit;
    }

    function find_valid_target_unit(id: number): Unit | undefined {
        const unit = find_unit_by_id(battle, id);

        if (!unit) return;
        if (!is_unit_a_valid_target(unit)) return;

        return unit;
    }

    function find_valid_unit_and_authorize_ability(unit_id: number, ability_id: Ability_Id): { unit: Unit, ability: Ability_Active } | undefined {
        const unit = find_valid_unit_for_action(unit_id);

        if (!unit) return;

        const ability_use = authorize_ability_use_by_unit(unit, ability_id);

        if (!ability_use.success) return;

        const ability = ability_use.ability;

        if (ability.type == Ability_Type.passive) return;

        return { unit: unit, ability: ability };
    }

    function decrement_charges(actors: { unit: Unit, ability: Ability_Active }): Delta_Set_Ability_Charges_Remaining {
        return {
            type: Delta_Type.set_ability_charges_remaining,
            unit_id: actors.unit.id,
            ability_id: actors.ability.id,
            charges_remaining: actors.ability.charges_remaining - 1
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
                decrement_charges(actors),
                cast
            ]
        }

        case Action_Type.unit_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.target_unit) return;

            const target = find_valid_target_unit(action.target_id);

            if (!target) return;
            if (!ability_targeting_fits(actors.ability.targeting, actors.unit.position, target.position)) return;

            const cast = perform_ability_cast_unit_target(battle, actors.unit, actors.ability, target);

            if (!cast) return;

            return [
                decrement_charges(actors),
                cast
            ]
        }

        case Action_Type.ground_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.target_ground) return;

            const cell = grid_cell_at(battle, action.to);

            if (!cell) return;
            if (!ability_targeting_fits(actors.ability.targeting, actors.unit.position, action.to)) return;

            const cast = perform_ability_cast_ground(battle, actors.unit, actors.ability, action.to);

            if (!cast) return;

            return [
                decrement_charges(actors),
                cast
            ];
        }

        case Action_Type.use_hero_card: {
            const card = find_player_card_by_id(player, action.card_id);

            if (!card) return;
            if (card.type != Card_Type.hero) return;
            if (player.has_used_a_card_this_turn) return;

            const cell = grid_cell_at(battle, action.at);

            if (!cell || cell.occupied) return;

            const zone = player.deployment_zone;
            const is_in_zone =
                action.at.x >= zone.min_x &&
                action.at.y >= zone.min_y &&
                action.at.x <  zone.max_x &&
                action.at.y <  zone.max_y;

            if (!is_in_zone) return;

            return [
                use_card(player, card),
                spawn_hero(battle, player, action.at, card.hero_type)
            ]
        }

        case Action_Type.use_unit_target_spell_card: {
            const card = find_player_card_by_id(player, action.card_id);

            if (!card) return;
            if (card.type != Card_Type.spell) return;
            if (card.spell_type != Spell_Type.unit_target) return;
            if (player.has_used_a_card_this_turn) return;

            const target = find_valid_target_unit(action.unit_id);

            if (!target) return;

            return [
                use_card(player, card),
                perform_spell_cast_unit_target(battle, player, target, card)
            ]
        }

        case Action_Type.use_no_target_spell_card: {
            const card = find_player_card_by_id(player, action.card_id);

            if (!card) return;
            if (card.type != Card_Type.spell) return;
            if (card.spell_type != Spell_Type.no_target) return;
            if (player.has_used_a_card_this_turn) return;

            return [
                use_card(player, card),
                perform_spell_cast_no_target(battle, player, card)
            ]
        }

        case Action_Type.purchase_item: {
            // TODO stunned units can't buy items, decide if this is ok
            const unit = find_valid_unit_for_action(action.unit_id);
            const shop = find_shop_by_id(battle, action.shop_id);

            if (!unit) break;
            if (!shop) break;
            if (unit.supertype != Unit_Supertype.hero) break;
            if (!is_point_in_shop_range(unit.position, shop)) break;

            const item = shop.items.find(item => item.id == action.item_id);

            if (!item) break;

            const player = find_player_by_id(battle, unit.owner_player_id);

            if (!player) break;

            if (player.gold < item.gold_cost) break;

            const purchase: Delta = {
                type: Delta_Type.purchase_item,
                unit_id: unit.id,
                shop_id: shop.id,
                item_id: action.item_id,
                gold_cost: item.gold_cost
            };

            const equip = equip_item(battle, unit, item);

            return [purchase, equip];
        }

        case Action_Type.pick_up_rune: {
            const unit = find_valid_unit_for_action(action.unit_id);
            const rune = battle.runes.find(rune => rune.id == action.rune_id);

            if (!unit) break;
            if (!rune) break;
            if (unit.supertype != Unit_Supertype.hero) break;

            const [could_find_path, cost] = can_find_path(battle, unit.position, rune.position, unit.move_points, true);

            if (!could_find_path) {
                return;
            }

            const base = {
                unit_id: unit.id,
                rune_id: rune.id,
                at: rune.position,
                move_cost: cost
            };

            switch (rune.type) {
                case Rune_Type.bounty: {
                    return [{
                        ...base,
                        type: Delta_Type.rune_pick_up,
                        rune_type: rune.type,
                        gold_gained: 10
                    }];
                }

                case Rune_Type.regeneration: {
                    return [{
                        ...base,
                        type: Delta_Type.rune_pick_up,
                        rune_type: rune.type,
                        heal: health_change(unit, unit.max_health - unit.health)
                    }];
                }

                case Rune_Type.haste: {
                    return [{
                        ...base,
                        type: Delta_Type.rune_pick_up,
                        rune_type: rune.type,
                        modifier: new_timed_modifier(battle, Modifier_Id.rune_haste, 3, [Modifier_Field.move_points_bonus, 3])
                    }];
                }

                case Rune_Type.double_damage: {
                    return [{
                        ...base,
                        type: Delta_Type.rune_pick_up,
                        rune_type: rune.type,
                        modifier: new_timed_modifier(battle, Modifier_Id.rune_double_damage, 3, [Modifier_Field.attack_bonus, unit.attack_damage])
                    }];
                }

                default: unreachable(rune.type);
            }

            break;
        }

        case Action_Type.end_turn: {
            battle.turn_index++;

            return [{
                type: Delta_Type.end_turn
            }];
        }

        default: unreachable(action);
    }
}

function spawn_hero(battle: Battle_Record, owner: Battle_Player, at_position: XY, type: Hero_Type) : Delta_Hero_Spawn {
    const id = get_next_entity_id(battle);

    return {
        type: Delta_Type.hero_spawn,
        at_position: at_position,
        owner_id: owner.id,
        hero_type: type,
        unit_id: id
    };
}

function spawn_creep(battle: Battle_Record, at_position: XY, facing: XY): Delta_Creep_Spawn {
    const id = get_next_entity_id(battle);

    return {
        type: Delta_Type.creep_spawn,
        at_position: at_position,
        facing: facing,
        unit_id: id
    };
}

function spawn_tree(battle: Battle_Record, at_position: XY): Delta_Tree_Spawn {
    const id = get_next_entity_id(battle);

    return {
        type: Delta_Type.tree_spawn,
        tree_id: id,
        at_position: at_position
    }
}

function draw_hero_card(battle: Battle_Record, player: Battle_Player, hero_type: Hero_Type): Delta_Draw_Hero_Card {
    return {
        type: Delta_Type.draw_hero_card,
        player_id: player.id,
        hero_type: hero_type,
        card_id: get_next_entity_id(battle)
    }
}

function draw_spell_card(battle: Battle_Record, player: Battle_Player, spell_id: Spell_Id): Delta_Draw_Spell_Card {
    return {
        type: Delta_Type.draw_spell_card,
        player_id: player.id,
        spell_id: spell_id,
        card_id: get_next_entity_id(battle)
    }
}

function use_card(player: Battle_Player, card: Card): Delta_Use_Card {
    return {
        type: Delta_Type.use_card,
        player_id: player.id,
        card_id: card.id
    }
}

function get_next_entity_id(battle: Battle_Record) {
    return battle.entity_id_auto_increment++;
}

function try_compute_battle_winner_player_id(battle: Battle_Record): number | undefined {
    if (battle.turn_index < 5) {
        return undefined;
    }

    let last_alive_unit_player_id: number | undefined = undefined;

    for (const unit of battle.units) {
        if (!unit.dead && unit.supertype != Unit_Supertype.creep) {
            if (last_alive_unit_player_id == undefined) {
                last_alive_unit_player_id = unit.owner_player_id;
            } else if (last_alive_unit_player_id != unit.owner_player_id) {
                return undefined;
            }
        }
    }

    return last_alive_unit_player_id;
}

function get_gold_for_killing(target: Unit): number {
    switch (target.supertype) {
        case Unit_Supertype.hero: {
            return 4 * target.level;
        }

        case Unit_Supertype.creep: {
            return random_int_range(4, 6);
        }
    }
}

function creep_try_retaliate(battle: Battle_Record, creep: Creep, target: Unit): Creep_Retaliation_Result {
    const attack = creep.attack;

    // TODO use action authorization functions
    if (!is_unit_a_valid_target(creep)) return Creep_Retaliation_Result.cant_act;
    if (is_unit_stunned(creep)) return Creep_Retaliation_Result.cant_act;
    if (is_unit_disarmed(creep)) return Creep_Retaliation_Result.cant_act;
    if (creep.has_taken_an_action_this_turn) return Creep_Retaliation_Result.cant_act;
    if (attack.type == Ability_Type.passive) return Creep_Retaliation_Result.cant_act;
    if (!is_unit_a_valid_target(target)) return Creep_Retaliation_Result.target_lost;

    const costs = populate_path_costs(battle, creep.position)!;

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);
        const move_cost = costs.cell_index_to_cost[index];

        if (move_cost <= creep.move_points) {
            if (ability_targeting_fits(attack.targeting, cell.position, target.position)) {
                defer_delta(battle, () => ({
                    type: Delta_Type.unit_move,
                    to_position: cell.position,
                    unit_id: creep.id,
                    move_cost: move_cost
                }));

                if (attack.type == Ability_Type.target_ground) {
                    defer_delta(battle, () => perform_ability_cast_ground(battle, creep, attack, target.position));

                    battle.creep_targets.set(creep, target);

                    return Creep_Retaliation_Result.ok;
                }
            }
        }
    }

    return Creep_Retaliation_Result.target_lost;
}

function server_change_health(battle: Battle_Record, source: Source, target: Unit, change: Health_Change) {
    const killed = change_health_default(battle, source, target, change);

    if (source.type == Source_Type.unit) {
        const attacker = source.unit;

        if (source.ability_id == attacker.attack.id) {
            on_target_dealt_damage_by_attack(battle, attacker, target, -change.value_delta);
        }

        if (killed) {
            if (!are_units_allies(attacker, target) && attacker.supertype != Unit_Supertype.creep) {
                const bounty = get_gold_for_killing(target);

                defer_delta(battle, () => ({
                    type: Delta_Type.gold_change,
                    player_id: attacker.owner_player_id,
                    change: bounty
                }));

                defer_delta(battle, () => {
                    if (attacker.level < max_unit_level) {
                        return {
                            type: Delta_Type.level_change,
                            unit_id: attacker.id,
                            new_level: attacker.level + 1
                        };
                    }
                });
            }
        } else {
            if (target.supertype == Unit_Supertype.creep) {
                defer(battle, () => creep_try_retaliate(battle, target, attacker));
            }
        }
    }

    return killed;
}

function server_end_turn(battle: Battle_Record) {
    end_turn_default(battle);

    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (!modifier.permanent && modifier.duration_remaining == 0) {
                defer_delta(battle, () => ({
                    type: Delta_Type.modifier_removed,
                    modifier_handle_id: modifier.handle_id
                }));
            }
        }

        if (!unit.dead && unit.supertype == Unit_Supertype.hero) {
            for (const item of unit.items) {
                if (item.id == Item_Id.heart_of_tarrasque) {
                    defer_delta(battle, () => ({
                        type: Delta_Type.health_change,
                        source_unit_id: unit.id,
                        target_unit_id: unit.id,
                        ...health_change(unit, item.regeneration_per_turn)
                    }));
                }
            }
        }
    }

    defer_delta(battle, () => ({
        type: Delta_Type.start_turn,
        of_player_id: battle.players[battle.turning_player_index].id
    }));

    for (const creep of battle.units) {
        if (creep.supertype == Unit_Supertype.creep) {
            defer(battle, () => {
                const target = battle.creep_targets.get(creep);

                if (target) {
                    if (creep_try_retaliate(battle, creep, target) == Creep_Retaliation_Result.target_lost) {
                        battle.creep_targets.delete(creep);
                    }
                }
            });
        }
    }
}

function check_battle_over(battle: Battle_Record) {
    const possible_winner = try_compute_battle_winner_player_id(battle);

    if (possible_winner != undefined) {
        defer_delta(battle, () => ({
            type: Delta_Type.game_over,
            winner_player_id: possible_winner
        }));

        battle.finished = true;

        report_battle_over(battle, possible_winner);
    }
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

    if (new_deltas) {
        submit_battle_deltas(battle, new_deltas);

        return get_battle_deltas_after(battle, initial_head);
    } else {
        return;
    }
}

function submit_battle_deltas(battle: Battle_Record, battle_deltas: Delta[]) {
    battle.deltas.push(...battle_deltas);

    while (battle.deltas.length != battle.delta_head || battle.deferred_actions.length > 0) {
        catch_up_to_head(battle);

        if (!battle.finished) {
            check_battle_over(battle);
        }

        const action = battle.deferred_actions.shift();

        if (action) {
            action();
        }
    }
}

// Hacky, can cause problems
export function random_unoccupied_point_in_deployment_zone(battle: Battle_Record, zone: Deployment_Zone): XY {
    while (true) {
        const x = random_int_range(zone.min_x, zone.max_x);
        const y = random_int_range(zone.min_y, zone.max_y);
        const cell = grid_cell_at_raw(battle, x, y);

        if (cell && !cell.occupied) {
            return cell.position;
        }
    }
}

export function get_battle_deltas_after(battle: Battle, head: number): Delta[] {
    return battle.deltas.slice(head);
}

export function find_battle_by_id(id: number): Battle_Record | undefined {
    return battles.find(battle => battle.id == id);
}

export function get_all_battles(): Battle_Record[] {
    return battles;
}

export function start_battle(players: Player[], battleground: Battleground): number {
    const battle_players: Battle_Participant_Info[] = players.map(player => ({
        id: player.id,
        name: player.name,
        deployment_zone: player == players[0] ? battleground.deployment_zones[0] : battleground.deployment_zones[1]
    }));

    const battle: Battle_Record = {
        ...make_battle(battle_players, battleground.grid_size.x, battleground.grid_size.y),
        id: battle_id_auto_increment++,
        turn_index: 0,
        entity_id_auto_increment: 0,
        deferred_actions: [],
        random_seed: random_int_range(0, 65536),
        finished: false,
        creep_targets: new Map(),
        change_health: server_change_health,
        end_turn: server_end_turn
    };

    fill_grid(battle);

    function get_starting_gold(player: Battle_Player): Delta_Gold_Change {
        return {
            type: Delta_Type.gold_change,
            player_id: player.id,
            change: 5
        }
    }

    const spell_collection = [
        Spell_Id.euls_scepter,
        Spell_Id.mekansm
    ];

    const spawn_deltas: Delta[] = [];

    for (const player of battle.players) {
        spawn_deltas.push(get_starting_gold(player));

        for (const spell_id of spell_collection) {
            spawn_deltas.push(draw_spell_card(battle, player, spell_id));
        }

        const hero_collection = enum_values<Hero_Type>().filter(id => id != Hero_Type.sniper && id != Hero_Type.ursa);

        for (let index = 3; index > 0; index--) {
            const index = random_int_up_to(hero_collection.length);
            const hero_type = hero_collection.splice(index, 1)[0];

            defer_delta(battle, () => {
                const spawn_at = random_unoccupied_point_in_deployment_zone(battle, player.deployment_zone);

                return spawn_hero(battle, player, spawn_at, hero_type);
            });
        }
    }

    for (const spawn of battleground.spawns) {
        switch (spawn.type) {
            case Spawn_Type.rune: {
                const random_rune = random_in_array(enum_values<Rune_Type>())!;

                spawn_deltas.push({
                    type: Delta_Type.rune_spawn,
                    rune_type: random_rune,
                    rune_id: get_next_entity_id(battle),
                    at: spawn.at
                });

                break;
            }

            case Spawn_Type.shop: {
                const all_items = enum_values<Item_Id>();
                const items: Item_Id[] = [];

                for (let remaining = 3; remaining; remaining--) {
                    const index = random_int_up_to(all_items.length);
                    items.push(...all_items.splice(index, 1));
                }

                spawn_deltas.push({
                    type: Delta_Type.shop_spawn,
                    shop_id: get_next_entity_id(battle),
                    item_pool: items,
                    at: spawn.at,
                    facing: spawn.facing
                });

                break;
            }

            case Spawn_Type.creep: {
                spawn_deltas.push(spawn_creep(battle, spawn.at, spawn.facing));

                break;
            }

            case Spawn_Type.tree: {
                spawn_deltas.push(spawn_tree(battle, spawn.at));

                break
            }

            default: unreachable(spawn);
        }
    }

    submit_battle_deltas(battle, spawn_deltas);

    battles.push(battle);

    return battle.id;
}

export function cheat(battle: Battle_Record, player: Player, cheat: string, selected_unit_id: number) {
    const parts = cheat.split(" ");
    const battle_player = battle.players.find(battle_player => battle_player.id == player.id);

    if (!battle_player) return;

    function refresh_unit(battle: Battle_Record, unit: Unit) {
        const deltas: Delta[] = [
            {
                type: Delta_Type.health_change,
                source_unit_id: unit.id,
                target_unit_id: unit.id,
                new_value: unit.max_health,
                value_delta: unit.max_health - unit.health
            }
        ];

        for (const ability of unit.abilities) {
            if (ability.type != Ability_Type.passive && ability.charges_remaining != ability.charges) {
                deltas.push({
                    type: Delta_Type.set_ability_charges_remaining,
                    unit_id: unit.id,
                    ability_id: ability.id,
                    charges_remaining: (ability as Ability_Active).charges
                });
            }
        }

        submit_battle_deltas(battle, deltas);
    }

    switch (parts[0]) {
        case "dbg": {
            const messages = [
                `=========DEBUG=======`,
                `Battle ${battle.id}`,
                `Participants: ${battle.players[0].name} (id${battle.players[0].id}) and ${battle.players[1].name} (id${battle.players[1].id})`,
                `Deltas: ${battle.deltas.length} total, head at ${battle.delta_head}`,
                `Turning player: index ${battle.turning_player_index} (${battle.players[battle.turning_player_index].name})`,
            ];

            for (const message of messages) {
                submit_chat_message(player, message);
            }

            break;
        }

        case "gold": {
            submit_battle_deltas(battle, [ { type: Delta_Type.gold_change, player_id: player.id, change: 15 }]);

            break;
        }

        case "skipturn": {
            submit_battle_deltas(battle, [ { type: Delta_Type.end_turn } ]);

            break;
        }

        case "lvl": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;

            const new_lvl = parseInt(parts[1]);

            submit_battle_deltas(battle, [{
                type: Delta_Type.level_change,
                unit_id: selected_unit_id,
                new_level: new_lvl,
            }]);

            break;
        }

        case "ref": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;

            refresh_unit(battle, unit);

            break;
        }

        case "refall": {
            for (const unit of battle.units) {
                if (!unit.dead) {
                    refresh_unit(battle, unit);
                }
            }

            break;
        }

        case "killall": {
            for (const unit of battle.units) {
                if (!unit.dead) {
                    const delta: Delta_Health_Change = {
                        type: Delta_Type.health_change,
                        source_unit_id: unit.id,
                        target_unit_id: unit.id,
                        new_value: 0,
                        value_delta: -unit.health
                    };

                    submit_battle_deltas(battle, [ delta ]);
                }
            }

            break;
        }

        case "rune": {
            function rune_type(): Rune_Type {
                switch (parts[1]) {
                    case "h": return Rune_Type.haste;
                    case "r": return Rune_Type.regeneration;
                    case "d": return Rune_Type.double_damage;
                    case "b": return Rune_Type.bounty;
                    default: return random_in_array(enum_values<Rune_Type>())!
                }
            }

            const at = xy(4, 4);

            if (grid_cell_at_unchecked(battle, at).occupied) {
                break;
            }

            const delta: Delta_Rune_Spawn = {
                type: Delta_Type.rune_spawn,
                rune_id: get_next_entity_id(battle),
                rune_type: rune_type(),
                at: at
            };

            submit_battle_deltas(battle, [ delta ]);

            break;
        }

        case "spl": {
            submit_battle_deltas(battle, enum_values<Spell_Id>().map(id => draw_spell_card(battle, battle_player, id)));

            break;
        }

        case "heroes": {
            submit_battle_deltas(battle, enum_values<Hero_Type>().map(type => draw_hero_card(battle, battle_player, type)));

            break;
        }

        case "item": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;
            if (unit.supertype != Unit_Supertype.hero) break;

            submit_battle_deltas(battle, [ equip_item(battle, unit, item_id_to_item(parseInt(parts[1]))) ]);

            break;
        }
    }
}