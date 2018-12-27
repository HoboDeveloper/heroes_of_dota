import {unreachable, XY, xy, xy_equal} from "./common";
import {Player} from "./server";

let battle_id_auto_increment = 0;

const battles: Battle[] = [];

interface Unit {
    id: number;
    owner_id: number;
    dead: boolean;
    position: XY;
    health: number;
    move_points: number;
    attack_damage: number;
}

interface Cell {
    occupied: boolean;
    cost: number;
    position: XY;
}

interface Grid {
    cells: Cell[];
    size: XY;
}

interface Battle {
    id: number;
    unit_id_auto_increment: number;
    units: Unit[];
    players: Player[];
    deltas: Battle_Delta[];
    grid: Grid;
    turning_player_index: number;
}

function grid_cell_at(grid: Grid, at: XY): Cell | undefined {
    if (at.x < 0 || at.x >= grid.size.x || at.y < 0 || at.y >= grid.size.y) {
        return undefined;
    }

    return grid.cells[at.x * grid.size.y + at.y];
}

function grid_cell_at_unchecked(grid: Grid, at: XY): Cell{
    return grid.cells[at.x * grid.size.y + at.y];
}

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function unit_at(battle: Battle, at: XY): Unit | undefined {
    return battle.units.find(unit => !unit.dead && xy_equal(at, unit.position));
}

function can_find_path(grid: Grid, from: XY, to: XY, maximum_distance: number) {
    function check_cell(cell: Cell, distance_travelled: number) {
        if (cell.occupied) {
            return false;
        }

        const at = cell.position;

        if (xy_equal(at, to)) {
            return true;
        }

        if (distance_travelled == maximum_distance) {
            return false;
        }

        const neighbors = [
            grid_cell_at(grid, xy(at.x + 1, at.y)),
            grid_cell_at(grid, xy(at.x - 1, at.y)),
            grid_cell_at(grid, xy(at.x, at.y + 1)),
            grid_cell_at(grid, xy(at.x, at.y - 1))
        ];

        const sorted_neighbors = (neighbors.filter(cell => cell !== undefined) as Cell[]).sort((a, b) => {
            return manhattan(a.position, to) - manhattan(b.position, to);
        });

        for (let neighbor of sorted_neighbors) {
            const check_result = check_cell(neighbor, distance_travelled + cell.cost);

            if (check_result) {
                return true;
            }
        }

        return false;
    }

    const cell_from = grid_cell_at(grid, from);
    const cell_to = grid_cell_at(grid, to);

    if (cell_from && cell_to) {
        return check_cell(cell_from, 0);
    } else {
        return false;
    }
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

function get_turning_player(battle: Battle) {
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

function damage_unit(battle: Battle, source: Unit, target: Unit, damage: number): Battle_Delta {
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

function try_apply_turn_action(battle: Battle, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
    const new_deltas: Battle_Delta[] = [];

    switch (action.type) {
        case Action_Type.move: {
            const unit = unit_at(battle, action.from);

            if (!unit) return;
            if (!can_find_path(battle.grid, action.from, action.to, unit.move_points)) return;

            move_unit(battle, unit, action.to);

            new_deltas.push({
                type: Battle_Delta_Type.unit_move,
                unit_id: unit.id,
                to_position: action.to
            });

            return new_deltas;
        }

        case Action_Type.attack: {
            if (manhattan(action.from, action.to) > 1) return;

            const attacker = unit_at(battle, action.from);
            const attacked = unit_at(battle, action.to);

            if (!attacker) return;

            new_deltas.push({
                type: Battle_Delta_Type.unit_attack,
                unit_id: attacker.id,
                attacked_position: action.to
            });

            if (attacked) {
                const damage_delta = damage_unit(battle, attacker, attacked, attacker.attack_damage);

                new_deltas.push(damage_delta);
            }

            return new_deltas;
        }

        case Action_Type.end_turn: {
            pass_turn_to_next_player(battle);

            new_deltas.push({
                type: Battle_Delta_Type.end_turn
            });

            return new_deltas;
        }

        default: unreachable(action);
    }
}

function spawn_unit(battle: Battle, owner: Player, at_position: XY) {
    const id = get_next_unit_id(battle);

    battle.units.push({
        id: id,
        owner_id: owner.id,
        health: 30,
        attack_damage: 6,
        move_points: 4,
        position: at_position,
        dead: false
    });

    battle.deltas.push({
        type: Battle_Delta_Type.unit_spawn,
        at_position: at_position,
        owner_id: owner.id,
        unit_id: id
    });
}

function get_next_unit_id(battle: Battle) {
    return battle.unit_id_auto_increment++;
}

export function try_take_turn_action(battle: Battle, player: Player, action: Turn_Action): Battle_Delta[] | undefined {
    if (get_turning_player(battle) != player) {
        return;
    }

    return try_apply_turn_action(battle, player, action);
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
        size: xy(8, 8)
    };

    fill_grid(grid);

    const battle: Battle = {
        id: battle_id_auto_increment++,
        unit_id_auto_increment: 0,
        units: [],
        players: players,
        deltas: [],
        grid: grid,
        turning_player_index: 0
    };

    spawn_unit(battle, players[0], xy(1, 1));
    spawn_unit(battle, players[0], xy(3, 1));
    spawn_unit(battle, players[0], xy(5, 1));


    spawn_unit(battle, players[1], xy(2, 7));
    spawn_unit(battle, players[1], xy(4, 7));
    spawn_unit(battle, players[1], xy(6, 7));

    battles.push(battle);

    return battle.id;
}