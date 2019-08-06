import {Player, report_battle_over} from "./server";
import {readFileSync} from "fs";
import {submit_chat_message} from "./chat";

eval(readFileSync("dist/battle_sim.js", "utf8"));

let battle_id_auto_increment = 0;

export type Battle_Record = Battle & {
    id: number
    unit_id_auto_increment: number
    rune_id_auto_increment: number
    shop_id_auto_increment: number
    modifier_handle_id_auto_increment: number
    card_id_auto_increment: number
    finished: boolean
    turn_index: number
}

const battles: Battle_Record[] = [];

const default_bg = {
    grid_size: xy(13, 8),
    deployment_zone_width: 3
};

const battlegrounds: Battleground_Definition[] = [
    {
        grid_size: default_bg.grid_size,
        deployment_zones: [
            {
                min_x: 0,
                min_y: 0,
                max_x: default_bg.deployment_zone_width,
                max_y: default_bg.grid_size.y,
                face_x: 1,
                face_y: 0
            },
            {
                min_x: default_bg.grid_size.x - default_bg.deployment_zone_width,
                min_y: 0,
                max_x: default_bg.grid_size.x,
                max_y: default_bg.grid_size.y,
                face_x: -1,
                face_y: 0
            }
        ],
        spawns: [
            {
                type: Spawn_Type.rune,
                at: xy(6, 6)
            },
            {
                type: Spawn_Type.shop,
                at: xy(6, 1),
                facing: xy(0, 1)
            }
        ]
    }
];

declare const enum Spawn_Type {
    rune = 0,
    shop = 1
}

type Rune_Spawn = {
    type: Spawn_Type.rune
    at: XY
}

type Shop_Spawn = {
    type: Spawn_Type.shop
    at: XY
    facing: XY
}

type Battleground_Spawn = Rune_Spawn | Shop_Spawn;

type Battleground_Definition = {
    grid_size: XY
    deployment_zones: Deployment_Zone[]
    spawns: Battleground_Spawn[]
}

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
        if (unit.dead) continue;

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
        if (unit.dead) continue;

        if (ability_targeting_fits(targeting, caster.position, unit.position)) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_with_selector(battle: Battle, from: XY, target: XY, selector: Ability_Target_Selector): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (unit.dead) continue;

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
        modifier_handle_id: get_next_modifier_handle_id(battle),
        changes: convert_field_changes(changes)
    }
}

function new_timed_modifier(battle: Battle_Record, id: Modifier_Id, duration: number, ...changes: [Modifier_Field, number][]): Modifier_Application {
    return {
        modifier_id: id,
        modifier_handle_id: get_next_modifier_handle_id(battle),
        changes: convert_field_changes(changes),
        duration: duration
    }
}

function perform_ability_cast_ground(battle: Battle_Record, unit: Unit, ability: Ability & { type: Ability_Type.target_ground }, target: XY): Delta_Ground_Target_Ability | undefined {
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

        default: unreachable(ability.type);
    }
}

function perform_ability_cast_no_target(battle: Battle_Record, unit: Unit, ability: Ability & { type: Ability_Type.no_target }): Delta_Use_No_Target_Ability | undefined {
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
            const enemies = targets.filter(target => target.owner_player_id != unit.owner_player_id);
            const allies = targets.filter(target => target.owner_player_id == unit.owner_player_id);
            const target = enemies.length > 0 ? random_in_array(enemies) : random_in_array(allies);

            if (target) {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: true,
                        target_unit_id: target.id,
                        damage: health_change(target, -ability.damage),
                        duration: ability.duration,
                        modifier: new_modifier(
                            battle,
                            Modifier_Id.skywrath_concussive_shot,
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
                    modifier_handle_id: get_next_modifier_handle_id(battle),
                    changes: [{
                        type: Modifier_Change_Type.ability_swap,
                        swap_to: Ability_Id.dragon_knight_elder_dragon_form_attack,
                        original_ability: Ability_Id.basic_attack
                    }],
                    duration: ability.duration
                },
            }
        }

        default: unreachable(ability.type);
    }
}

function perform_ability_cast_unit_target(battle: Battle_Record, unit: Unit, ability: Ability & { type: Ability_Type.target_unit }, target: Unit): Delta_Unit_Target_Ability | undefined {
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

        default: unreachable(ability.type);
    }
}

function equip_item(battle: Battle_Record, unit: Unit, item_id: Item_Id): Delta_Equip_Item {
    switch (item_id) {
        case Item_Id.refresher_shard: {
            const changes: {
                ability_id: Ability_Id,
                charges_remaining: number
            }[] = [];

            for (const ability of unit.abilities) {
                if (ability.type != Ability_Type.passive) {
                    changes.push({
                        ability_id: ability.id,
                        charges_remaining: ability.charges
                    })
                }
            }

            return {
                type: Delta_Type.equip_item,
                unit_id: unit.id,
                item_id: item_id,
                charge_changes: changes
            }
        }

        case Item_Id.boots_of_travel: {
            return {
                type: Delta_Type.equip_item,
                unit_id: unit.id,
                item_id: item_id,
                modifier: new_modifier(battle, Modifier_Id.item_boots_of_travel, [Modifier_Field.move_points_bonus, 3])
            }
        }

        case Item_Id.divine_rapier: {
            return {
                type: Delta_Type.equip_item,
                unit_id: unit.id,
                item_id: item_id,
                modifier: new_modifier(battle, Modifier_Id.item_divine_rapier, [Modifier_Field.attack_bonus, 8])
            }
        }

        case Item_Id.assault_cuirass: {
            return {
                type: Delta_Type.equip_item,
                unit_id: unit.id,
                item_id: item_id,
                modifier: new_modifier(battle, Modifier_Id.item_assault_cuirass, [Modifier_Field.armor_bonus, 4])
            }
        }

        case Item_Id.tome_of_knowledge: {
            return {
                type: Delta_Type.equip_item,
                unit_id: unit.id,
                item_id: item_id,
                new_level: Math.min(unit.level + 1, max_unit_level)
            }
        }

        case Item_Id.heart_of_tarrasque: {
            return {
                type: Delta_Type.equip_item,
                unit_id: unit.id,
                item_id: item_id,
                modifier: new_modifier(battle, Modifier_Id.item_heart_of_tarrasque, [Modifier_Field.health_bonus, 10])
            }
        }

        case Item_Id.satanic: {
            return {
                type: Delta_Type.equip_item,
                unit_id: unit.id,
                item_id: item_id,
                modifier: new_modifier(battle, Modifier_Id.item_satanic)
            }
        }
    }
}

// TODO move into a battle_sim callback?
function on_target_attacked_pre_resolve(battle: Battle_Record, source: Unit, target: Unit, damage: number): Delta | undefined {
    for (const ability of source.abilities) {
        if (source.level < ability.available_since_level) continue;

        switch (ability.id) {
            case Ability_Id.luna_moon_glaive: {
                const is_ally = (target: Unit) => target.owner_player_id == source.owner_player_id;
                const targets = query_units_in_rectangular_area_around_point(battle, target.position, 2);
                const allies = targets.filter(target => is_ally(target) && target != source);
                const enemies = targets.filter(target => !is_ally(target));
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

            const target = find_unit_by_id(battle, action.target_id);

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

            const deltas: Delta[] = [
                decrement_charges(actors),
                cast
            ];

            if (cast.ability_id == Ability_Id.basic_attack) {
                if (cast.result.hit) {
                    const target = find_unit_by_id(battle, cast.result.target_unit_id)!;
                    const new_delta = on_target_attacked_pre_resolve(battle, actors.unit, target, -cast.result.damage_dealt.value_delta);

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

            const zone = player.deployment_zone;
            const is_in_zone =
                action.at.x >= zone.min_x &&
                action.at.y >= zone.min_y &&
                action.at.x <  zone.max_x &&
                action.at.y <  zone.max_y;

            if (!is_in_zone) return;

            return [
                use_card(player, card),
                spawn_unit(battle, player, action.at, card.unit_type)
            ]
        }

        case Action_Type.purchase_item: {
            const unit = find_valid_unit_for_action(action.unit_id);
            const shop = find_shop_by_id(battle, action.shop_id);

            if (!unit) break;
            if (!shop) break;
            if (!is_point_in_shop_range(unit.position, shop)) break;

            if (shop.items.indexOf(action.item_id) == -1) break;

            const cost = get_item_gold_cost(action.item_id);

            const player = find_player_by_id(battle, unit.owner_player_id);

            if (!player) break;

            if (player.gold < cost) break;

            const purchase: Delta = {
                type: Delta_Type.purchase_item,
                unit_id: unit.id,
                shop_id: shop.id,
                item_id: action.item_id,
                gold_cost: get_item_gold_cost(action.item_id)
            };

            const equip = equip_item(battle, unit, action.item_id);

            return [purchase, equip];
        }

        case Action_Type.pick_up_rune: {
            const unit = find_valid_unit_for_action(action.unit_id);
            const rune = battle.runes.find(rune => rune.id == action.rune_id);

            if (!unit) break;
            if (!rune) break;

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

function get_next_modifier_handle_id(battle: Battle_Record) {
    return battle.modifier_handle_id_auto_increment++;
}

function get_next_card_id(battle: Battle_Record) {
    return battle.card_id_auto_increment++;
}

function get_next_rune_id(battle: Battle_Record) {
    return battle.rune_id_auto_increment++;
}

function get_next_shop_id(battle: Battle_Record) {
    return battle.shop_id_auto_increment;
}

function try_compute_battle_winner_player_id(battle: Battle_Record): number | undefined {
    if (battle.turn_index < 5) {
        return undefined;
    }

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

function server_change_health(battle: Battle_Record, source: Unit, source_ability: Ability_Id | undefined, target: Unit, change: Health_Change) {
    const killed = change_health_default(battle, source, source_ability, target, change);

    if (source_ability == source.attack.id) {
        if (source.modifiers.some(modifier => modifier.id == Modifier_Id.item_satanic)) {
            battle.deltas.push({
                type: Delta_Type.health_change,
                source_unit_id: source.id,
                target_unit_id: source.id,
                ...health_change(source, Math.max(0, -change.value_delta)) // In case we have a healing attack, I guess
            });
        }
    }

    if (killed) {
        if (source.owner_player_id != target.owner_player_id && source.level < max_unit_level) {
            battle.deltas.push({
                type: Delta_Type.level_change,
                unit_id: source.id,
                new_level: source.level + 1
            });
        }
    }

    return killed;
}

function end_turn_server(battle: Battle) {
    end_turn_default(battle);

    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (!modifier.permanent && modifier.duration_remaining == 0) {
                battle.deltas.push({
                    type: Delta_Type.modifier_removed,
                    modifier_handle_id: modifier.handle_id
                })
            }

            if (!unit.dead) {
                if (modifier.id == Modifier_Id.item_heart_of_tarrasque) {
                    battle.deltas.push({
                        type: Delta_Type.health_change,
                        source_unit_id: unit.id,
                        target_unit_id: unit.id,
                        ...health_change(unit, 3)
                    })
                }
            }
        }
    }

    battle.deltas.push({
        type: Delta_Type.start_turn
    })
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

        const possible_winner = try_compute_battle_winner_player_id(battle);

        if (possible_winner != undefined) {
            submit_battle_deltas(battle, [{
                type: Delta_Type.game_over,
                winner_player_id: possible_winner
            }]);

            battle.finished = true;

            report_battle_over(battle, possible_winner);
        }

        return get_battle_deltas_after(battle, initial_head);
    } else {
        return;
    }
}

function submit_battle_deltas(battle: Battle_Record, battle_deltas: Delta[]) {
    battle.deltas.push(...battle_deltas);

    catch_up_to_head(battle);
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

export function start_battle(players: Player[]): number {
    const battleground = random_in_array(battlegrounds)!;

    const battle_players: Battle_Participant_Info[] = players.map(player => ({
        id: player.id,
        name: player.name,
        deployment_zone: player == players[0] ? battleground.deployment_zones[0] : battleground.deployment_zones[1]
    }));

    const battle: Battle_Record = {
        ...make_battle(battle_players, battleground.grid_size.x, battleground.grid_size.y),
        id: battle_id_auto_increment++,
        turn_index: 0,
        unit_id_auto_increment: 0,
        rune_id_auto_increment: 0,
        shop_id_auto_increment: 0,
        modifier_handle_id_auto_increment: 0,
        card_id_auto_increment: 0,
        finished: false,
        change_health: server_change_health,
        end_turn: end_turn_server
    };

    fill_grid(battle);

    function get_starting_gold(player: Battle_Player): Delta_Gold_Change {
        return {
            type: Delta_Type.gold_change,
            player_id: player.id,
            change: 5
        }
    }

    const card_collection = [
        Unit_Type.dragon_knight,
        Unit_Type.pudge,
        Unit_Type.tidehunter,
        Unit_Type.luna,
        Unit_Type.skywrath_mage,
        Unit_Type.lion
    ];

    const spawn_deltas: Delta[] = [];

    for (const player of battle.players) {
        spawn_deltas.push(get_starting_gold(player));
    }

    for (const unit_type of card_collection) {
        spawn_deltas.push(
            draw_hero_card(battle, battle.players[0], unit_type),
            draw_hero_card(battle, battle.players[1], unit_type)
        );
    }

    for (const spawn of battleground.spawns) {
        switch (spawn.type) {
            case Spawn_Type.rune: {
                const random_rune = random_in_array(enum_values<Rune_Type>())!;

                spawn_deltas.push({
                    type: Delta_Type.rune_spawn,
                    rune_type: random_rune,
                    rune_id: get_next_rune_id(battle),
                    at: spawn.at
                });

                break;
            }

            case Spawn_Type.shop: {
                const all_items = enum_values<Item_Id>();
                const items: Item_Id[] = [];

                for (let remaining = 3; remaining; remaining--) {
                    items.push(random_in_array(all_items)!);
                }

                spawn_deltas.push({
                    type: Delta_Type.shop_spawn,
                    shop_id: get_next_shop_id(battle),
                    item_pool: items,
                    at: spawn.at,
                    facing: spawn.facing
                });

                break;
            }

            default: unreachable(spawn);
        }
    }

    battle.deltas.push(...spawn_deltas);

    catch_up_to_head(battle);

    battles.push(battle);

    return battle.id;
}

export function cheat(battle: Battle_Record, player: Player, cheat: string, selected_unit_id: number) {
    const parts = cheat.split(" ");

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

        const cooldown_deltas = unit.abilities
            .filter(ability => ability.type != Ability_Type.passive && ability.charges_remaining < 1)
            .map(ability => ({
                type: Delta_Type.set_ability_charges_remaining,
                unit_id: unit.id,
                ability_id: ability.id,
                charges_remaining: (ability as Ability_Active).charges
            }) as Delta_Set_Ability_Charges_Remaining); // WTF typescript

        submit_battle_deltas(battle, deltas.concat(cooldown_deltas));
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
                rune_id: get_next_rune_id(battle),
                rune_type: rune_type(),
                at: at
            };

            submit_battle_deltas(battle, [ delta ]);

            break;
        }
    }
}