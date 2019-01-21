import {Player, report_battle_over} from "./server";
import {readFileSync} from "fs";

eval(readFileSync("dist/battle_sim.js", "utf8"));

let battle_id_auto_increment = 0;

type Battle_Record = Battle & {
    id: number,
    unit_id_auto_increment: number,
    finished: boolean
}

const battles: Battle_Record[] = [];
const max_unit_level = 4;

// This will only work correctly if cells are on the same line
function direction_normal_between_points(battle: Battle, from: XY, to: XY): XY {
    const delta = xy_sub(to, from);

    return xy(Math.sign(delta.x), Math.sign(delta.y));
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
    to_inclusive: XY,
    direction_normal: XY = direction_normal_between_points(battle, from_exclusive, to_inclusive)
): Scan_Result_Hit | Scan_Result_Missed {
    let current_cell = xy(from_exclusive.x, from_exclusive.y);

    while (!xy_equal(to_inclusive, current_cell)) {
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

    return { hit: false, final_point: to_inclusive };
}

function query_units_in_manhattan_area(battle: Battle, from_exclusive: XY, distance_inclusive: number): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        const distance = manhattan(unit.position, from_exclusive);

        if (distance > 0 && distance < distance_inclusive) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_in_rectangular_area(battle: Battle, from_exclusive: XY, distance_inclusive: number): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        const unit_position = unit.position;
        const delta_x = unit_position.x - from_exclusive.x;
        const delta_y = unit_position.y - from_exclusive.y;

        if ((delta_x != 0 || delta_y != 0) && Math.abs(delta_x) <= distance_inclusive && Math.abs(delta_y) <= distance_inclusive) {
            units.push(unit);
        }
    }

    return units;
}

function heal_delta(source: Unit, source_ability: Ability_Id, target: Unit, heal: number): Battle_Delta_Health_Change {
    return {
        source_unit_id: source.id,
        source_ability_id: source_ability,
        target_unit_id: target.id,
        type: Battle_Delta_Type.health_change,
        new_health: Math.min(target.max_health, target.health + heal),
        health_restored: 0,
        damage_dealt: heal
    };
}

function damage_delta(source: Unit, source_ability: Ability_Id, target: Unit, damage: number): Battle_Delta_Health_Change {
    return {
        source_unit_id: source.id,
        source_ability_id: source_ability,
        target_unit_id: target.id,
        type: Battle_Delta_Type.health_change,
        new_health: Math.max(0, target.health - damage),
        health_restored: 0,
        damage_dealt: damage
    };
}

function perform_ability_cast_ground(battle: Battle, unit: Unit, ability: Ability & { type: Ability_Type.target_ground }, target: XY): Ability_Effect | undefined {
    switch (ability.id) {
        case Ability_Id.basic_attack: {
            const scan = scan_for_unit_in_direction(battle, unit.position, target);

            if (scan.hit) {
                const damage = damage_delta(unit, ability.id, scan.unit, ability.damage);

                return {
                    ability_id: Ability_Id.basic_attack,
                    delta: damage
                };
            }

            // TODO decide if we need to be able to attack nothing at all
            return;
        }

        case Ability_Id.pudge_hook: {
            const distance = ability.targeting.line_length;
            const direction = direction_normal_between_points(battle, unit.position, target);
            const actual_target = xy(unit.position.x + direction.x * distance, unit.position.y + direction.y * distance);
            const scan = scan_for_unit_in_direction(battle, unit.position, actual_target, direction);

            if (scan.hit) {
                const damage = damage_delta(unit, ability.id, scan.unit, 6);
                const move: Battle_Delta_Unit_Force_Move = {
                    type: Battle_Delta_Type.unit_force_move,
                    unit_id: scan.unit.id,
                    to_position: xy(unit.position.x + direction.x, unit.position.y + direction.y)
                };

                return {
                    ability_id: ability.id,
                    result: { hit: true, deltas: [ damage , move ] }
                };
            } else {
                return {
                    ability_id: ability.id,
                    result: { hit: false, final_point: scan.final_point }
                }
            }
        }

        default: unreachable(ability.type);
    }
}

function perform_ability_cast_no_target(battle: Battle, unit: Unit, ability: Ability & { type: Ability_Type.no_target }): Ability_Effect | undefined {
    switch (ability.id) {
        case Ability_Id.pudge_rot: {
            const targets = query_units_in_rectangular_area(battle, unit.position, ability.targeting.area_radius);
            const deltas = targets.map(target => damage_delta(unit, ability.id, target, 4));

            deltas.push(damage_delta(unit, ability.id, unit, 4));

            return {
                ability_id: ability.id,
                deltas: deltas
            }
        }

        default: unreachable(ability.type);
    }
}

function perform_ability_cast_unit_target(battle: Battle, unit: Unit, ability: Ability & { type: Ability_Type.target_unit }, target: Unit): Ability_Effect | undefined {
    switch (ability.id) {
        case Ability_Id.pudge_dismember: {
            return {
                ability_id: ability.id,
                heal_delta: heal_delta(unit, ability.id, unit, 14),
                damage_delta: damage_delta(unit, ability.id, target, 14)
            };
        }

        default: unreachable(ability.type);
    }
}

function turn_action_to_new_deltas(battle: Battle, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
    function find_valid_unit(id: number): Unit | undefined {
        const unit = find_unit_by_id(battle, id);

        if (!unit) return;
        if (unit.dead) return;
        if (unit.owner_player_id != player.id) return;

        return unit;
    }

    function find_valid_unit_for_action(id: number): Unit | undefined {
        const unit = find_valid_unit(id);

        if (!unit) return;
        if (unit.has_taken_an_action_this_turn) return;

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

    function mana_change(unit: Unit, mana_change: number): Battle_Delta_Mana_Change {
        return {
            type: Battle_Delta_Type.mana_change,
            unit_id: unit.id,
            mana_change: mana_change,
            new_mana: Math.max(0, Math.min(unit.max_mana, unit.mana + mana_change))
        }
    }

    switch (action.type) {
        case Action_Type.move: {
            const unit = find_valid_unit(action.unit_id);

            if (!unit) return;
            if (unit.has_taken_an_action_this_turn) return;
            if (xy_equal(unit.position, action.to)) return;

            const [could_find_path, cost] = can_find_path(battle, unit.position, action.to, unit.move_points);

            if (!could_find_path) {
                return;
            }

            return [{
                type: Battle_Delta_Type.unit_move,
                move_cost: cost,
                unit_id: unit.id,
                to_position: action.to
            }];
        }

        case Action_Type.use_no_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.no_target) return;

            const effect = perform_ability_cast_no_target(battle, actors.unit, actors.ability);

            if (!effect) return;

            return [
                mana_change(actors.unit, -actors.ability.mana_cost),
                {
                    type: Battle_Delta_Type.unit_use_no_target_ability,
                    unit_id: action.unit_id,
                    effect: effect
                }
            ]
        }

        case Action_Type.unit_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.target_unit) return;

            const target = find_unit_by_id(battle, action.target_id);

            if (!target) return;

            const effect = perform_ability_cast_unit_target(battle, actors.unit, actors.ability, target);

            if (!effect) return;

            return [
                mana_change(actors.unit, -actors.ability.mana_cost),
                {
                    type: Battle_Delta_Type.unit_unit_target_ability,
                    unit_id: action.unit_id,
                    target_unit_id: action.target_id,
                    effect: effect
                }
            ]
        }

        case Action_Type.ground_target_ability: {
            const actors = find_valid_unit_and_authorize_ability(action.unit_id, action.ability_id);

            if (!actors) return;
            if (actors.ability.type != Ability_Type.target_ground) return;

            const cell = grid_cell_at(battle, action.to);

            if (!cell) return;
            if (!can_ground_target_ability_be_cast_at_target_from_source(actors.ability.targeting, actors.unit.position, action.to)) return;

            const effect = perform_ability_cast_ground(battle, actors.unit, actors.ability, action.to);

            if (!effect) return;

            return [
                mana_change(actors.unit, -actors.ability.mana_cost), {
                    type: Battle_Delta_Type.unit_ground_target_ability,
                    unit_id: action.unit_id,
                    target_position: action.to,
                    effect: effect
                }
            ]
        }

        case Action_Type.end_turn: {
            return [{
                type: Battle_Delta_Type.end_turn
            }];
        }

        default: unreachable(action);
    }
}

function spawn_unit(battle: Battle_Record, owner: Player, at_position: XY, type: Unit_Type) : Battle_Delta_Unit_Spawn {
    const id = get_next_unit_id(battle);

    return {
        type: Battle_Delta_Type.unit_spawn,
        at_position: at_position,
        owner_id: owner.id,
        unit_type: type,
        unit_id: id
    };
}

function get_next_unit_id(battle: Battle_Record) {
    return battle.unit_id_auto_increment++;
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

function process_collapsed_deltas(battle: Battle, deltas: Battle_Delta[]): Battle_Delta[] | undefined {
    let new_deltas: Battle_Delta[] | undefined;

    for (const delta of deltas) {
        if (delta.type == Battle_Delta_Type.health_change && delta.new_health == 0) {
            const source = find_unit_by_id(battle, delta.source_unit_id);
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (!source || !target) continue;
            if (source.owner_player_id == target.owner_player_id) continue;

            if (source.level < max_unit_level) {
                if (!new_deltas) new_deltas = [];

                new_deltas.push({
                    type: Battle_Delta_Type.unit_level_change,
                    unit_id: source.id,
                    new_level: source.level + 1
                });
            }
        }
    }

    return new_deltas;
}

export function try_take_turn_action(battle: Battle_Record, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
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

export function submit_battle_deltas(battle: Battle, battle_deltas: Battle_Delta[] | undefined): boolean {
    let new_deltas = battle_deltas;
    let collapsed_anything = false;

    while (new_deltas) {
        const flattened_deltas = collapse_deltas(battle, battle.delta_head, new_deltas);
        new_deltas = process_collapsed_deltas(battle, flattened_deltas);

        collapsed_anything = true;
    }

    return collapsed_anything;
}

export function get_battle_deltas_after(battle: Battle, head: number): Battle_Delta[] {
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

        spawn_unit(battle, players[1], xy(2, 7), Unit_Type.ursa),
        spawn_unit(battle, players[1], xy(4, 7), Unit_Type.sniper),
        spawn_unit(battle, players[1], xy(6, 7), Unit_Type.pudge),
    ];

    collapse_deltas(battle, battle.delta_head, spawn_deltas);

    battles.push(battle);

    return battle.id;
}