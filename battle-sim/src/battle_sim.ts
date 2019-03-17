declare function ability_definition_to_ability<T>(definition: Ability_Definition): Ability;

declare const enum Ability_Error {
    other = 0,
    dead = 1,
    no_mana = 2,
    on_cooldown = 3,
    invalid_target = 4,
    already_acted_this_turn = 5,
    not_learned_yet = 6,
    stunned = 7
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
    deltas: Delta[];
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
    move_points: number;
    has_taken_an_action_this_turn: boolean;
    attack: Ability;
    [Unit_Field.level]: number;
    [Unit_Field.max_mana]: number;
    [Unit_Field.max_health]: number;
    [Unit_Field.max_move_points]: number;
    [Unit_Field.attack_bonus]: number;
    [Unit_Field.state_stunned_counter]: number
    [Unit_Field.armor]: number
    abilities: Ability[];
    modifiers: Modifier[]
}

type Modifier = {
    id: number
    source: Unit
    source_ability: Ability_Id
    duration_remaining: number
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

function grid_cell_at_raw(battle: Battle, x: number, y: number): Cell | undefined {
    if (x < 0 || x >= battle.grid_size.x || y < 0 || y >= battle.grid_size.y) {
        return undefined;
    }

    return battle.cells[x * battle.grid_size.y + y];
}

function grid_cell_at(battle: Battle, at: XY): Cell | undefined {
    return grid_cell_at_raw(battle, at.x, at.y);
}

function grid_cell_index_raw(battle: Battle, x: number, y: number): number | undefined {
    if (x < 0 || x >= battle.grid_size.x || y < 0 || y >= battle.grid_size.y) {
        return undefined;
    }

    return x * battle.grid_size.y + y;
}

function grid_cell_index(battle: Battle, at: XY): number {
    return at.x * battle.grid_size.y + at.y;
}

function grid_cell_at_unchecked(battle: Battle, at: XY): Cell {
    return battle.cells[at.x * battle.grid_size.y + at.y];
}

function grid_cell_neighbors(battle: Battle, at: XY): Array<Cell | undefined> {
    return [
        grid_cell_at_raw(battle, at.x + 1, at.y),
        grid_cell_at_raw(battle, at.x - 1, at.y),
        grid_cell_at_raw(battle, at.x, at.y + 1),
        grid_cell_at_raw(battle, at.x, at.y - 1)
    ];
}

// This will only work correctly if cells are on the same line
function direction_normal_between_points(battle: Battle, from: XY, to: XY): XY {
    const delta = xy_sub(to, from);

    return xy(Math.sign(delta.x), Math.sign(delta.y));
}

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function rectangular(from: XY, to: XY) {
    const delta_x = from.x - to.x;
    const delta_y = from.y - to.y;

    return Math.max(Math.abs(delta_x), Math.abs(delta_y));
}

function unit_at(battle: Battle, at: XY): Unit | undefined {
    return battle.units.find(unit => !unit.dead && xy_equal(at, unit.position));
}

function is_unit_stunned(unit: Unit) {
    return unit[Unit_Field.state_stunned_counter] > 0;
}

function find_unit_by_id(battle: Battle, id: number): Unit | undefined {
    return battle.units.find(unit => unit.id == id);
}

function find_player_by_id(battle: Battle, id: number): Battle_Player | undefined {
    return battle.players.find(player => player.id == id);
}

function find_player_card_by_id(player: Battle_Player, card_id: number): Card | undefined {
    return player.hand.find(card => card.id == card_id);
}

function find_modifier_by_id(battle: Battle, id: number): [ Unit, Modifier ] | undefined {
    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (modifier.id == id) {
                return [unit, modifier];
            }
        }
    }
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

            const neighbors = grid_cell_neighbors(battle, at);

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

function can_ability_be_cast_at_target_from_source(targeting: Ability_Targeting, from: XY, at: XY): boolean {
    switch (targeting.type) {
        case Ability_Targeting_Type.line: {
            if (xy_equal(from, at)) return false;

            return are_cells_on_the_same_line_and_have_lesser_or_equal_distance_between(from, at, targeting.line_length);
        }

        case Ability_Targeting_Type.rectangular_area_around_caster: {
            return rectangular(from, at) <= targeting.area_radius;
        }

        case Ability_Targeting_Type.unit_in_manhattan_distance: {
            return manhattan(from, at) <= targeting.distance;
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
    const turn_passed_from_player_id = battle.players[battle.turning_player_index].id;

    battle.turning_player_index++;

    if (battle.turning_player_index == battle.players.length) {
        battle.turning_player_index -= battle.players.length;
    }

    for (const unit of battle.units) {
        if (unit.owner_player_id == turn_passed_from_player_id) {
            for (const ability of unit.abilities) {
                if (ability.type != Ability_Type.passive && ability.cooldown_remaining > 0) {
                    ability.cooldown_remaining--;
                }
            }

            for (const modifier of unit.modifiers) {
                if (modifier.duration_remaining > 0) {
                    modifier.duration_remaining--;
                }
            }
        }
    }
}

function flatten_deltas(deltas: Delta[]): Delta[] {
    const flattened: Delta[] = [];

    for (const delta of deltas) {
        flattened.push(delta);

        switch (delta.type) {
            case Delta_Type.use_ground_target_ability:
            case Delta_Type.use_unit_target_ability:
            case Delta_Type.use_no_target_ability: {
                const cast_deltas = cast_to_deltas(delta);

                if (cast_deltas) {
                    flattened.push(...cast_deltas);
                }

                break;
            }

            case Delta_Type.ability_effect_applied:
            case Delta_Type.modifier_appled: {
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

function collapse_deltas(battle: Battle, head_before_merge: number, deltas: Delta[]): Delta[] {
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
    if (is_unit_stunned(unit)) return error(Ability_Error.stunned);

    if (!ability) return error(Ability_Error.other);

    if (unit[Unit_Field.level] < ability.available_since_level) return error(Ability_Error.not_learned_yet);

    if (ability.type == Ability_Type.passive) return error(Ability_Error.other);
    if (ability.cooldown_remaining > 0) return error(Ability_Error.on_cooldown);
    if (ability.mana_cost > unit.mana) return error(Ability_Error.no_mana);

    return {
        success: true,
        ability: ability
    };
}

function cast_to_deltas(cast: Delta_Unit_Target_Ability | Delta_Ground_Target_Ability | Delta_Use_No_Target_Ability): Delta[] | undefined {
    switch (cast.ability_id) {
        case Ability_Id.basic_attack: if (cast.result.hit) return [ cast.result.delta ]; else return;
        case Ability_Id.pudge_hook: if (cast.result.hit) return cast.result.deltas; else return;
        case Ability_Id.pudge_rot: return cast.deltas;
        case Ability_Id.pudge_dismember: return [ cast.damage_delta, cast.heal_delta ];
        case Ability_Id.tide_gush: return flatten_deltas([ cast.delta ]);
        case Ability_Id.tide_anchor_smash: return flatten_deltas(cast.deltas); // TODO we need a recursive flattener
        case Ability_Id.tide_ravage: return flatten_deltas(cast.deltas);
        case Ability_Id.luna_lucent_beam: return [ cast.delta ];
        case Ability_Id.luna_eclipse: return cast.deltas;

        default: unreachable(cast);
    }
}

function ability_effect_to_deltas(effect: Ability_Effect): Delta[] | undefined {
    switch (effect.ability_id) {
        case Ability_Id.pudge_flesh_heap: return effect.deltas;
        case Ability_Id.tide_gush: return flatten_deltas(effect.deltas);
        case Ability_Id.tide_anchor_smash: return flatten_deltas(effect.deltas); // TODO we need a recursive flattener
        case Ability_Id.tide_ravage: return flatten_deltas(effect.deltas);
        case Ability_Id.tide_kraken_shell: return [];
        case Ability_Id.luna_moon_glaive: return [ effect.delta ];
        case Ability_Id.luna_lunar_blessing: return [ effect.delta ];

        default: unreachable(effect);
    }
}

function collapse_delta(battle: Battle, delta: Delta) {
    switch (delta.type) {
        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                move_unit(battle, unit, delta.to_position);

                unit.move_points -= delta.move_cost;
            }

            break;
        }

        case Delta_Type.unit_spawn: {
            const definition = unit_definition_by_type(delta.unit_type);

            battle.units.push({
                type: delta.unit_type,
                id: delta.unit_id,
                owner_player_id: delta.owner_id,
                position: delta.at_position,
                attack: ability_definition_to_ability(definition.attack),
                move_points: definition.move_points,
                health: definition.health,
                mana: definition.mana,
                dead: false,
                has_taken_an_action_this_turn: false,
                abilities: definition.abilities.map(ability_definition_to_ability),
                modifiers: [],
                [Unit_Field.attack_bonus]: 0,
                [Unit_Field.level]: 1,
                [Unit_Field.max_mana]: definition.mana,
                [Unit_Field.max_health]: definition.health,
                [Unit_Field.max_move_points]: definition.move_points,
                [Unit_Field.state_stunned_counter]: 0,
                [Unit_Field.armor]: 0
            });

            grid_cell_at_unchecked(battle, delta.at_position).occupied = true;

            break;
        }

        case Delta_Type.health_change: {
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (target) {
                target.health = delta.new_value;

                if (delta.new_value == 0) {
                    grid_cell_at_unchecked(battle, target.position).occupied = false;

                    target.dead = true;
                }
            }

            break;
        }

        case Delta_Type.mana_change: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                unit.mana = delta.new_mana;
            }

            break;
        }

        case Delta_Type.use_no_target_ability:
        case Delta_Type.use_unit_target_ability:
        case Delta_Type.use_ground_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                unit.has_taken_an_action_this_turn = true;

                const ability = find_unit_ability(unit, delta.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.cooldown_remaining = ability.cooldown;
                }
            }

            break;
        }

        case Delta_Type.unit_force_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                move_unit(battle, unit, delta.to_position);
            }

            break;
        }

        case Delta_Type.start_turn: {
            for (const player of battle.players) {
                player.has_used_a_card_this_turn = false;
            }

            for (const unit of battle.units) {
                unit.move_points = unit[Unit_Field.max_move_points];
                unit.has_taken_an_action_this_turn = false;
            }

            break;
        }

        case Delta_Type.end_turn: {
            pass_turn_to_next_player(battle);

            break;
        }

        case Delta_Type.unit_field_change: {
            const unit = find_unit_by_id(battle, delta.target_unit_id);

            if (unit) {
                unit[delta.field] = delta.new_value;

                switch (delta.field) {
                    case Unit_Field.max_move_points: unit.move_points = Math.min(unit.move_points, delta.new_value); break;
                    case Unit_Field.max_health: unit.health = Math.min(unit.health, delta.new_value); break;
                    case Unit_Field.max_mana: unit.mana = Math.min(unit.mana, delta.new_value); break;
                }
            }

            break;
        }

        case Delta_Type.modifier_appled: {
            const unit = find_unit_by_id(battle, delta.target_unit_id);
            const source = find_unit_by_id(battle, delta.source_unit_id);

            if (unit && source) {
                unit.modifiers.push({
                    id: delta.modifier_id,
                    source: source,
                    source_ability: delta.effect.ability_id,
                    duration_remaining: delta.duration
                });
            }

            break;
        }

        case Delta_Type.modifier_removed: {
            const result = find_modifier_by_id(battle, delta.modifier_id);

            if (result) {
                const [unit, modifier] = result;
                const index = unit.modifiers.indexOf(modifier);

                unit.modifiers.splice(index, 1);
            }

            break;
        }

        case Delta_Type.set_ability_cooldown_remaining: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                const ability = find_unit_ability(unit, delta.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.cooldown_remaining = delta.cooldown_remaining;
                }
            }

            break;
        }

        case Delta_Type.ability_effect_applied: {
            return ability_effect_to_deltas(delta.effect);
        }

        case Delta_Type.draw_card: {
            const player = find_player_by_id(battle, delta.player_id);

            if (player) {
                player.hand.push(delta.card);
            }

            break;
        }

        case Delta_Type.use_card: {
            const player = find_player_by_id(battle, delta.player_id);

            if (!player) break;

            for (let index = 0; index < player.hand.length; index++) {
                if (player.hand[index].id == delta.card_id) {
                    player.hand.splice(index, 1);

                    player.has_used_a_card_this_turn = true;

                    break;
                }
            }

            break;
        }

        default: unreachable(delta);
    }
}