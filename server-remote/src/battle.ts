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
    turn_index: number
}

const battles: Battle_Record[] = [];

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

type Aura = {
    source: Unit
    active_modifier_ids: number[]
    field: Unit_Field
    change: number
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

function heal_delta(source: Unit, target: Unit, heal: number, max_health_override: number = target[Unit_Field.max_health]): Delta_Health_Change {
    return {
        source_unit_id: source.id,
        target_unit_id: target.id,
        type: Delta_Type.health_change,
        new_value: Math.min(max_health_override, target.health + heal),
        value_delta: heal
    };
}

function field_change_delta<T extends Unit_Field>(field: T, source: Unit, target: Unit, value_delta: number): Delta_Field_Change & { field: T } {
    return {
        type: Delta_Type.unit_field_change,
        field: field,
        source_unit_id: source.id,
        target_unit_id: target.id,
        new_value: target[field] + value_delta,
        value_delta: value_delta
    }
}

function apply_ability_effect_delta<T extends Ability_Effect>(effect: T): Delta_Ability_Effect_Applied<T> {
    return {
        type: Delta_Type.ability_effect_applied,
        effect: effect
    }
}

function health_change(target: Unit, change: number): Value_Change {
    return {
        new_value: Math.max(0, target.health + change),
        value_delta: change
    }
}

function field_change(target: Unit, field: Unit_Field, change: number): Value_Change {
    return {
        new_value: target[field] + change,
        value_delta: change
    }
}

function perform_ability_cast_ground(battle: Battle, unit: Unit, ability: Ability & { type: Ability_Type.target_ground }, target: XY): Delta_Ground_Target_Ability | undefined {
    switch (ability.id) {
        case Ability_Id.basic_attack: {
            const scan = scan_for_unit_in_direction(battle, unit.position, target, ability.targeting.line_length);

            if (scan.hit) {
                const damage = Math.max(0, ability.damage + unit[Unit_Field.attack_bonus] - scan.unit[Unit_Field.armor]);

                return {
                    type: Delta_Type.use_ground_target_ability,
                    unit_id: unit.id,
                    target_position: target,
                    ability_id: Ability_Id.basic_attack,
                    result: {
                        hit: true,
                        target_unit_id: scan.unit.id,
                        damage_dealt: health_change(scan.unit, -damage)
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
                return {
                    type: Delta_Type.use_ground_target_ability,
                    unit_id: unit.id,
                    target_position: target,
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
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                target_unit_id: target.id,
                damage_dealt: health_change(target, -ability.damage)
            }));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.tide_anchor_smash: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                modifier_id: get_next_modifier_id(battle),
                target_unit_id: target.id,
                attack_change: field_change(target, Unit_Field.attack_bonus, -ability.attack_reduction),
                damage_dealt: health_change(target, -ability.damage)
            }));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                targets: targets,
                duration: 1
            };
        }

        case Ability_Id.tide_ravage: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                modifier_id: get_next_modifier_id(battle),
                target_unit_id: target.id,
                damage_dealt: health_change(target, -ability.damage),
                stun_counter: field_change(target, Unit_Field.state_stunned_counter, 1)
            }));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                duration: 1,
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

            const effects = targets.map(target => ({
                target_unit_id: target.unit.id,
                damage_dealt: health_change(target.unit, -target.beams_applied)
            }));

            return {
                type: Delta_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id,
                missed_beams: remaining_beams,
                targets: effects
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
                damage_dealt: health_change(target, -ability.damage),
                health_restored: health_change(target, ability.damage)
            };
        }

        case Ability_Id.tide_gush: {
            return {
                type: Delta_Type.use_unit_target_ability,
                unit_id: unit.id,
                target_unit_id: target.id,
                ability_id: ability.id,
                modifier_id: get_next_modifier_id(battle),
                damage_dealt: health_change(target, -ability.damage),
                duration: 1,
                move_points_change: field_change(target, Unit_Field.max_move_points, -ability.move_points_reduction)
            };
        }

        case Ability_Id.luna_lucent_beam: {
            return {
                type: Delta_Type.use_unit_target_ability,
                unit_id: unit.id,
                target_unit_id: target.id,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage)
            };
        }

        default: unreachable(ability.type);
    }
}

// TODO move into a battle_sim callback?
function on_target_attacked_pre_resolve(battle: Battle_Record, source: Unit, target: Unit, damage: number): Delta | undefined {
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

    function find_valid_unit_and_authorize_ability(unit_id: number, ability_id: number): { unit: Unit, ability: Ability } | undefined {
        const unit = find_valid_unit_for_action(unit_id);

        if (!unit) return;

        const ability_use = authorize_ability_use_by_unit(unit, ability_id);

        if (!ability_use.success) return;

        const ability = ability_use.ability;

        return { unit: unit, ability: ability };
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

function get_next_modifier_id(battle: Battle_Record) {
    return battle.modifier_id_auto_increment++;
}

function get_next_card_id(battle: Battle_Record) {
    return battle.card_id_auto_increment++;
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

function server_change_health(battle: Battle_Record, source: Unit, target: Unit, change: Value_Change) {
    const killed = change_health_default(battle, source, target, change);

    if (killed) {
        if (source.owner_player_id != target.owner_player_id && source[Unit_Field.level] < max_unit_level) {
            battle.deltas.push(field_change_delta(Unit_Field.level, source, source, 1));
        }
    }

    return killed;
}

function server_change_field(battle: Battle, target: Unit, field: Unit_Field, change: Value_Change, tie_to_modifier_id?: number) {
    change_field_default(battle, target, field, change, tie_to_modifier_id);
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
        submit_battle_deltas(battle, new_deltas)

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

export function submit_battle_deltas(battle: Battle_Record, battle_deltas: Delta[]) {
    battle.deltas.push(...battle_deltas);

    catch_up_to_head(battle);
}

export function get_battle_deltas_after(battle: Battle, head: number): Delta[] {
    return battle.deltas.slice(head);
}

export function find_battle_by_id(id: number): Battle_Record | undefined {
    return battles.find(battle => battle.id == id);
}

export function start_battle(players: Player[]): number {
    const grid_size = xy(12, 12);
    const deployment_zone_height = 3;

    const bottom_player_zone = {
        min_x: 0,
        min_y: 0,
        max_x: grid_size.x,
        max_y: deployment_zone_height
    };

    const top_player_zone = {
        min_x: 0,
        min_y: grid_size.y - deployment_zone_height,
        max_x: grid_size.x,
        max_y: grid_size.y
    };

    const battle_players: Battle_Participant_Info[] = players.map(player => ({
        id: player.id,
        name: player.name,
        deployment_zone: player == players[0] ? bottom_player_zone : top_player_zone
    }));

    const battle: Battle_Record = {
        ...make_battle(battle_players, 12, 12),
        id: battle_id_auto_increment++,
        turn_index: 0,
        unit_id_auto_increment: 0,
        modifier_id_auto_increment: 0,
        card_id_auto_increment: 0,
        finished: false,
        change_health: server_change_health,
        change_field: server_change_field
    };

    fill_grid(battle);

    const spawn_deltas = [
        draw_hero_card(battle, battle.players[0], Unit_Type.sniper),
        draw_hero_card(battle, battle.players[0], Unit_Type.pudge),
        draw_hero_card(battle, battle.players[0], Unit_Type.tidehunter),
        draw_hero_card(battle, battle.players[0], Unit_Type.luna),

        draw_hero_card(battle, battle.players[1], Unit_Type.sniper),
        draw_hero_card(battle, battle.players[1], Unit_Type.pudge),
        draw_hero_card(battle, battle.players[1], Unit_Type.tidehunter),
        draw_hero_card(battle, battle.players[1], Unit_Type.luna)
    ];

    battle.deltas.push(...spawn_deltas);

    catch_up_to_head(battle);

    battles.push(battle);

    return battle.id;
}