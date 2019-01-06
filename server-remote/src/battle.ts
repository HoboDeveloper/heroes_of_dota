import {unreachable, XY, xy, xy_equal} from "./common";
import {unit_definition_by_type} from "./unit_defs";
import {Player, report_battle_over} from "./server";

let battle_id_auto_increment = 0;

const battles: Battle[] = [];

type Unit = {
    type: Unit_Type;
    id: number;
    owner_id: number;
    dead: boolean;
    position: XY;
    health: number;
    move_points: number;
    max_health: number;
    max_move_points: number;
    attack_damage: number;
    has_taken_an_action_this_turn: boolean;
}

type Cell = {
    occupied: boolean;
    cost: number;
    position: XY;
}

type Grid = {
    cells: Cell[];
    size: XY;
}

export type Battle = {
    id: number;
    unit_id_auto_increment: number;
    units: Unit[];
    players: Battle_Player[];
    deltas: Battle_Delta[];
    grid: Grid;
    turning_player_index: number;
    finished: boolean;
}

function grid_cell_at(grid: Grid, at: XY): Cell | undefined {
    if (at.x < 0 || at.x >= grid.size.x || at.y < 0 || at.y >= grid.size.y) {
        return undefined;
    }

    return grid.cells[at.x * grid.size.y + at.y];
}

function grid_cell_index(grid: Grid, at: XY): number {
    return at.x * grid.size.y + at.y;
}

function grid_cell_at_unchecked(grid: Grid, at: XY): Cell {
    return grid.cells[at.x * grid.size.y + at.y];
}

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function unit_at(battle: Battle, at: XY): Unit | undefined {
    return battle.units.find(unit => !unit.dead && xy_equal(at, unit.position));
}

function unit_by_id(battle: Battle, id: number) {
    return battle.units.find(unit => unit.id == id);
}

// TODO replace with a more efficient A* implementation
function can_find_path(grid: Grid, from: XY, to: XY, maximum_distance: number): [boolean, number] {
    const indices_already_checked: boolean[] = [];
    const from_index = grid_cell_index(grid, from);

    let indices_not_checked: number[] = [];

    indices_not_checked.push(from_index);
    indices_already_checked[from_index] = true;

    for (let current_cost = 0; indices_not_checked.length > 0 && current_cost <= maximum_distance; current_cost++) {
        const new_indices: number[] = [];

        for (const index of indices_not_checked) {
            const cell = grid.cells[index];
            const at = cell.position;

            if (xy_equal(to, at)) {
                return [true, current_cost];
            }

            const neighbors = [
                grid_cell_at(grid, xy(at.x + 1, at.y)),
                grid_cell_at(grid, xy(at.x - 1, at.y)),
                grid_cell_at(grid, xy(at.x, at.y + 1)),
                grid_cell_at(grid, xy(at.x, at.y - 1))
            ];

            for (const neighbor of neighbors) {
                if (!neighbor) continue;

                const neighbor_index = grid_cell_index(grid, neighbor.position);

                if (indices_already_checked[neighbor_index]) continue;
                if (neighbor.occupied) {
                    indices_already_checked[neighbor_index] = true;
                    continue;
                }

                new_indices.push(neighbor_index);

                indices_already_checked[neighbor_index] = true;
            }
        }

        indices_not_checked = new_indices;
    }

    return [false, 0];
}

function fill_grid(grid: Grid) {
    for (let x = 0; x < grid.size.x; x++) {
        for (let y = 0; y < grid.size.y; y++) {
            grid.cells.push({
                position: xy(x, y),
                occupied: false,
                cost: 1
            });
        }
    }
}

function get_turning_player(battle: Battle): Battle_Player {
    return battle.players[battle.turning_player_index];
}

function pass_turn_to_next_player(battle: Battle) {
    battle.turning_player_index++;

    if (battle.turning_player_index == battle.players.length) {
        battle.turning_player_index -= battle.players.length;
    }
}

function move_unit(battle: Battle, unit: Unit, to: XY) {
    grid_cell_at_unchecked(battle.grid, unit.position).occupied = false;
    grid_cell_at_unchecked(battle.grid, to).occupied = true;

    unit.position = to;
}

function damage_unit(battle: Battle, source: Unit, target: Unit, damage: number): Battle_Delta_Health_Change {
    target.health = Math.max(0, target.health - damage);

    if (target.health == 0) {
        grid_cell_at_unchecked(battle.grid, target.position).occupied = false;

        target.dead = true;
    }

    return {
        source_unit_id: source.id,
        target_unit_id: target.id,
        type: Battle_Delta_Type.health_change,
        new_health: target.health,
        health_restored: 0,
        damage_dealt: damage
    };
}

function resolve_state_post_turn(battle: Battle) {
    for (const unit of battle.units) {
        unit.move_points = unit.max_move_points;
        unit.has_taken_an_action_this_turn = false;
    }
}

function try_apply_turn_action(battle: Battle, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
    const new_deltas: Battle_Delta[] = [];

    switch (action.type) {
        case Action_Type.move: {
            const unit = unit_by_id(battle, action.unit_id);

            if (!unit) return;
            if (unit.dead) return;
            if (unit.owner_id != player.id) return;
            if (unit.has_taken_an_action_this_turn) return;
            if (xy_equal(unit.position, action.to)) return;

            const [could_find_path, cost] = can_find_path(battle.grid, unit.position, action.to, unit.move_points);

            if (!could_find_path) {
                return;
            }

            move_unit(battle, unit, action.to);

            unit.move_points -= cost;

            new_deltas.push({
                type: Battle_Delta_Type.unit_move,
                unit_id: unit.id,
                to_position: action.to
            });

            return new_deltas;
        }

        case Action_Type.attack: {
            const attacker = unit_by_id(battle, action.unit_id);

            if (!attacker) return;
            if (attacker.dead) return;
            if (attacker.owner_id != player.id) return;
            if (attacker.has_taken_an_action_this_turn) return;
            if (manhattan(attacker.position, action.to) > 1) return;

            const attacked = unit_at(battle, action.to);

            let effect: Battle_Effect;

            if (attacked) {
                const damage_delta = damage_unit(battle, attacker, attacked, attacker.attack_damage);

                effect = {
                    type: Battle_Effect_Type.basic_attack,
                    delta: damage_delta
                };
            } else {
                effect = {
                    type: Battle_Effect_Type.nothing
                }
            }

            attacker.has_taken_an_action_this_turn = true;

            new_deltas.push({
                type: Battle_Delta_Type.unit_attack,
                unit_id: attacker.id,
                attacked_position: action.to,
                effect: effect
            });

            return new_deltas;
        }

        case Action_Type.end_turn: {
            pass_turn_to_next_player(battle);
            resolve_state_post_turn(battle);

            new_deltas.push({
                type: Battle_Delta_Type.end_turn
            });

            return new_deltas;
        }

        default: unreachable(action);
    }
}

function spawn_unit(battle: Battle, owner: Player, at_position: XY, type: Unit_Type) {
    const id = get_next_unit_id(battle);
    const definition = unit_definition_by_type(type);

    battle.units.push({
        id: id,
        type: type,
        owner_id: owner.id,
        health: definition.health,
        max_health: definition.health,
        attack_damage: 6,
        move_points: definition.move_points,
        max_move_points: definition.move_points,
        has_taken_an_action_this_turn: false,
        position: at_position,
        dead: false
    });

    battle.deltas.push({
        type: Battle_Delta_Type.unit_spawn,
        at_position: at_position,
        owner_id: owner.id,
        unit_type: type,
        unit_id: id
    });
}

function get_next_unit_id(battle: Battle) {
    return battle.unit_id_auto_increment++;
}

function try_compute_battle_winner(battle: Battle): number | undefined {
    let last_alive_unit_player_id: number | undefined = undefined;

    for (const unit of battle.units) {
        if (!unit.dead) {
            if (last_alive_unit_player_id == undefined) {
                last_alive_unit_player_id = unit.owner_id;
            } else if (last_alive_unit_player_id != unit.owner_id) {
                return undefined;
            }
        }
    }

    return last_alive_unit_player_id;
}

export function try_take_turn_action(battle: Battle, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
    if (battle.finished) {
        return;
    }

    if (get_turning_player(battle).id != player.id) {
        return;
    }

    const new_deltas = try_apply_turn_action(battle, player, action);

    if (new_deltas) {
        battle.deltas = battle.deltas.concat(new_deltas);
    }

    const possible_winner = try_compute_battle_winner(battle);

    if (possible_winner != undefined) {
        battle.finished = true;

        report_battle_over(battle, possible_winner);
    }

    return new_deltas;
}

export function get_battle_deltas_after(battle: Battle, head: number): Battle_Delta[] {
    return battle.deltas.slice(head);
}

export function find_battle_by_id(id: number): Battle | undefined {
    return battles.find(battle => battle.id == id);
}

export function start_battle(players: Player[]): number {
    const grid: Grid = {
        cells: [],
        size: xy(12, 12)
    };

    fill_grid(grid);

    const battle: Battle = {
        id: battle_id_auto_increment++,
        unit_id_auto_increment: 0,
        units: [],
        players: players.map(player => ({
            id: player.id,
            name: player.name
        })),
        deltas: [],
        grid: grid,
        turning_player_index: 0,
        finished: false
    };

    spawn_unit(battle, players[0], xy(1, 1), Unit_Type.ursa);
    spawn_unit(battle, players[0], xy(3, 1), Unit_Type.ursa);
    spawn_unit(battle, players[0], xy(5, 1), Unit_Type.ursa);

    spawn_unit(battle, players[1], xy(2, 7), Unit_Type.ursa);
    spawn_unit(battle, players[1], xy(4, 7), Unit_Type.ursa);
    spawn_unit(battle, players[1], xy(6, 7), Unit_Type.ursa);

    battles.push(battle);

    return battle.id;
}