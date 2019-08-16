declare const enum Source_Type {
    none = 0,
    unit = 1,
    player = 2,
    item = 3
}

type Source_None = {
    type: Source_Type.none
}

type Source_Unit = {
    type: Source_Type.unit
    unit: Unit
    ability_id: Ability_Id
}

type Source_Player = {
    type: Source_Type.player
    player: Battle_Player
}

type Source_Item = {
    type: Source_Type.item
    item_id: Item_Id
}

type Source = Source_None | Source_Unit | Source_Item | Source_Player

type Battle = {
    has_started: boolean
    delta_head: number
    units: Unit[]
    runes: Rune[]
    shops: Shop[]
    trees: Tree[]
    players: Battle_Player[]
    deltas: Delta[]
    turning_player_index: number
    cells: Cell[]
    grid_size: XY
    change_health: (battle: Battle, source: Source, target: Unit, change: Health_Change) => boolean,
    apply_modifier: (source: Source, target: Unit, modifier: Modifier_Application) => void,
    end_turn: (battle: Battle) => void
}

type Battle_Player = {
    id: number
    name: string
    hand: Card[]
    gold: number
    has_used_a_card_this_turn: boolean
    deployment_zone: Deployment_Zone
}

type Cell = {
    occupied: boolean;
    cost: number;
    position: XY;
}

type Unit_Base = Unit_Stats & {
    id: number;
    dead: boolean;
    position: XY;
    has_taken_an_action_this_turn: boolean;
    attack: Ability;
    abilities: Ability[]
    ability_bench: Ability[]
    modifiers: Modifier[]
}

type Unit = Hero | Creep

type Hero =  Unit_Base & {
    type: Hero_Type;
    supertype: Unit_Supertype.hero
    owner: Battle_Player;
    level: number
    items: Item[]
}

type Creep = Unit_Base & {
    supertype: Unit_Supertype.creep
}

type Rune = {
    type: Rune_Type
    id: number
    position: XY
}

type Shop = {
    id: number
    position: XY
    items: Item[]
}

type Tree = {
    id: number
    position: XY
}

type Modifier_Base = {
    id: Modifier_Id
    handle_id: number
    source: Source
    changes: Modifier_Change[]
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

type XY = {
    x: number;
    y: number;
}

type Cost_Population_Result = {
    cell_index_to_cost: number[];
    cell_index_to_parent_index: number[];
}

const max_unit_level = 3;
const shop_range = 2;

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
function direction_normal_between_points(from: XY, to: XY): XY {
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

function are_units_allies(a: Unit, b: Unit): boolean {
    /*
                    hero creep
            hero     ?    -
            creep    -    +

            ? : check player ids
            + : are allies
            - : are enemies
     */

    if (a.supertype == Unit_Supertype.creep && b.supertype == Unit_Supertype.creep) {
        return true;
    }

    if (a.supertype != Unit_Supertype.creep && b.supertype != Unit_Supertype.creep) {
        return a.owner == b.owner;
    }

    return false;
}

function player_owns_unit(player: Battle_Player, unit: Unit) {
    if (unit.supertype == Unit_Supertype.creep) {
        return false;
    }

    return unit.owner == player;
}

function rune_at(battle: Battle, at: XY) : Rune | undefined {
    return battle.runes.find(rune => xy_equal(rune.position, at));
}

function shop_at(battle: Battle, at: XY) : Shop | undefined {
    return battle.shops.find(shop => xy_equal(shop.position, at));
}

function is_unit_out_of_the_game(unit: Unit) {
    return unit.state_out_of_the_game_counter > 0;
}

function is_unit_stunned(unit: Unit) {
    return unit.state_stunned_counter > 0;
}

function is_unit_silenced(unit: Unit) {
    return unit.state_silenced_counter > 0;
}

function is_unit_disarmed(unit: Unit) {
    return unit.state_disarmed_counter > 0;
}

function is_point_in_shop_range(xy: XY, shop: Shop) {
    return rectangular(xy, shop.position) <= shop_range;
}

function find_unit_by_id(battle: Battle, id: number): Unit | undefined {
    return battle.units.find(unit => unit.id == id);
}

function find_hero_by_id(battle: Battle, id: number): Hero | undefined {
    const unit = find_unit_by_id(battle, id);

    if (unit && unit.supertype == Unit_Supertype.hero) {
        return unit;
    }
}

function find_player_by_id(battle: Battle, id: number): Battle_Player | undefined {
    return battle.players.find(player => player.id == id);
}

function find_rune_by_id(battle: Battle, id: number): Rune | undefined {
    return battle.runes.find(rune => rune.id == id);
}

function find_shop_by_id(battle: Battle, id: number): Shop | undefined {
    return battle.shops.find(shop => shop.id == id);
}

function find_player_card_by_id(player: Battle_Player, card_id: number): Card | undefined {
    return player.hand.find(card => card.id == card_id);
}

function find_modifier_by_handle_id(battle: Battle, id: number): [ Unit, Modifier ] | undefined {
    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (modifier.handle_id == id) {
                return [unit, modifier];
            }
        }
    }
}

function try_consume_unit_action(unit: Unit, ability_id: Ability_Id) {
    const ability = find_unit_ability(unit, ability_id);

    if (ability && ability.type != Ability_Type.passive) {
        if (!ability_has_flag(ability ,Ability_Flag.does_not_consume_action)) {
            unit.has_taken_an_action_this_turn = true;
        }
    }
}

function ability_has_flag(ability: Ability_Active, flag: Ability_Flag) {
    return ability.flags.indexOf(flag) != -1;
}

function no_source(): Source_None {
    return {
        type: Source_Type.none
    }
}

function unit_source(unit: Unit, ability_id: Ability_Id): Source_Unit {
    return {
        type: Source_Type.unit,
        unit: unit,
        ability_id: ability_id
    }
}

function player_source(player: Battle_Player): Source_Player {
    return {
        type: Source_Type.player,
        player: player
    }
}

function item_source(item_id: Item_Id): Source_Item {
    return {
        type: Source_Type.item,
        item_id: item_id
    }
}

function make_battle(participants: Battle_Participant_Info[], grid_width: number, grid_height: number): Battle {
    return {
        has_started: false,
        delta_head: 0,
        turning_player_index: 0,
        units: [],
        runes: [],
        shops: [],
        cells: [],
        trees: [],
        players: participants.map(participant => ({
            id: participant.id,
            name: participant.name,
            deployment_zone: participant.deployment_zone,
            gold: 0,
            has_used_a_card_this_turn: false,
            hand: []
        })),
        deltas: [],
        grid_size: xy(grid_width, grid_height),
        change_health: change_health_default,
        apply_modifier: apply_modifier_default,
        end_turn: end_turn_default
    }
}

// TODO replace with a more efficient A* implementation
function can_find_path(battle: Battle, from: XY, to: XY, ignore_runes = false): [boolean, number] {
    const indices_already_checked: boolean[] = [];
    const from_index = grid_cell_index(battle, from);

    let indices_not_checked: number[] = [];

    indices_not_checked.push(from_index);
    indices_already_checked[from_index] = true;

    for (let current_cost = 0; indices_not_checked.length > 0; current_cost++) {
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

                let neighbor_occupied = neighbor.occupied;

                if (ignore_runes) {
                    const occupied_by_rune = !!rune_at(battle, neighbor.position);

                    neighbor_occupied = neighbor.occupied && !occupied_by_rune;
                }

                if (neighbor_occupied) {
                    indices_already_checked[neighbor_index] = true;
                    continue;
                }

                new_indices.push(neighbor_index);

                indices_already_checked[neighbor_index] = true;
            }
        }

        indices_not_checked = new_indices;
    }

    return [false, Number.MAX_SAFE_INTEGER];
}

// TODO the relation between to == undefined and Cost_Population_Result == undefined produces too many non-null asserts
function populate_path_costs(battle: Battle, from: XY, to: XY | undefined = undefined, ignore_runes = false): Cost_Population_Result | undefined {
    const cell_index_to_cost: number[] = [];
    const cell_index_to_parent_index: number[] = [];
    const indices_already_checked: boolean[] = [];
    const from_index = grid_cell_index(battle, from);

    let indices_not_checked: number[] = [];

    indices_not_checked.push(from_index);
    indices_already_checked[from_index] = true;
    cell_index_to_cost[from_index] = 0;

    for (let current_cost = 0; indices_not_checked.length > 0; current_cost++) {
        const new_indices: number[] = [];

        for (const index of indices_not_checked) {
            const cell = battle.cells[index];
            const at = cell.position;

            cell_index_to_cost[index] = current_cost;

            if (to && xy_equal(to, at)) {
                return {
                    cell_index_to_cost: cell_index_to_cost,
                    cell_index_to_parent_index: cell_index_to_parent_index
                };
            }

            const neighbors = grid_cell_neighbors(battle, at);

            for (const neighbor of neighbors) {
                if (!neighbor) continue;

                const neighbor_cell_index = grid_cell_index(battle, neighbor.position);

                if (indices_already_checked[neighbor_cell_index]) continue;

                let neighbor_occupied = neighbor.occupied;

                if (ignore_runes) {
                    const occupied_by_rune = !!rune_at(battle, neighbor.position);

                    neighbor_occupied = neighbor.occupied && !occupied_by_rune;
                }

                if (neighbor_occupied) {
                    indices_already_checked[neighbor_cell_index] = true;
                    continue;
                }

                new_indices.push(neighbor_cell_index);

                cell_index_to_parent_index[neighbor_cell_index] = index;
                indices_already_checked[neighbor_cell_index] = true;
            }
        }

        indices_not_checked = new_indices;
    }

    if (to) {
        return undefined;
    } else {
        return {
            cell_index_to_cost: cell_index_to_cost,
            cell_index_to_parent_index: cell_index_to_parent_index
        };
    }
}

function ability_targeting_fits(battle: Battle, targeting: Ability_Targeting, from: XY, check_at: XY): boolean {
    switch (targeting.type) {
        case Ability_Targeting_Type.line: {
            if (!are_points_on_the_same_line(from, check_at)) {
                return false;
            }

            const distance = distance_between_points_on_the_same_line(from, check_at);
            return distance > 0 && distance <= targeting.line_length;
        }

        case Ability_Targeting_Type.rectangular_area_around_caster: {
            const distance = rectangular(from, check_at);
            return distance > 0 && distance <= targeting.area_radius;
        }

        case Ability_Targeting_Type.unit_in_manhattan_distance: {
            const distance = manhattan(from, check_at);

            if (targeting.include_caster) {
                return distance <= targeting.distance;
            } else {
                return distance > 0 && distance <= targeting.distance;
            }
        }

        case Ability_Targeting_Type.any_free_cell: {
            const cell = grid_cell_at(battle, check_at);

            if (cell) {
                return !cell.occupied;
            }

            return false;
        }
    }
}

function ability_selector_fits(selector: Ability_Target_Selector, from: XY, to: XY, check_at: XY): boolean {
    function points_on_the_same_line(a: XY, b: XY, c: XY) {
        return are_points_on_the_same_line(a, b) && are_points_on_the_same_line(a, c) && are_points_on_the_same_line(b, c);
    }

    function get_line_segment_end(length: number, direction: XY = direction_normal_between_points(from, to)): XY {
        return xy(from.x + direction.x * length, from.y + direction.y * length);
    }

    function fits_line(length: number): boolean {
        const head = get_line_segment_end(length);
        const from_tail_to_point = distance_between_points_on_the_same_line(check_at, from);
        const from_head_to_point = distance_between_points_on_the_same_line(check_at, head);
        return from_tail_to_point > 0 && from_tail_to_point <= length && from_head_to_point <= length;
    }

    switch (selector.type) {
        case Ability_Target_Selector_Type.single_target: {
            return xy_equal(to, check_at);
        }

        case Ability_Target_Selector_Type.rectangle: {
            return rectangular(to, check_at) <= selector.area_radius;
        }

        case Ability_Target_Selector_Type.line: {
            if (points_on_the_same_line(from, to, check_at)) {
                return fits_line(selector.length);
            }

            return false;
        }

        case Ability_Target_Selector_Type.t_shape: {
            if (points_on_the_same_line(from, to, check_at)) {
                return fits_line(selector.stem_length);
            }

            const direction = direction_normal_between_points(from, to);
            const head = get_line_segment_end(selector.stem_length, direction);
            const direction_left = xy(-direction.y, direction.x);
            const left_arm_end = xy(head.x + direction_left.x * selector.arm_length, head.y + direction_left.y * selector.arm_length);

            if (points_on_the_same_line(left_arm_end, check_at, head)) {
                return distance_between_points_on_the_same_line(head, check_at) <= selector.arm_length;
            }

            return false;
        }
    }
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

function are_points_on_the_same_line(a: XY, b: XY): boolean {
    return a.x == b.x || a.y == b.y;
}

function distance_between_points_on_the_same_line(a: XY, b: XY): number {
    return Math.abs(a.y - b.y) + Math.abs(a.x - b.x);
}

function catch_up_to_head(battle: Battle) {
    while (battle.deltas.length != battle.delta_head) {
        const target_head = battle.deltas.length;

        for (; battle.delta_head < target_head; battle.delta_head++) {
            collapse_delta(battle, battle.deltas[battle.delta_head]);
        }
    }
}

function find_unit_ability(unit: Unit, ability_id: Ability_Id): Ability | undefined {
    if (ability_id == unit.attack.id) return unit.attack;

    return unit.abilities.find(ability => ability.id == ability_id);
}

function replace_ability(unit: Unit, ability_id_to_bench: Ability_Id, currently_benched_ability_id: Ability_Id) {
    const benched_ability_index = unit.ability_bench.findIndex(ability => ability.id == currently_benched_ability_id);

    if (benched_ability_index == -1) return;

    if (ability_id_to_bench == unit.attack.id) {
        const old_attack = unit.attack;
        unit.attack = unit.ability_bench[benched_ability_index];
        unit.ability_bench[benched_ability_index] = old_attack;
        return;
    } else {
        const ability_to_bench_index = unit.abilities.findIndex(ability => ability.id == ability_id_to_bench);

        if (ability_to_bench_index == -1) return;

        const ability_to_bench = unit.abilities[ability_to_bench_index];

        unit.abilities[ability_to_bench_index] = unit.ability_bench[benched_ability_index];
        unit.ability_bench[benched_ability_index] = ability_to_bench;
    }
}

function change_health_default(battle: Battle, source: Source, target: Unit, change: Health_Change): boolean {
    target.health = change.new_value;

    if (!target.dead && change.new_value == 0) {
        free_cell(battle, target.position);

        target.dead = true;

        return true;
    }

    return false;
}

function end_turn_default(battle: Battle) {
    const turn_passed_from_player_id = battle.players[battle.turning_player_index].id;

    battle.turning_player_index++;

    if (battle.turning_player_index == battle.players.length) {
        battle.turning_player_index = 0;
    }

    for (const unit of battle.units) {
        if (unit.supertype == Unit_Supertype.creep || unit.owner.id == turn_passed_from_player_id) {
            for (const modifier of unit.modifiers) {
                if (!modifier.permanent) {
                    if (modifier.duration_remaining > 0) {
                        modifier.duration_remaining--;
                    }
                }
            }
        }
    }

    for (const player of battle.players) {
        player.has_used_a_card_this_turn = false;
    }
}

function change_health(battle: Battle, source: Source, target: Unit, change: Health_Change) {
    return battle.change_health(battle, source, target, change);
}

function change_gold(player: Battle_Player, gold_change: number) {
    player.gold += gold_change;
}

function occupy_cell(battle: Battle, at: XY) {
    const cell = grid_cell_at(battle, at);

    if (cell) {
        cell.occupied = true;
    }
}

function free_cell(battle: Battle, at: XY) {
    const cell = grid_cell_at(battle, at);

    if (cell) {
        cell.occupied = false;
    }
}

function apply_modifier_changes(target: Unit, changes: Modifier_Change[], invert: boolean) {
    for (const change of changes) {
        switch (change.type) {
            case Modifier_Change_Type.field_change: {
                apply_modifier_field_change(target, change, invert);

                break;
            }

            case Modifier_Change_Type.ability_swap: {
                const swap_from = invert ? change.swap_to : change.original_ability;
                const swap_to = invert ? change.original_ability : change.swap_to;

                replace_ability(target, swap_from, swap_to);

                break;
            }

            default: unreachable(change);
        }
    }
}

function apply_modifier(battle: Battle, source: Source, target: Unit, modifier: Modifier_Application) {
    battle.apply_modifier(source, target, modifier);
}

function apply_modifier_default(source: Source, target: Unit, modifier: Modifier_Application) {
    const modifier_base: Modifier_Base = {
        id: modifier.modifier_id,
        handle_id: modifier.modifier_handle_id,
        source: source,
        changes: modifier.changes
    };

    if (modifier.duration) {
        target.modifiers.push({
            ...modifier_base,
            permanent: false,
            duration_remaining: modifier.duration,
        });
    } else {
        target.modifiers.push({
            ...modifier_base,
            permanent: true
        });
    }

    apply_modifier_changes(target, modifier.changes, false);
}

function collapse_ability_effect(battle: Battle, effect: Ability_Effect) {
    switch (effect.ability_id) {
        case Ability_Id.luna_moon_glaive: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (source && target) {
                change_health(battle, unit_source(source, effect.ability_id), target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.mirana_starfall: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (source && target) {
                change_health(battle, unit_source(source, effect.ability_id), target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            const source = find_unit_by_id(battle, effect.source_unit_id);

            if (source) {
                change_health_multiple(battle, unit_source(source, effect.ability_id), effect.targets);
            }

            break;
        }

        default: unreachable(effect);
    }
}

function change_health_multiple(battle: Battle, source: Source, changes: Unit_Health_Change[]) {
    for (const change of changes) {
        const target = find_unit_by_id(battle, change.target_unit_id);

        if (target) {
            change_health(battle, source, target, change.change);
        }
    }
}

function apply_modifier_multiple(battle: Battle, source: Source, applications: Unit_Modifier_Application[]) {
    for (const application of applications) {
        const target = find_unit_by_id(battle, application.target_unit_id);

        if (target) {
            apply_modifier(battle, source, target, application.modifier);
        }
    }
}

function change_health_and_apply_modifier_multiple(battle: Battle, source: Source, changes: (Unit_Health_Change & Unit_Modifier_Application)[]) {
    for (const change of changes) {
        const target = find_unit_by_id(battle, change.target_unit_id);

        if (target) {
            change_health(battle, source, target, change.change);
            apply_modifier(battle, source, target, change.modifier);
        }
    }
}

function collapse_unit_target_ability_use(battle: Battle, caster: Unit, target: Unit, cast: Delta_Unit_Target_Ability) {
    const source = unit_source(caster, cast.ability_id);

    switch (cast.ability_id) {
        case Ability_Id.pudge_dismember: {
            change_health(battle, source, caster, cast.health_restored);
            change_health(battle, source, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            change_health(battle, source, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.tide_gush: {
            change_health(battle, source, target, cast.damage_dealt);
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Ability_Id.skywrath_ancient_seal: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        case Ability_Id.dragon_knight_dragon_tail: {
            change_health(battle, source, target, cast.damage_dealt);
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Ability_Id.lion_hex: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        case Ability_Id.lion_finger_of_death: {
            change_health(battle, source, target, cast.damage_dealt);
            break;
        }

        case Ability_Id.venge_magic_missile: {
            change_health(battle, source, target, cast.damage_dealt);
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Ability_Id.venge_nether_swap: {
            const caster_position = caster.position;
            const target_position = target.position;

            caster.position = target_position;
            target.position = caster_position;

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        case Ability_Id.dark_seer_surge: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        default: unreachable(cast);
    }
}

function collapse_no_target_ability_use(battle: Battle, unit: Unit, cast: Delta_Use_No_Target_Ability) {
    const source = unit_source(unit, cast.ability_id);

    switch (cast.ability_id) {
        case Ability_Id.tide_ravage: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.luna_eclipse: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.pudge_rot: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.skywrath_concussive_shot: {
            if (cast.result.hit) {
                const target = find_unit_by_id(battle, cast.result.target_unit_id);

                if (target) {
                    change_health(battle, source, target, cast.result.damage);
                    apply_modifier(battle, source, target, cast.result.modifier);
                }
            }

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form: {
            apply_modifier(battle, source, unit, cast.modifier);

            break;
        }

        case Ability_Id.mirana_starfall: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_ground_target_ability_use(battle: Battle, caster: Unit, at: Cell, cast: Delta_Ground_Target_Ability) {
    const source = unit_source(caster, cast.ability_id);

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

        case Ability_Id.skywrath_mystic_flare: {
            change_health_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.dragon_knight_breathe_fire: {
            change_health_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form_attack: {
            change_health_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.lion_impale: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.mirana_arrow: {
            if (cast.result.hit) {
                const target = find_unit_by_id(battle, cast.result.stun.target_unit_id);

                if (target) {
                    apply_modifier(battle, source, target, cast.result.stun.modifier);
                }
            }

            break;
        }

        case Ability_Id.mirana_leap: {
            move_unit(battle, caster, cast.target_position);
            break;
        }

        case Ability_Id.venge_wave_of_terror: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.dark_seer_vacuum: {
            for (const target of cast.targets) {
                const target_unit = find_unit_by_id(battle, target.target_unit_id);

                if (target_unit) {
                    move_unit(battle, target_unit, target.move_to);
                }
            }

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_no_target_spell_use(battle: Battle, caster: Battle_Player, cast: Delta_Use_No_Target_Spell) {
    const source = player_source(caster);

    switch (cast.spell_id) {
        case Spell_Id.mekansm: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        default: unreachable(cast.spell_id);
    }
}

function collapse_unit_target_spell_use(battle: Battle, caster: Battle_Player, target: Unit, cast: Delta_Use_Unit_Target_Spell) {
    const source = player_source(caster);

    switch (cast.spell_id) {
        case Spell_Id.euls_scepter: {
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        default: unreachable(cast.spell_id);
    }
}

function collapse_item_equip(battle: Battle, hero: Hero, delta: Delta_Equip_Item) {
    const source = item_source(delta.item_id);

    switch (delta.item_id) {
        case Item_Id.refresher_shard: {
            for (const change of delta.charge_changes) {
                const ability = find_unit_ability(hero, change.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.charges_remaining = change.charges_remaining;
                }
            }

            break;
        }

        case Item_Id.tome_of_knowledge: {
            hero.level = delta.new_level;
            break;
        }

        case Item_Id.assault_cuirass: {
            apply_modifier(battle, source, hero, delta.modifier);
            break;
        }

        case Item_Id.divine_rapier: {
            apply_modifier(battle, source, hero, delta.modifier);
            break
        }

        case Item_Id.heart_of_tarrasque: {
            apply_modifier(battle, source, hero, delta.modifier);
            break
        }

        case Item_Id.satanic: {
            apply_modifier(battle, source, hero, delta.modifier);
            break
        }

        case Item_Id.boots_of_travel: {
            apply_modifier(battle, source, hero, delta.modifier);
            break
        }

        case Item_Id.mask_of_madness: {
            apply_modifier(battle, source, hero, delta.modifier);
            break
        }

        case Item_Id.armlet: {
            apply_modifier(battle, source, hero, delta.modifier);
            break;
        }

        default: unreachable(delta);
    }
}

function collapse_delta(battle: Battle, delta: Delta): void {
    function ability_definition_to_ability(definition: Ability_Definition): Ability {
        if (definition.type == Ability_Type.passive) {
            return definition;
        }

        return {
            ...definition,
            charges_remaining: definition.charges
        }
    }

    function unit_base(id: number, definition: Unit_Definition, at: XY): Unit_Base {
        return {
            id: id,
            position: at,
            attack: ability_definition_to_ability(definition.attack),
            attack_damage: definition.attack_damage,
            move_points: definition.move_points,
            health: definition.health,
            dead: false,
            has_taken_an_action_this_turn: false,
            abilities: definition.abilities.map(ability_definition_to_ability),
            ability_bench: definition.ability_bench.map(ability_definition_to_ability),
            modifiers: [],
            attack_bonus: 0,
            max_health: definition.health,
            max_move_points: definition.move_points,
            move_points_bonus: 0,
            state_stunned_counter: 0,
            state_silenced_counter: 0,
            state_disarmed_counter: 0,
            state_out_of_the_game_counter: 0,
            armor: 0
        }
    }

    switch (delta.type) {
        case Delta_Type.game_start: {
            battle.has_started = true;
            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                move_unit(battle, unit, delta.to_position);

                unit.move_points -= delta.move_cost;
            }

            break;
        }

        case Delta_Type.rune_pick_up: {
            const unit = find_hero_by_id(battle, delta.unit_id);
            const rune_index = battle.runes.findIndex(rune => rune.id == delta.rune_id);

            if (!unit) break;
            if (rune_index == -1) break;

            const rune = battle.runes[rune_index];

            move_unit(battle, unit, rune.position);

            unit.move_points -= delta.move_cost;

            switch (delta.rune_type) {
                case Rune_Type.double_damage: {
                    apply_modifier(battle, no_source(), unit, delta.modifier);
                    break;
                }

                case Rune_Type.haste: {
                    apply_modifier(battle, no_source(), unit, delta.modifier);
                    break;
                }

                case Rune_Type.regeneration: {
                    change_health(battle, no_source(), unit, delta.heal);
                    break;
                }

                case Rune_Type.bounty: {
                    change_gold(unit.owner, delta.gold_gained);

                    break;
                }

                default: unreachable(delta);
            }

            battle.runes.splice(rune_index, 1);

            break;
        }

        case Delta_Type.hero_spawn: {
            const owner = find_player_by_id(battle, delta.owner_id);

            if (!owner) break;

            battle.units.push({
                ...unit_base(delta.unit_id, unit_definition_by_type(delta.hero_type), delta.at_position),
                supertype: Unit_Supertype.hero,
                type: delta.hero_type,
                owner: owner,
                level: 1,
                items: []
            });

            occupy_cell(battle, delta.at_position);

            break;
        }

        case Delta_Type.creep_spawn: {
            battle.units.push({
                ...unit_base(delta.unit_id, creep_definition(), delta.at_position),
                supertype: Unit_Supertype.creep
            });

            occupy_cell(battle, delta.at_position);

            break;
        }

        case Delta_Type.health_change: {
            const source = find_unit_by_id(battle, delta.source_unit_id);
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (source && target) {
                change_health(battle, no_source(), target, delta);
            }

            break;
        }

        case Delta_Type.rune_spawn: {
            battle.runes.push({
                id: delta.rune_id,
                type: delta.rune_type,
                position: delta.at
            });

            occupy_cell(battle, delta.at);

            break;
        }

        case Delta_Type.shop_spawn: {
            battle.shops.push({
                id: delta.shop_id,
                items: delta.item_pool.map(item_id => item_id_to_item(item_id)),
                position: delta.at
            });

            occupy_cell(battle, delta.at);

            break;
        }

        case Delta_Type.tree_spawn: {
            battle.trees.push({
                id: delta.tree_id,
                position: delta.at_position
            });

            occupy_cell(battle, delta.at_position);

            break;
        }

        case Delta_Type.use_no_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (!unit) break;

            try_consume_unit_action(unit, delta.ability_id);
            collapse_no_target_ability_use(battle, unit, delta);

            break;
        }

        case Delta_Type.use_ground_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            const target = grid_cell_at(battle, delta.target_position);

            if (!unit) break;
            if (!target) break;

            try_consume_unit_action(unit, delta.ability_id);
            collapse_ground_target_ability_use(battle, unit, target, delta);

            break;
        }

        case Delta_Type.use_unit_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (!unit) break;
            if (!target) break;

            try_consume_unit_action(unit, delta.ability_id);
            collapse_unit_target_ability_use(battle, unit, target, delta);

            break;
        }

        case Delta_Type.use_no_target_spell: {
            const player = find_player_by_id(battle, delta.player_id);

            if (!player) break;

            collapse_no_target_spell_use(battle, player, delta);

            break;
        }

        case Delta_Type.use_unit_target_spell: {
            const player = find_player_by_id(battle, delta.player_id);
            const target = find_unit_by_id(battle, delta.target_id);

            if (!player) break;
            if (!target) break;

            collapse_unit_target_spell_use(battle, player, target, delta);

            break;
        }

        case Delta_Type.start_turn: {
            for (const unit of battle.units) {
                if (unit.attack.type != Ability_Type.passive) {
                    unit.attack.charges_remaining = unit.attack.charges;
                }

                unit.move_points = unit.max_move_points + unit.move_points_bonus;
                unit.has_taken_an_action_this_turn = false;
            }

            break;
        }

        case Delta_Type.end_turn: {
            battle.end_turn(battle);

            break;
        }

        case Delta_Type.level_change: {
            const unit = find_hero_by_id(battle, delta.unit_id);

            if (unit) {
                unit.level = delta.new_level;
            }

            break;
        }

        case Delta_Type.modifier_removed: {
            const result = find_modifier_by_handle_id(battle, delta.modifier_handle_id);

            if (result) {
                const [unit, modifier] = result;
                const index = unit.modifiers.indexOf(modifier);

                unit.modifiers.splice(index, 1);

                apply_modifier_changes(unit, modifier.changes, true);
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

        case Delta_Type.draw_hero_card: {
            const player = find_player_by_id(battle, delta.player_id);

            if (player) {
                player.hand.push({
                    type: Card_Type.hero,
                    id: delta.card_id,
                    hero_type: delta.hero_type
                });
            }

            break;
        }

        case Delta_Type.draw_spell_card: {
            const player = find_player_by_id(battle, delta.player_id);

            if (player) {
                player.hand.push({
                    id: delta.card_id,
                    ...spell_definition_by_id(delta.spell_id)
                });
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

        case Delta_Type.purchase_item: {
            const unit = find_hero_by_id(battle, delta.unit_id);
            const shop = find_shop_by_id(battle, delta.shop_id);

            if (!unit) break;
            if (!shop) break;

            const item_index = shop.items.findIndex(item => item.id == delta.item_id);

            if (item_index == -1) break;

            shop.items.splice(item_index, 1);
            unit.owner.gold -= delta.gold_cost;

            break;
        }

        case Delta_Type.equip_item: {
            const hero = find_hero_by_id(battle, delta.unit_id);

            if (hero) {
                const item = item_id_to_item(delta.item_id);

                hero.items.push(item);

                collapse_item_equip(battle, hero, delta);
            }

            break;
        }

        case Delta_Type.gold_change: {
            const player = find_player_by_id(battle, delta.player_id);

            if (player) {
                change_gold(player, delta.change);
            }

            break;
        }

        case Delta_Type.game_over: {
            break;
        }

        default: unreachable(delta);
    }
}