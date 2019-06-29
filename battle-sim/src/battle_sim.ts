declare function ability_definition_to_ability<T>(definition: Ability_Definition): Ability;

declare const enum Ability_Error {
    other = 0,
    dead = 1,
    no_charges = 2,
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
    delta_head: number
    units: Unit[]
    players: Battle_Player[]
    deltas: Delta[]
    turning_player_index: number
    cells: Cell[]
    grid_size: XY
    modifiers: Modifier_Data[]
    change_health: (battle: Battle, source: Unit, target: Unit, change: Value_Change) => boolean
    change_field: (battle: Battle, target: Unit, field: Unit_Field, change: Value_Change, tie_to_modifier_id?: number) => void
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
    move_points: number;
    has_taken_an_action_this_turn: boolean;
    attack: Ability;
    [Unit_Field.level]: number;
    [Unit_Field.max_health]: number;
    [Unit_Field.max_move_points]: number;
    [Unit_Field.attack_bonus]: number;
    [Unit_Field.state_stunned_counter]: number
    [Unit_Field.armor]: number
    abilities: Ability[];
    modifiers: Modifier[]
}

type Modifier_Base = {
    id: number
    source: Unit
    source_ability: Ability_Id
}

type Permanent_Modifier = Modifier_Base & {
    permanent: true
}

type Expiring_Modifier = Modifier_Base & {
    permanent: false
    duration_remaining: number
}

type Modifier = Permanent_Modifier | Expiring_Modifier;

type Ability_Passive = Ability_Definition_Passive;
type Ability_Active = Ability_Definition_Active & {
    charges_remaining: number;
}

type Ability = Ability_Passive | Ability_Active;

declare const enum Modifier_Data_Type {
    field_change = 0
}

type Modifier_Data_Base = {
    id: number
}

type Modifier_Data_Field_Change = Modifier_Data_Base & {
    type: Modifier_Data_Type.field_change
    field: Unit_Field,
    change: Value_Change
}

type Modifier_Data = Modifier_Data_Field_Change;

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

function make_battle(participants: Battle_Participant_Info[], grid_width: number, grid_height: number): Battle {
    return {
        delta_head: 0,
        turning_player_index: 0,
        units: [],
        cells: [],
        players: participants.map(participant => ({
            id: participant.id,
            name: participant.name,
            deployment_zone: participant.deployment_zone,
            has_used_a_card_this_turn: false,
            hand: []
        })),
        deltas: [],
        modifiers: [],
        grid_size: xy(grid_width, grid_height),
        change_field: change_field_default,
        change_health: change_health_default
    }
}

function register_field_change_modifier(battle: Battle, modifier_id: number, field: Unit_Field, change: Value_Change) {
    battle.modifiers.push({
        id: modifier_id,
        type: Modifier_Data_Type.field_change,
        field: field,
        change: change
    });
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

function ability_targeting_fits(targeting: Ability_Targeting, from: XY, at: XY): boolean {
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
                if (ability.id == Ability_Id.basic_attack) {
                    ability.charges_remaining = ability.charges;
                }
            }

            for (const modifier of unit.modifiers) {
                if (!modifier.permanent) {
                    if (modifier.duration_remaining > 0) {
                        modifier.duration_remaining--;
                    }
                }
            }
        }
    }
}

function collapse_deltas(battle: Battle, head_before_merge: number, deltas: Delta[]) {
    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    for (const delta of deltas) {
        if (!delta) {
            break;
        }

        collapse_delta(battle, delta);
    }

    battle.delta_head += deltas.length;
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
    if (ability.charges_remaining < 1) return error(Ability_Error.no_charges);

    return {
        success: true,
        ability: ability
    };
}

function change_health_default(battle: Battle, source: Unit, target: Unit, change: Value_Change): boolean {
    target.health = change.new_value;

    if (!target.dead && change.new_value == 0) {
        grid_cell_at_unchecked(battle, target.position).occupied = false;

        target.dead = true;

        return true;
    }

    return false;
}

function change_health(battle: Battle, source: Unit, target: Unit, change: Value_Change) {
    return battle.change_health(battle, source, target, change);
}

function change_field_default(battle: Battle, target: Unit, field: Unit_Field, change: Value_Change, tie_to_modifier_id?: number) {
    target[field] = change.new_value;

    switch (field) {
        case Unit_Field.max_move_points: target.move_points = Math.min(target.move_points, change.new_value); break;
        case Unit_Field.max_health: target.health = Math.min(target.health, change.new_value); break;
    }

    if (tie_to_modifier_id != undefined) {
        register_field_change_modifier(battle, tie_to_modifier_id, field, change);
    }
}

function change_field(battle: Battle, target: Unit, field: Unit_Field, change: Value_Change, tie_to_modifier_id?: number) {
    battle.change_field(battle, target, field, change, tie_to_modifier_id);
}

function apply_modifier(source: Unit, target: Unit, modifier_id: number, ability_id: Ability_Id, duration?: number) {
    if (duration) {
        target.modifiers.push({
            id: modifier_id,
            source: source,
            source_ability: ability_id,
            permanent: false,
            duration_remaining: duration
        });
    } else {
        target.modifiers.push({
            id: modifier_id,
            source: source,
            source_ability: ability_id,
            permanent: true
        });
    }
}

function collapse_ability_effect(battle: Battle, effect: Ability_Effect) {
    switch (effect.ability_id) {
        case Ability_Id.pudge_flesh_heap: {
            const unit = find_unit_by_id(battle, effect.unit_id);

            if (unit) {
                change_field(battle, unit, Unit_Field.max_health, effect.max_health_change);
                change_health(battle, unit, unit, effect.health_change);
            }
            break;
        }

        case Ability_Id.luna_lunar_blessing: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (source && target) {
                apply_modifier(source, target, effect.modifier_id, effect.ability_id);
                change_field(battle, target, Unit_Field.attack_bonus, effect.damage_bonus, effect.modifier_id);
            }

            break;
        }

        case Ability_Id.luna_moon_glaive: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (source && target) {
                change_health(battle, source, target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.tide_kraken_shell: {
            break;
        }

        default: unreachable(effect);
    }
}

function collapse_unit_target_ability_use(battle: Battle, source: Unit, target: Unit, cast: Delta_Unit_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.pudge_dismember: {
            change_health(battle, source, source, cast.health_restored);
            change_health(battle, source, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            change_health(battle, source, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.tide_gush: {
            change_health(battle, source, target, cast.damage_dealt);
            change_field(battle, target, Unit_Field.max_move_points, cast.move_points_change, cast.modifier_id);
            apply_modifier(source, target, cast.modifier_id, cast.ability_id, cast.duration);

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_no_target_ability_use(battle: Battle, source: Unit, cast: Delta_Use_No_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.tide_ravage: {
            for (const effect of cast.targets) {
                const target = find_unit_by_id(battle, effect.target_unit_id);

                if (target) {
                    change_health(battle, source, target, effect.damage_dealt);
                    change_field(battle, target, Unit_Field.state_stunned_counter, effect.stun_counter, effect.modifier_id);
                    apply_modifier(source, target, effect.modifier_id, cast.ability_id, cast.duration);
                }
            }

            break;
        }

        case Ability_Id.luna_eclipse: {
            for (const effect of cast.targets) {
                const target = find_unit_by_id(battle, effect.target_unit_id);

                if (target) {
                    change_health(battle, source, target, effect.damage_dealt);
                }
            }

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            for (const effect of cast.targets) {
                const target = find_unit_by_id(battle, effect.target_unit_id);

                if (target) {
                    change_health(battle, source, target, effect.damage_dealt);
                    change_field(battle, target, Unit_Field.attack_bonus, effect.attack_change, effect.modifier_id);
                    apply_modifier(source, target, effect.modifier_id, cast.ability_id, cast.duration);
                }
            }

            break;
        }

        case Ability_Id.pudge_rot: {
            for (const effect of cast.targets) {
                const target = find_unit_by_id(battle, effect.target_unit_id);

                if (target) {
                    change_health(battle, source, target, effect.damage_dealt);
                }
            }

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_ground_target_ability_use(battle: Battle, source: Unit, at: Cell, cast: Delta_Ground_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.basic_attack: {
            if (cast.result.hit) {
                const target = find_unit_by_id(battle, cast.result.target_unit_id);

                if (target) {
                    change_health(battle, source, target, cast.result.damage_dealt);
                }
            }

            break;
        }

        case Ability_Id.pudge_hook: {
            if (cast.result.hit) {
                const target = find_unit_by_id(battle, cast.result.target_unit_id);

                if (target) {
                    move_unit(battle, target, cast.result.move_target_to);
                    change_health(battle, source, target, cast.result.damage_dealt);
                }
            }

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_delta(battle: Battle, delta: Delta): void {
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
                dead: false,
                has_taken_an_action_this_turn: false,
                abilities: definition.abilities.map(ability_definition_to_ability),
                modifiers: [],
                [Unit_Field.attack_bonus]: 0,
                [Unit_Field.level]: 1,
                [Unit_Field.max_health]: definition.health,
                [Unit_Field.max_move_points]: definition.move_points,
                [Unit_Field.state_stunned_counter]: 0,
                [Unit_Field.armor]: 0
            });

            grid_cell_at_unchecked(battle, delta.at_position).occupied = true;

            break;
        }

        case Delta_Type.health_change: {
            const source = find_unit_by_id(battle, delta.source_unit_id);
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (source && target) {
                change_health(battle, source, target, delta);
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
                    ability.charges = ability.charges - 1;
                }

                switch (delta.type) {
                    case Delta_Type.use_no_target_ability: {
                        collapse_no_target_ability_use(battle, unit, delta);

                        break;
                    }

                    case Delta_Type.use_unit_target_ability: {
                        const target = find_unit_by_id(battle, delta.target_unit_id);

                        if (target) {
                            collapse_unit_target_ability_use(battle, unit, target, delta);
                        }

                        break;
                    }

                    case Delta_Type.use_ground_target_ability: {
                        const target = grid_cell_at(battle, delta.target_position);

                        if (target) {
                            collapse_ground_target_ability_use(battle, unit, target, delta);
                        }

                        break;
                    }

                    default: unreachable(delta);
                }
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
                change_field(battle, unit, delta.field, delta); // TODO use Value_Change
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
                    permanent: false,
                    duration_remaining: delta.duration
                });
            }

            break;
        }

        case Delta_Type.permanent_modifier_applied: {
            const unit = find_unit_by_id(battle, delta.target_unit_id);
            const source = find_unit_by_id(battle, delta.source_unit_id);

            if (unit && source) {
                unit.modifiers.push({
                    id: delta.modifier_id,
                    source: source,
                    source_ability: delta.effect.ability_id,
                    permanent: true
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

                for (let modifier_data of battle.modifiers) {
                    if (modifier_data.id == modifier.id) {

                        switch (modifier_data.type) {
                            case Modifier_Data_Type.field_change: {
                                change_field(battle, unit, modifier_data.field, {
                                    new_value: unit[modifier_data.field] - modifier_data.change.value_delta,
                                    value_delta: -modifier_data.change.value_delta
                                });

                                break;
                            }

                            default: unreachable(modifier_data.type);
                        }

                        battle.modifiers.splice(index, 1);
                        break;
                    }
                }
            }

            break;
        }

        case Delta_Type.set_ability_charges_remaining: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                const ability = find_unit_ability(unit, delta.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.charges_remaining = delta.charges_remaining;
                }
            }

            break;
        }

        case Delta_Type.ability_effect_applied: {
            collapse_ability_effect(battle, delta.effect);

            break;
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

        case Delta_Type.game_over: {
            break;
        }

        default: unreachable(delta);
    }
}