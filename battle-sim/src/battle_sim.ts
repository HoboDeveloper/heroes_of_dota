interface XY {
    x: number;
    y: number;
}

function xy(x: number, y: number): XY {
    return { x: x, y: y };
}

function xy_equal(a: XY, b: XY) {
    return a.x == b.x && a.y == b.y;
}

function xy_sub(b: XY, a: XY) {
    return xy(b.x - a.x, b.y - a.y);
}

function unreachable(x: never): never {
    throw new Error("Didn't expect to get here");
}

declare const enum Ability_Type {
    passive = 0,
    no_target = 1,
    target_ground = 2,
    target_unit = 3
}

type Unit_Definition = {
    health: number;
    mana: number;
    move_points: number;
    abilities: Ability_Definition[];
}

type Ability_Definition_Passive = {
    type: Ability_Type.passive;
    id: Ability_Id;
    available_since_level: number;
}

type Ability_Definition_Active = {
    id: Ability_Id;
    type: Ability_Type.no_target | Ability_Type.target_ground | Ability_Type.target_unit;
    available_since_level: number;
    cooldown: number;
    mana_cost: number;
}

type Ability_Definition = Ability_Definition_Passive | Ability_Definition_Active;

type Battle = {
    delta_head: number;
    units: Unit[];
    players: Battle_Player[];
    deltas: Battle_Delta[];
    turning_player_index: number;
    cells: Cell[];
    grid_size: XY;
}

type Cell = {
    occupied: boolean;
    cost: number;
    position: XY;
}

type Unit = {
    type: Unit_Type;
    id: number;
    owner_player_id: number;
    dead: boolean;
    position: XY;
    health: number;
    mana: number;
    max_health: number;
    max_mana: number,
    move_points: number;
    max_move_points: number;
    attack_damage: number;
    has_taken_an_action_this_turn: boolean;
    level: number;
}

type Ability = {
    id: Ability_Id;
    type: Ability_Type;
    cooldown_remaining: number;
    cooldown: number;
    mana_cost: number;
}

function grid_cell_at(battle: Battle, at: XY): Cell | undefined {
    if (at.x < 0 || at.x >= battle.grid_size.x || at.y < 0 || at.y >= battle.grid_size.y) {
        return undefined;
    }

    return battle.cells[at.x * battle.grid_size.y + at.y];
}

function grid_cell_index(battle: Battle, at: XY): number {
    return at.x * battle.grid_size.y + at.y;
}

function grid_cell_at_unchecked(battle: Battle, at: XY): Cell {
    return battle.cells[at.x * battle.grid_size.y + at.y];
}

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function unit_at(battle: Battle, at: XY): Unit | undefined {
    return battle.units.find(unit => !unit.dead && xy_equal(at, unit.position));
}

function find_unit_by_id(battle: Battle, id: number): Unit | undefined {
    return battle.units.find(unit => unit.id == id);
}

// TODO replace with a more efficient A* implementation
function can_find_path(battle: Battle, from: XY, to: XY, maximum_distance: number): [boolean, number] {
    const indices_already_checked: boolean[] = [];
    const from_index = grid_cell_index(battle, from);

    let indices_not_checked: number[] = [];

    indices_not_checked.push(from_index);
    indices_already_checked[from_index] = true;

    for (let current_cost = 0; indices_not_checked.length > 0 && current_cost <= maximum_distance; current_cost++) {
        const new_indices: number[] = [];

        for (const index of indices_not_checked) {
            const cell = battle.cells[index];
            const at = cell.position;

            if (xy_equal(to, at)) {
                return [true, current_cost];
            }

            const neighbors = [
                grid_cell_at(battle, xy(at.x + 1, at.y)),
                grid_cell_at(battle, xy(at.x - 1, at.y)),
                grid_cell_at(battle, xy(at.x, at.y + 1)),
                grid_cell_at(battle, xy(at.x, at.y - 1))
            ];

            for (const neighbor of neighbors) {
                if (!neighbor) continue;

                const neighbor_index = grid_cell_index(battle, neighbor.position);

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

function fill_grid(battle: Battle) {
    for (let x = 0; x < battle.grid_size.x; x++) {
        for (let y = 0; y < battle.grid_size.y; y++) {
            battle.cells.push({
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

function move_unit(battle: Battle, unit: Unit, to: XY) {
    const cell_from = grid_cell_at_unchecked(battle, unit.position);
    const cell_to = grid_cell_at_unchecked(battle, to);
    const from_was_occupied = cell_from.occupied;

    cell_from.occupied = false;
    cell_to.occupied = from_was_occupied;

    unit.position = to;
}

function are_cells_on_the_same_line_and_have_lesser_or_equal_distance_between(a: XY, b: XY, distance: number) {
    if (a.x == b.x) {
        return Math.abs(a.y - b.y) <= distance;
    }

    if (a.y == b.y) {
        return Math.abs(a.x - b.x) <= distance;
    }

    return false;
}

function is_attack_target_valid(battle: Battle, unit: Unit, target: XY): boolean {
    const from = unit.position;

    switch (unit.type) {
        case Unit_Type.pudge: {
            return are_cells_on_the_same_line_and_have_lesser_or_equal_distance_between(from, target, 10);
        }

        case Unit_Type.sniper: {
            return are_cells_on_the_same_line_and_have_lesser_or_equal_distance_between(from, target, 4);
        }

        case Unit_Type.ursa: {
            return are_cells_on_the_same_line_and_have_lesser_or_equal_distance_between(from, target, 1);
        }
    }

    return true;
}

function pass_turn_to_next_player(battle: Battle) {
    battle.turning_player_index++;

    if (battle.turning_player_index == battle.players.length) {
        battle.turning_player_index -= battle.players.length;
    }
}

function update_state_after_turn_ends(battle: Battle) {
    for (const unit of battle.units) {
        unit.move_points = unit.max_move_points;
        unit.has_taken_an_action_this_turn = false;
    }
}

function collapse_deltas(battle: Battle, head_before_merge: number, deltas: Battle_Delta[]) {
    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    for (; battle.delta_head < battle.deltas.length; battle.delta_head++) {
        const delta = battle.deltas[battle.delta_head];

        if (!delta) {
            break;
        }

        collapse_delta(battle, delta);
    }
}

// TODO figure out if we can just push battle effect deltas on the deltas stack
// TODO implement while (have_more_deltas) collapse_deltas() loop

function collapse_delta(battle: Battle, delta: Battle_Delta) {
    switch (delta.type) {
        case Battle_Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                move_unit(battle, unit, delta.to_position);

                unit.move_points -= delta.move_cost;
            }

            break;
        }

        case Battle_Delta_Type.unit_spawn: {
            const definition = unit_definition_by_type(delta.unit_type);

            battle.units.push({
                type: delta.unit_type,
                id: delta.unit_id,
                owner_player_id: delta.owner_id,
                position: delta.at_position,
                attack_damage: 6,
                move_points: definition.move_points,
                max_move_points: definition.move_points,
                health: definition.health,
                max_health: definition.health,
                mana: definition.mana,
                max_mana: definition.mana,
                dead: false,
                has_taken_an_action_this_turn: false,
                level: 1
            });

            grid_cell_at_unchecked(battle, delta.at_position).occupied = true;

            break;
        }

        case Battle_Delta_Type.health_change: {
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (target) {
                target.health = delta.new_health;

                if (delta.new_health == 0) {
                    grid_cell_at_unchecked(battle, target.position).occupied = false;

                    target.dead = true;
                }
            }

            break;
        }

        case Battle_Delta_Type.unit_attack: {
            switch (delta.effect.type) {
                case Battle_Effect_Type.nothing: break;
                case Battle_Effect_Type.basic_attack: {
                    collapse_delta(battle, delta.effect.delta);

                    break;
                }

                case Battle_Effect_Type.pudge_hook: {
                    if (delta.effect.result.hit) {
                        const [damage, move] = delta.effect.result.deltas;

                        collapse_delta(battle, damage);

                        const move_target = find_unit_by_id(battle, move.unit_id);

                        if (move_target) {
                            move_unit(battle, move_target, move.to_position);
                        }
                    }

                    break;
                }

                default: unreachable(delta.effect);
            }

            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                unit.has_taken_an_action_this_turn = true;
            }

            break;
        }

        case Battle_Delta_Type.unit_force_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                move_unit(battle, unit, delta.to_position);
            }

            break;
        }

        case Battle_Delta_Type.end_turn: {
            update_state_after_turn_ends(battle);
            pass_turn_to_next_player(battle);

            break;
        }

        default: unreachable(delta);
    }
}