declare const enum Player_Action_Error {
    not_your_turn = 0,
    other = 1
}

declare const enum Card_Use_Error {
    other = 0,
    has_used_a_card_this_turn = 1,
}

declare const enum Hero_Card_Use_Error {
    other = 0,
    not_in_deployment_zone = 1,
    cell_occupied = 2
}

declare const enum Act_On_Unit_Error {
    other = 0,
    dead = 1,
    out_of_the_game = 2
}

declare const enum Act_On_Owned_Unit_Error {
    not_owned = 0
}

declare const enum No_Target_Spell_Card_Use_Error {
    other = 0
}

declare const enum Unit_Target_Spell_Card_Use_Error {
    other = 0
}

declare const enum Spell_Target_Unit_Error {
    other = 0,
    out_of_the_game = 1,
    not_a_hero = 2,
    not_an_ally = 3
}

declare const enum Use_Shop_Error {
    other = 0,
    not_in_shop_range = 1,
    not_a_hero = 2,
}

declare const enum Purchase_Item_Error {
    other = 0,
    not_enough_gold = 1
}

declare const enum Order_Unit_Error {
    other = 0,
    unit_has_already_acted_this_turn = 1,
    stunned = 2,
}

declare const enum Ability_Use_Error {
    other = 0,
    no_charges = 1,
    not_learned_yet = 2,
    silenced = 3,
    disarmed = 4,
    unusable = 5,
}

declare const enum Move_Order_Error {
    other = 0,
    not_enough_move_points = 1,
    path_not_found = 2
}

declare const enum Rune_Pickup_Order_Error {
    other = 0,
    not_a_hero = 1
}

declare const enum Unit_Target_Ability_Use_Error {
    other = 0,
    not_in_range = 1
}

declare const enum Ground_Target_Ability_Use_Error {
    other = 0,
    not_in_range = 1
}

type Action_Error<T> = {
    ok: false
    kind: T
}

type Player_Action_Permission = {
    ok: true
    battle: Battle
    player: Battle_Player
}

type Card_Use_Permission = Player_Action_Permission & {
    card: Card
}

type Hero_Card_Use_Permission = {
    ok: true
    player: Battle_Player
    card: Card_Hero
    cell: Cell
}

type Existing_Hero_Card_Use_Permission = {
    ok: true
    player: Battle_Player
    source_spell: Spell_Id
    card: Card_Existing_Hero
    cell: Cell
}

type Spell_Card_Use_Permission<Spell_Type> = {
    ok: true
    battle: Battle
    player: Battle_Player
    card: Card_Spell
    spell: Spell_Type
}

type Act_On_Unit_Permission = {
    ok: true
    battle: Battle
    unit: Unit
}

type Act_On_Owned_Unit_Permission = Player_Action_Permission & Act_On_Unit_Permission

type No_Target_Spell_Card_Use_Permission = Spell_Card_Use_Permission<Card_Spell_No_Target>
type Unit_Target_Spell_Card_Use_Permission = Spell_Card_Use_Permission<Card_Spell_Unit_Target>

type Spell_Target_Unit_Permission = {
    ok: true
    unit: Unit
    player: Battle_Player
    card: Card_Spell
    spell: Card_Spell_Unit_Target
}

type Use_Shop_Permission = {
    ok: true
    hero: Hero
    shop: Shop
}

type Purchase_Item_Permission = {
    ok: true
    hero: Hero
    shop: Shop
    item: Item
}

type Order_Unit_Permission = Act_On_Unit_Permission & {
}

type Move_Order_Permission = Order_Unit_Permission & {
    cost: number
}

type Rune_Pickup_Order_Permission = {
    ok: true
    hero: Hero
    rune: Rune
}

type Ability_Use_Permission = Order_Unit_Permission & {
    ability: Ability_Active;
}

type Unit_Target_Ability_Use_Permission = {
    ok: true
    unit: Unit
    target: Unit
    ability: Ability_Unit_Target & { charges_remaining: number }
}

type Ground_Target_Ability_Use_Permission = {
    ok: true
    unit: Unit
    target: Cell
    ability: Ability_Ground_Target & { charges_remaining: number }
}

type Auth<Ok, Error> = Ok | Action_Error<Error>
type Player_Action_Auth = Auth<Player_Action_Permission, Player_Action_Error>
type Card_Use_Auth = Auth<Card_Use_Permission, Card_Use_Error>
type Hero_Card_Use_Auth = Auth<Hero_Card_Use_Permission, Hero_Card_Use_Error>
type Existing_Hero_Card_Use_Auth = Auth<Existing_Hero_Card_Use_Permission, Hero_Card_Use_Error>
type No_Target_Spell_Card_Use_Auth = Auth<No_Target_Spell_Card_Use_Permission, No_Target_Spell_Card_Use_Error>
type Unit_Target_Spell_Card_Use_Auth = Auth<Unit_Target_Spell_Card_Use_Permission, Unit_Target_Spell_Card_Use_Error>
type Spell_Target_Unit_Auth = Auth<Spell_Target_Unit_Permission, Spell_Target_Unit_Error>
type Act_On_Unit_Auth = Auth<Act_On_Unit_Permission, Act_On_Unit_Error>
type Use_Shop_Auth = Auth<Use_Shop_Permission, Use_Shop_Error>
type Purchase_Item_Auth = Auth<Purchase_Item_Permission, Purchase_Item_Error>
type Order_Unit_Auth = Auth<Order_Unit_Permission, Order_Unit_Error>
type Move_Order_Auth = Auth<Move_Order_Permission, Move_Order_Error>
type Rune_Pickup_Order_Auth = Auth<Rune_Pickup_Order_Permission, Rune_Pickup_Order_Error>
type Ability_Use_Auth = Auth<Ability_Use_Permission, Ability_Use_Error>
type Unit_Target_Ability_Use_Auth = Auth<Unit_Target_Ability_Use_Permission, Unit_Target_Ability_Use_Error>
type Ground_Target_Ability_Use_Auth = Auth<Ground_Target_Ability_Use_Permission, Ground_Target_Ability_Use_Error>
type Act_On_Owned_Unit_Auth = Auth<Act_On_Owned_Unit_Permission, Act_On_Owned_Unit_Error>;

function authorize_action_by_player(battle: Battle, player: Battle_Player): Player_Action_Auth {
    if (get_turning_player(battle).id != player.id) return { ok: false, kind: Player_Action_Error.not_your_turn };

    return {
        ok: true,
        battle: battle,
        player: player
    }
}

function authorize_card_use(action: Player_Action_Permission, card_id: number): Card_Use_Auth {
    const card = find_player_card_by_id(action.player, card_id);

    if (!card) return { ok: false, kind: Card_Use_Error.other };
    if (action.player.has_used_a_card_this_turn) return { ok: false, kind: Card_Use_Error.has_used_a_card_this_turn };

    return {
        ...action,
        card: card
    }
}

function authorize_hero_card_location(battle: Battle, player: Battle_Player, at: XY): Auth<{ ok: true, cell: Cell }, Hero_Card_Use_Error> {
    const cell = grid_cell_at(battle, at);

    if (!cell) return { ok: false, kind: Hero_Card_Use_Error.other };
    if (cell.occupied) return { ok: false, kind: Hero_Card_Use_Error.cell_occupied };

    const zone = player.deployment_zone;
    const is_in_zone =
        at.x >= zone.min_x &&
        at.y >= zone.min_y &&
        at.x <  zone.max_x &&
        at.y <  zone.max_y;

    if (!is_in_zone) return { ok: false, kind: Hero_Card_Use_Error.not_in_deployment_zone };

    return {
        ok: true,
        cell: cell
    }
}

function authorize_hero_card_use(use: Card_Use_Permission, at: XY): Hero_Card_Use_Auth {
    if (use.card.type != Card_Type.hero) return { ok: false, kind: Hero_Card_Use_Error.other };

    const location = authorize_hero_card_location(use.battle, use.player, at);

    if (!location.ok) {
        return { ok: false, kind: location.kind };
    }

    return {
        ok: true,
        player: use.player,
        card: use.card,
        cell: location.cell
    }
}

function authorize_existing_hero_card_use(use: Card_Use_Permission, at: XY): Existing_Hero_Card_Use_Auth {
    if (use.card.type != Card_Type.existing_hero) return { ok: false, kind: Hero_Card_Use_Error.other };

    const location = authorize_hero_card_location(use.battle, use.player, at);

    if (!location.ok) {
        return { ok: false, kind: location.kind };
    }

    return {
        ok: true,
        player: use.player,
        card: use.card,
        cell: location.cell,
        source_spell: use.card.generated_by
    }
}

function authorize_no_target_card_spell_use(use: Card_Use_Permission): No_Target_Spell_Card_Use_Auth {
    if (use.card.type != Card_Type.spell) return { ok: false, kind: No_Target_Spell_Card_Use_Error.other };
    if (use.card.spell_type != Spell_Type.no_target) return { ok: false, kind: No_Target_Spell_Card_Use_Error.other };

    return {
        ok: true,
        battle: use.battle,
        player: use.player,
        card: use.card,
        spell: use.card
    }
}

function authorize_unit_target_for_spell_card_use(use: Unit_Target_Spell_Card_Use_Permission, unit_id: number): Spell_Target_Unit_Auth {
    const unit = find_unit_by_id(use.battle, unit_id);

    if (!unit) return  { ok: false, kind: Spell_Target_Unit_Error.other };

    return authorize_known_unit_target_for_spell_card_use(use, unit);
}

function authorize_known_unit_target_for_spell_card_use(use: Unit_Target_Spell_Card_Use_Permission, unit: Unit): Spell_Target_Unit_Auth {
    function error(error: Spell_Target_Unit_Error): Action_Error<Spell_Target_Unit_Error> {
        return { ok: false, kind: error };
    }

    const flags = use.spell.targeting_flags;
    const has_flag = (flag: Spell_Unit_Targeting_Flag) => flags.indexOf(flag) != -1; // .includes won't work in panorama

    if (is_unit_out_of_the_game(unit)) return error(Spell_Target_Unit_Error.out_of_the_game);

    if (has_flag(Spell_Unit_Targeting_Flag.allies) && !player_owns_unit(use.player, unit)) return error(Spell_Target_Unit_Error.not_an_ally);
    if (has_flag(Spell_Unit_Targeting_Flag.dead) && !unit.dead) return error(Spell_Target_Unit_Error.other);
    if (has_flag(Spell_Unit_Targeting_Flag.heroes) && unit.supertype != Unit_Supertype.hero) return error(Spell_Target_Unit_Error.not_a_hero);

    return {
        ok: true,
        player: use.player,
        unit: unit,
        spell: use.spell,
        card: use.card
    }
}

function authorize_unit_target_spell_use(use: Card_Use_Permission): Unit_Target_Spell_Card_Use_Auth {
    function error(error: Unit_Target_Spell_Card_Use_Error): Action_Error<Unit_Target_Spell_Card_Use_Error> {
        return { ok: false, kind: error };
    }

    if (use.card.type != Card_Type.spell) return error(Unit_Target_Spell_Card_Use_Error.other);
    if (use.card.spell_type != Spell_Type.unit_target) return error(Unit_Target_Spell_Card_Use_Error.other);

    return {
        ok: true,
        battle: use.battle,
        player: use.player,
        card: use.card,
        spell: use.card,
    }
}

function authorize_act_on_known_unit(battle: Battle, unit: Unit): Act_On_Unit_Auth {
    if (unit.dead) return { ok: false, kind: Act_On_Unit_Error.dead };
    if (is_unit_out_of_the_game(unit)) return { ok: false, kind: Act_On_Unit_Error.out_of_the_game };

    return {
        ok: true,
        battle: battle,
        unit: unit
    }
}

function authorize_act_on_unit(battle: Battle, unit_id: number): Act_On_Unit_Auth {
    const unit = find_unit_by_id(battle, unit_id);

    if (!unit) return { ok: false, kind: Act_On_Unit_Error.other };

    return authorize_act_on_known_unit(battle, unit);
}

function authorize_act_on_owned_unit(player_action: Player_Action_Permission, act_on_unit: Act_On_Unit_Permission): Act_On_Owned_Unit_Auth {
    if (!player_owns_unit(player_action.player, act_on_unit.unit)) return { ok: false, kind: Act_On_Owned_Unit_Error.not_owned };

    return {
        ...player_action,
        ...act_on_unit
    }
}

function authorize_shop_use(act_on_unit: Act_On_Owned_Unit_Permission, shop_id: number): Use_Shop_Auth {
    function error(error: Use_Shop_Error): Action_Error<Use_Shop_Error> {
        return { ok: false, kind: error };
    }

    const { unit, battle } = act_on_unit;

    const shop = find_shop_by_id(battle, shop_id);

    if (!shop) return error(Use_Shop_Error.other);
    if (unit.supertype != Unit_Supertype.hero) return error(Use_Shop_Error.not_a_hero);
    if (!is_point_in_shop_range(unit.position, shop)) return error(Use_Shop_Error.not_in_shop_range);

    return {
        ok: true,
        hero: unit,
        shop: shop
    }
}

function authorize_item_purchase(use_shop: Use_Shop_Permission, item_id: Item_Id): Purchase_Item_Auth {
    function error(error: Purchase_Item_Error): Action_Error<Purchase_Item_Error> {
        return { ok: false, kind: error };
    }

    const { hero, shop } = use_shop;

    const item = shop.items.find(item => item.id == item_id);

    if (!item) return error(Purchase_Item_Error.other);
    if (hero.owner.gold < item.gold_cost) return error(Purchase_Item_Error.not_enough_gold);

    return {
        ok: true,
        hero: hero,
        shop: shop,
        item: item
    }
}

function authorize_order_unit(act_on_unit: Act_On_Unit_Permission): Order_Unit_Auth {
    function error(error: Order_Unit_Error): Action_Error<Order_Unit_Error> {
        return { ok: false, kind: error };
    }

    const unit = act_on_unit.unit;

    if (unit.has_taken_an_action_this_turn) return error(Order_Unit_Error.unit_has_already_acted_this_turn);
    if (is_unit_stunned(unit)) return error(Order_Unit_Error.stunned);

    return {
        ...act_on_unit
    }
}

function authorize_move_order(order_unit: Order_Unit_Permission, to: XY, ignore_runes: boolean): Move_Order_Auth {
    const { battle, unit } = order_unit;
    const [could_find_path, cost] = can_find_path(battle, unit.position, to, ignore_runes);

    if (!could_find_path) return { ok: false, kind: Move_Order_Error.path_not_found };
    if (cost > unit.move_points)  return { ok: false, kind: Move_Order_Error.not_enough_move_points };
    if (xy_equal(unit.position, to)) return { ok: false, kind: Move_Order_Error.other };

    return {
        ...order_unit,
        cost: cost
    }
}

function authorize_rune_pickup_order(order_unit: Order_Unit_Permission, rune_id: number): Rune_Pickup_Order_Auth {
    const rune = order_unit.battle.runes.find(rune => rune.id == rune_id);

    if (!rune) return { ok: false, kind: Rune_Pickup_Order_Error.other };
    if (order_unit.unit.supertype != Unit_Supertype.hero) return { ok: false, kind: Rune_Pickup_Order_Error.not_a_hero };

    return {
        ok: true,
        hero: order_unit.unit,
        rune: rune
    }
}

function authorize_ability_use(order_unit: Order_Unit_Permission, ability_id: Ability_Id): Ability_Use_Auth {
    function error(err: Ability_Use_Error): Action_Error<Ability_Use_Error> {
        return {
            ok: false,
            kind: err
        }
    }

    const unit = order_unit.unit;

    const ability = find_unit_ability(unit, ability_id);

    if (!ability) return error(Ability_Use_Error.other);
    if (ability.type == Ability_Type.passive) return error(Ability_Use_Error.unusable);

    if (ability == unit.attack) {
        if (is_unit_disarmed(unit)) return error(Ability_Use_Error.disarmed);
    } else {
        if (is_unit_silenced(unit)) return error(Ability_Use_Error.silenced);
    }

    if (unit.supertype == Unit_Supertype.hero) {
        if (unit.level < ability.available_since_level) return error(Ability_Use_Error.not_learned_yet);
    }

    if (ability.charges_remaining < 1) return error(Ability_Use_Error.no_charges);

    return {
        ...order_unit,
        ability: ability
    };
}

function authorize_unit_target_ability_use(use: Ability_Use_Permission, on_target: Act_On_Unit_Permission): Unit_Target_Ability_Use_Auth {
    if (!ability_targeting_fits(use.battle, use.ability.targeting, use.unit.position, on_target.unit.position)) {
        return { ok: false, kind: Unit_Target_Ability_Use_Error.not_in_range };
    }

    if (use.ability.type != Ability_Type.target_unit) return { ok: false, kind: Unit_Target_Ability_Use_Error.other };

    return {
        ok: true,
        unit: use.unit,
        ability: use.ability,
        target: on_target.unit
    }
}

function authorize_ground_target_ability_use(use: Ability_Use_Permission, at: XY): Ground_Target_Ability_Use_Auth {
    const cell = grid_cell_at(use.battle, at);

    if (!cell) return { ok: false, kind: Ground_Target_Ability_Use_Error.other };

    if (!ability_targeting_fits(use.battle, use.ability.targeting, use.unit.position, cell.position)) {
        return { ok: false, kind: Ground_Target_Ability_Use_Error.not_in_range };
    }

    if (use.ability.type != Ability_Type.target_ground) return { ok: false, kind: Ground_Target_Ability_Use_Error.other };

    return {
        ok: true,
        unit: use.unit,
        ability: use.ability,
        target: cell
    }
}

function authorize_spell_use_buyback_check(use: Spell_Target_Unit_Permission) {
    if (use.spell.spell_id == Spell_Id.buyback && use.player.gold < get_buyback_cost(use.unit)) {
        return false;
    }

    return true;
}