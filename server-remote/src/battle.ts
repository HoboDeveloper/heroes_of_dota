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

function damage_delta(battle: Battle, source: Unit, target: Unit, damage: number): Battle_Delta_Health_Change {
    return {
        source_unit_id: source.id,
        target_unit_id: target.id,
        type: Battle_Delta_Type.health_change,
        new_health: Math.max(0, target.health - damage),
        health_restored: 0,
        damage_dealt: damage
    };
}

function perform_attack(battle: Battle, attacker: Unit, target: XY): Battle_Effect {
    if (attacker.type == Unit_Type.pudge) {
        const direction = direction_normal_between_points(battle, attacker.position, target);
        const actual_target = xy(attacker.position.x + direction.x * 10, attacker.position.y + direction.y * 10);
        const scan = scan_for_unit_in_direction(battle, attacker.position, actual_target, direction);

        if (scan.hit) {
            const damage = damage_delta(battle, attacker, scan.unit, attacker.attack_damage);
            const move: Battle_Delta_Unit_Force_Move = {
                type: Battle_Delta_Type.unit_force_move,
                unit_id: scan.unit.id,
                to_position: xy(attacker.position.x + direction.x, attacker.position.y + direction.y)
            };

            return {
                type: Battle_Effect_Type.pudge_hook,
                result: { hit: true, deltas: [ damage , move ] }
            };
        } else {
            return {
                type: Battle_Effect_Type.pudge_hook,
                result: { hit: false, final_point: scan.final_point }
            }
        }
    }

    if (attacker.type == Unit_Type.sniper) {
        const scan = scan_for_unit_in_direction(battle, attacker.position, target);

        if (scan.hit) {
            const damage = damage_delta(battle, attacker, scan.unit, attacker.attack_damage);

            return {
                type: Battle_Effect_Type.basic_attack,
                delta: damage
            };
        } else {
            return {
                type: Battle_Effect_Type.nothing
            }
        }
    }

    const attacked = unit_at(battle, target);

    if (attacked) {
        const damage = damage_delta(battle, attacker, attacked, attacker.attack_damage);

        return {
            type: Battle_Effect_Type.basic_attack,
            delta: damage
        };
    } else {
        return {
            type: Battle_Effect_Type.nothing
        }
    }
}

function turn_action_to_new_deltas(battle: Battle, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
    const new_deltas: Battle_Delta[] = [];

    switch (action.type) {
        case Action_Type.move: {
            const unit = find_unit_by_id(battle, action.unit_id);

            if (!unit) return;
            if (unit.dead) return;
            if (unit.owner_player_id != player.id) return;
            if (unit.has_taken_an_action_this_turn) return;
            if (xy_equal(unit.position, action.to)) return;

            const [could_find_path, cost] = can_find_path(battle, unit.position, action.to, unit.move_points);

            if (!could_find_path) {
                return;
            }

            new_deltas.push({
                type: Battle_Delta_Type.unit_move,
                move_cost: cost,
                unit_id: unit.id,
                to_position: action.to
            });

            return new_deltas;
        }

        case Action_Type.attack: {
            const attacker = find_unit_by_id(battle, action.unit_id);

            if (!attacker) return;
            if (attacker.dead) return;
            if (attacker.owner_player_id != player.id) return;
            if (attacker.has_taken_an_action_this_turn) return;
            if (!is_attack_target_valid(battle, attacker, action.to)) return;

            const effect: Battle_Effect = perform_attack(battle, attacker, action.to);

            new_deltas.push({
                type: Battle_Delta_Type.unit_attack,
                unit_id: attacker.id,
                attacked_position: action.to,
                effect: effect
            });

            return new_deltas;
        }

        case Action_Type.end_turn: {
            new_deltas.push({
                type: Battle_Delta_Type.end_turn
            });

            return new_deltas;
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

export function try_take_turn_action(battle: Battle_Record, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
    if (battle.finished) {
        return;
    }

    if (get_turning_player(battle).id != player.id) {
        return;
    }

    const new_deltas = turn_action_to_new_deltas(battle, player, action);

    if (new_deltas) {
        collapse_deltas(battle, battle.delta_head, new_deltas);

        const possible_winner = try_compute_battle_winner(battle);

        if (possible_winner != undefined) {
            battle.finished = true;

            report_battle_over(battle, possible_winner);
        }
    }

    return new_deltas;
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