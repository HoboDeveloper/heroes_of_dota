declare function ability_definition_to_ability<T>(definition: Ability_Definition): Ability;

declare const enum Ability_Error {
    other = 0,
    dead = 1,
    no_mana = 2,
    on_cooldown = 3,
    invalid_target = 4,
    already_acted_this_turn = 5,
    not_learned_yet = 6
}

type Ability_Authorization_Ok = {
    success: true;
    ability: Ability;
}

type Ability_Authorization_Error = {
    success: false;
    error: Ability_Error;
}

type Ability_Authorization = Ability_Authorization_Ok | Ability_Authorization_Error;

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
    has_taken_an_action_this_turn: boolean;
    level: number;
    attack: Ability;
    abilities: Ability[];
}

type Ability_Passive = Ability_Definition_Passive;

type Ability_Active = Ability_Definition_Active & {
    cooldown_remaining: number;
}

type Ability = Ability_Passive | Ability_Active;

type XY = {
    x: number;
    y: number;
}

const max_unit_level = 4;

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

function can_ground_target_ability_be_cast_at_target_from_source(targeting: Ability_Targeting, from: XY, at: XY): boolean {
    switch (targeting.type) {
        case Ability_Targeting_Type.line: {
            if (xy_equal(from, at)) return false;

            return are_cells_on_the_same_line_and_have_lesser_or_equal_distance_between(from, at, targeting.line_length);
        }
    }

    return false;
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

function pass_turn_to_next_player(battle: Battle) {
    for (const unit of battle.units) {
        unit.move_points = unit.max_move_points;
        unit.has_taken_an_action_this_turn = false;
    }

    battle.turning_player_index++;

    if (battle.turning_player_index == battle.players.length) {
        battle.turning_player_index -= battle.players.length;
    }

    const turning_player_id = battle.players[battle.turning_player_index].id;

    for (const unit of battle.units) {
        if (unit.owner_player_id == turning_player_id) {
            for (const ability of unit.abilities) {
                if (ability.type != Ability_Type.passive && ability.cooldown_remaining > 0) {
                    ability.cooldown_remaining--;
                }
            }
        }
    }
}

function flatten_deltas(deltas: Battle_Delta[]): Battle_Delta[] {
    const flattened: Battle_Delta[] = [];

    for (const delta of deltas) {
        flattened.push(delta);

        switch (delta.type) {
            case Battle_Delta_Type.unit_ground_target_ability:
            case Battle_Delta_Type.unit_unit_target_ability:
            case Battle_Delta_Type.unit_use_no_target_ability: {
                const effect_deltas = ability_effect_to_deltas(delta.effect);

                if (effect_deltas) {
                    flattened.push(...effect_deltas);
                }

                break;
            }
        }
    }

    return flattened;
}

function collapse_deltas(battle: Battle, head_before_merge: number, deltas: Battle_Delta[]): Battle_Delta[] {
    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    const flattened = flatten_deltas(deltas);

    for (let flattened_delta of flattened) {
        if (!flattened_delta) {
            break;
        }

        collapse_delta(battle, flattened_delta);
    }

    battle.delta_head += deltas.length;

    return flattened;
}

function find_unit_ability(unit: Unit, ability_id: Ability_Id): Ability | undefined {
    if (ability_id == unit.attack.id) return unit.attack;

    return unit.abilities.find(ability => ability.id == ability_id);
}

function authorize_ability_use_by_unit(unit: Unit, ability_id: Ability_Id): Ability_Authorization {
    function error(err: Ability_Error): Ability_Authorization_Error {
        return {
            success: false,
            error: err
        }
    }

    const ability = find_unit_ability(unit, ability_id);

    if (unit.dead) return error(Ability_Error.dead);
    if (unit.has_taken_an_action_this_turn) return error(Ability_Error.already_acted_this_turn);

    if (!ability) return error(Ability_Error.other);

    if (unit.level < ability.available_since_level) return error(Ability_Error.not_learned_yet);

    if (ability.type == Ability_Type.passive) return error(Ability_Error.other);
    if (ability.cooldown_remaining > 0) return error(Ability_Error.on_cooldown);
    if (ability.mana_cost > unit.mana) return error(Ability_Error.no_mana);

    return {
        success: true,
        ability: ability
    };
}

function ability_effect_to_deltas(effect: Ability_Effect): Battle_Delta[] | undefined {
    switch (effect.ability_id) {
        case Ability_Id.basic_attack: return effect.delta ? [ effect.delta ] : undefined;
        case Ability_Id.pudge_hook: if (effect.result.hit) return effect.result.deltas; else return;
        case Ability_Id.pudge_rot: return effect.deltas;
        case Ability_Id.pudge_dismember: return [ effect.damage_delta, effect.heal_delta ];

        default: unreachable(effect);
    }
}

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
                attack: ability_definition_to_ability(definition.attack),
                move_points: definition.move_points,
                max_move_points: definition.move_points,
                health: definition.health,
                max_health: definition.health,
                mana: definition.mana,
                max_mana: definition.mana,
                dead: false,
                has_taken_an_action_this_turn: false,
                level: 1,
                abilities: definition.abilities.map(ability_definition_to_ability)
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

        case Battle_Delta_Type.mana_change: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                unit.mana = delta.new_mana;
            }

            break;
        }

        case Battle_Delta_Type.unit_use_no_target_ability:
        case Battle_Delta_Type.unit_unit_target_ability:
        case Battle_Delta_Type.unit_ground_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                unit.has_taken_an_action_this_turn = true;

                const ability = find_unit_ability(unit, delta.effect.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.cooldown_remaining = ability.cooldown;
                }
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
            pass_turn_to_next_player(battle);

            break;
        }

        case Battle_Delta_Type.unit_level_change: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                unit.level = delta.new_level;
            }

            break;
        }

        default: unreachable(delta);
    }
}