import {XY, xy, xy_equal} from "./common";
import {Player} from "./server";

const battles: Battle[] = [];

const enum Action_Type {
    attack = 0,
    move = 1,
    end_turn = 2
}

interface Action_Attack {
    type: Action_Type.attack;
    from: XY;
    to: XY;
}

interface Action_Move {
    type: Action_Type.move;
    from: XY;
    to: XY;
}

interface Action_End_Turn {
    type: Action_Type.end_turn;
}

interface Hero {
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

type Turn_Action = Action_Attack | Action_Move | Action_End_Turn;

interface Battle {
    heroes: Hero[];
    players: Player[];
    actions: Turn_Action[];
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

function hero_at(battle: Battle, at: XY): Hero | undefined {
    return battle.heroes.find(hero => !hero.dead && xy_equal(at, hero.position));
}

function unreachable(x: never): never {
    throw new Error("Didn't expect to get here");
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

function move_hero(battle: Battle, hero: Hero, to: XY) {
    grid_cell_at_unchecked(battle.grid, hero.position).occupied = false;
    grid_cell_at_unchecked(battle.grid, to).occupied = true;

    hero.position = to;
}

function damage_hero(battle: Battle, source: Hero, target: Hero, damage: number) {
    target.health = target.health - damage;

    if (target.health <= 0) {
        grid_cell_at_unchecked(battle.grid, target.position).occupied = false;

        target.dead = true;
    }
}

function try_take_battle_action(battle: Battle, player: Player, action: Turn_Action) {
    switch (action.type) {
        case Action_Type.move: {
            const hero = hero_at(battle, action.from);

            if (!hero) return false;
            if (!can_find_path(battle.grid, action.from, action.to, hero.move_points)) return false;

            move_hero(battle, hero, action.to);

            return true;
        }

        case Action_Type.attack: {
            if (manhattan(action.from, action.to) > 1) return false;

            const attacker = hero_at(battle, action.from);
            const attacked = hero_at(battle, action.to);

            if (!attacker) return false;

            if (attacked) {
                damage_hero(battle, attacker, attacked, attacker.attack_damage);
            }

            return true;
        }

        case Action_Type.end_turn: {
            pass_turn_to_next_player(battle);

            return true;
        }

        default: unreachable(action);
    }
}

function process_battle_action(battle: Battle, player: Player, action: Turn_Action) {
    if (get_turning_player(battle) != player) {
        return false;
    }

    if (try_take_battle_action(battle, player, action)) {
        battle.actions.push(action);
    }
}

function get_actions_after(battle: Battle, head: number) {
    return battle.actions.slice(head);
}

export function start_battle(players: Player[]) {
    const grid: Grid = {
        cells: [],
        size: xy(8, 8)
    };

    fill_grid(grid);

    const battle: Battle = {
        heroes: [],
        players: players,
        actions: [],
        grid: grid,
        turning_player_index: 0
    };

    battles.push(battle);
}