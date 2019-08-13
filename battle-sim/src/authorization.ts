declare const enum Player_Action_Error_Kind {
    not_your_turn = 0,
    other = 1
}

declare const enum Card_Use_Error_Kind {
    other = 0,
    has_used_a_card_this_turn = 1,
}

declare const enum Hero_Card_Use_Error_Kind {
    other = 0,
    not_in_deployment_zone = 1,
    cell_occupied = 2
}

declare const enum Act_On_Unit_Error_Kind {
    other = 0,
    dead = 1,
    out_of_the_game = 2
}

declare const enum No_Target_Spell_Card_Use_Error_Kind {
    other = 0
}

type Action_Error<T> = {
    ok: false
    kind: T
}

type Player_Action_Permission = {
    ok: true
    player: Battle_Player
}

type Card_Use_Permission = Player_Action_Permission & {
    ok: true
    card: Card
}

type Hero_Card_Use_Permission = {
    ok: true
    player: Battle_Player
    card: Card_Hero
    cell: Cell
}

type Spell_Card_Use_Permission<Spell_Type> = {
    ok: true
    player: Battle_Player
    card: Card_Spell
    spell: Spell_Type
}

type Act_On_Unit_Permission = {
    ok: true
    unit: Unit
}

type No_Target_Spell_Card_Use_Permission = Spell_Card_Use_Permission<Card_Spell_No_Target>
type Unit_Target_Spell_Card_Use_Permission = Spell_Card_Use_Permission<Card_Spell_Unit_Target> & {
    unit: Unit
}

type Auth<Ok, Error> = Ok | Action_Error<Error>
type Player_Action_Authorization = Auth<Player_Action_Permission, Player_Action_Error_Kind>
type Card_Use_Authorization = Auth<Card_Use_Permission, Card_Use_Error_Kind>
type Hero_Card_Use_Authorization = Auth<Hero_Card_Use_Permission, Hero_Card_Use_Error_Kind>
type No_Target_Spell_Card_Use_Authorization = Auth<No_Target_Spell_Card_Use_Permission, No_Target_Spell_Card_Use_Error_Kind>
type Unit_Target_Spell_Card_Use_Authorization = Auth<Unit_Target_Spell_Card_Use_Permission, No_Target_Spell_Card_Use_Error_Kind>
type Act_On_Unit_Authorization = Auth<Act_On_Unit_Permission, Act_On_Unit_Error_Kind>

function authorize_action_by_player(battle: Battle, player: Battle_Player): Player_Action_Authorization {
    if (get_turning_player(battle).id != player.id) return { ok: false, kind: Player_Action_Error_Kind.not_your_turn };

    return {
        ok: true,
        player: player
    }
}

function authorize_card_use(action_auth: Player_Action_Permission, card_id: number): Card_Use_Authorization {
    const card = find_player_card_by_id(action_auth.player, card_id);

    if (!card) return { ok: false, kind: Card_Use_Error_Kind.other };
    if (action_auth.player.has_used_a_card_this_turn) return { ok: false, kind: Card_Use_Error_Kind.has_used_a_card_this_turn };

    return {
        ...action_auth,
        ok: true,
        card: card
    }
}

function authorize_hero_card_use(battle: Battle, use: Card_Use_Permission, at: XY): Hero_Card_Use_Authorization {
    if (use.card.type != Card_Type.hero) return { ok: false, kind: Hero_Card_Use_Error_Kind.other };

    const cell = grid_cell_at(battle, at);

    if (!cell) return { ok: false, kind: Hero_Card_Use_Error_Kind.other };
    if (cell.occupied) return { ok: false, kind: Hero_Card_Use_Error_Kind.cell_occupied };
    
    const zone = use.player.deployment_zone;
    const is_in_zone =
        at.x >= zone.min_x &&
        at.y >= zone.min_y &&
        at.x <  zone.max_x &&
        at.y <  zone.max_y;

    if (!is_in_zone) return { ok: false, kind: Hero_Card_Use_Error_Kind.not_in_deployment_zone };
    
    return {
        ok: true,
        player: use.player,
        card: use.card,
        cell: cell
    }
}

function authorize_no_target_card_spell_use(use: Card_Use_Permission): No_Target_Spell_Card_Use_Authorization {
    if (use.card.type != Card_Type.spell) return { ok: false, kind: No_Target_Spell_Card_Use_Error_Kind.other };
    if (use.card.spell_type != Spell_Type.no_target) return { ok: false, kind: No_Target_Spell_Card_Use_Error_Kind.other };

    return {
        ok: true,
        player: use.player,
        card: use.card,
        spell: use.card
    }
}

function authorize_unit_target_card_spell_use(use: Card_Use_Permission, act_on_unit: Act_On_Unit_Permission): Unit_Target_Spell_Card_Use_Authorization {
    if (use.card.type != Card_Type.spell) return { ok: false, kind: No_Target_Spell_Card_Use_Error_Kind.other };
    if (use.card.spell_type != Spell_Type.unit_target) return { ok: false, kind: No_Target_Spell_Card_Use_Error_Kind.other };

    return {
        ok: true,
        player: use.player,
        card: use.card,
        spell: use.card,
        unit: act_on_unit.unit
    }
}

function authorize_act_on_unit(battle: Battle, unit_id: number): Act_On_Unit_Authorization {
    const unit = find_unit_by_id(battle, unit_id);

    if (!unit) return { ok: false, kind: Act_On_Unit_Error_Kind.other };
    if (unit.dead) return { ok: false, kind: Act_On_Unit_Error_Kind.dead };
    if (is_unit_out_of_the_game(unit)) return { ok: false, kind: Act_On_Unit_Error_Kind.out_of_the_game };

    return {
        ok: true,
        unit: unit
    }
}