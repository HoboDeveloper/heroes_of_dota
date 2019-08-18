function take_battle_action(action: Turn_Action, success_callback?: () => void) {
    // $.Msg("Take action ", action);

    const request = {
        access_token: get_access_token(),
        action: action
    };

    remote_request<Take_Battle_Action_Request, Take_Battle_Action_Response>("/take_battle_action", request, response => {
        if (success_callback) {
            success_callback();
        }

        receive_battle_deltas(response.previous_head, response.deltas);
    });
}

function random_int_up_to(upper_bound: number) {
    return Math.floor(Math.random() * upper_bound);
}

function emit_random_sound(sounds: string[]) {
    Game.EmitSound(sounds[random_int_up_to(sounds.length)]);
}

function try_emit_random_hero_sound(unit: Unit, supplier: (sounds: Hero_Sounds) => string[]) {
    if (unit.supertype == Unit_Supertype.hero) {
        emit_random_sound(supplier(hero_sounds_by_hero_type(unit.type)));
    }
}

type Error_Reason = {
    reason: number,
    message?: string
};

// 24 - silenced
// 25 - can't move
// 30 - can't be attacked
// 41 - can't attack
// 46 - target out of range
// 48 - can't target that
// 62 - secret shop not in range
// 63 - not enough gold
// 74 - can't act
// 75 - muted
// 77 - target immune to magic
// 80 - custom "message" argument
function native_error(reason: number): Error_Reason {
    return { reason: reason };
}

function custom_error(message: string) {
    return { reason: 80, message: message };
}

function show_error_ui(reason: Error_Reason) {
    GameEvents.SendEventClientSide("dota_hud_error_message", reason);
}

function show_generic_error(error: string) {
    GameEvents.SendEventClientSide("dota_hud_error_message", { reason: 80, message: error });
}

function player_act_error_reason(error: Action_Error<Player_Action_Error>): Error_Reason {
    switch (error.kind) {
        case Player_Action_Error.not_your_turn: return custom_error("It's not your turn just yet");
        case Player_Action_Error.other: return custom_error("Error");
    }
}

function act_on_unit_error_reason(error: Action_Error<Act_On_Unit_Error>): Error_Reason {
    switch (error.kind) {
        case Act_On_Unit_Error.out_of_the_game: return custom_error("This unit is not targetable");
        case Act_On_Unit_Error.dead: return native_error(20);
        case Act_On_Unit_Error.other: return custom_error("Error");
    }
}

function act_on_owned_unit_error_reason(error: Action_Error<Act_On_Owned_Unit_Error>): Error_Reason {
    switch (error.kind) {
        case Act_On_Owned_Unit_Error.not_owned: return custom_error("Unit not owned");
    }
}

function order_unit_error_reason(error: Action_Error<Order_Unit_Error>): Error_Reason {
    switch (error.kind) {
        case Order_Unit_Error.other: return custom_error("Error");
        case Order_Unit_Error.unit_has_already_acted_this_turn: return custom_error("Unit has already acted this turn");
        case Order_Unit_Error.stunned: return custom_error("Stunned");
    }
}

function ability_use_error_reason(error: Action_Error<Ability_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Ability_Use_Error.other: return custom_error("Error");
        case Ability_Use_Error.no_charges: return custom_error("Ability has no more charges");
        case Ability_Use_Error.not_learned_yet: return native_error(16);
        case Ability_Use_Error.silenced: return native_error(24);
        case Ability_Use_Error.disarmed: return custom_error("Disarmed");
        case Ability_Use_Error.unusable: return custom_error("Ability not usable");
    }
}

function ground_target_ability_use_error_reason(error: Action_Error<Ground_Target_Ability_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Ground_Target_Ability_Use_Error.other: return custom_error("Error");
        case Ground_Target_Ability_Use_Error.not_in_range: return custom_error("Target out of range");
    }
}

function unit_target_ability_use_error_reason(error: Action_Error<Unit_Target_Ability_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Unit_Target_Ability_Use_Error.other: return custom_error("Error");
        case Unit_Target_Ability_Use_Error.not_in_range: return custom_error("Target out of range");
    }
}

function move_order_error_reason(error: Action_Error<Move_Order_Error>): Error_Reason {
    switch (error.kind) {
        case Move_Order_Error.not_enough_move_points: return custom_error("Not enough move points");
        case Move_Order_Error.path_not_found: return custom_error("Can't move here");
        case Move_Order_Error.other: return custom_error("Error");
    }
}

function card_use_error_reason(error: Action_Error<Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Card_Use_Error.other: return custom_error("Error");
        case Card_Use_Error.has_used_a_card_this_turn: return custom_error("Already used a card this turn");
    }
}

function hero_card_use_error_reason(error: Action_Error<Hero_Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Hero_Card_Use_Error.other: return custom_error("Error");
        case Hero_Card_Use_Error.cell_occupied: return custom_error("Occupied");
        case Hero_Card_Use_Error.not_in_deployment_zone: return custom_error("Not in deployment zone");
    }
}

function unit_target_spell_use_error_reason(error: Action_Error<Unit_Target_Spell_Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case Unit_Target_Spell_Card_Use_Error.other: return custom_error("Error");
        case Unit_Target_Spell_Card_Use_Error.not_a_hero: return custom_error("Can only target heroes");
        case Unit_Target_Spell_Card_Use_Error.not_an_ally: return custom_error("Can only target allies");
        case Unit_Target_Spell_Card_Use_Error.out_of_the_game: return custom_error("Target out of the game");
    }
}

function no_target_spell_use_error_reason(error: Action_Error<No_Target_Spell_Card_Use_Error>): Error_Reason {
    switch (error.kind) {
        case No_Target_Spell_Card_Use_Error.other: return custom_error("Error");
    }
}

function rune_pickup_error_reason(error: Action_Error<Rune_Pickup_Order_Error>): Error_Reason {
    switch (error.kind) {
        case Rune_Pickup_Order_Error.other: return custom_error("Error");
        case Rune_Pickup_Order_Error.not_a_hero: return custom_error("Only heroes can pick up runes");
    }
}

function use_shop_error_reason(error: Action_Error<Use_Shop_Error>): Error_Reason {
    switch (error.kind) {
        case Use_Shop_Error.other: return custom_error("Error");
        case Use_Shop_Error.not_a_hero: return custom_error("Only heroes can buy items");
        case Use_Shop_Error.not_in_shop_range: return custom_error("Not in shop range");
    }
}

function purchase_item_error_reason(error: Action_Error<Purchase_Item_Error>): Error_Reason {
    switch (error.kind) {
        case Purchase_Item_Error.other: return custom_error("Error");
        case Purchase_Item_Error.not_enough_gold: return custom_error("Not enough gold");
    }
}

// Return type is for 'return show_action_error_ui' syntax sugar
function show_action_error_ui<T>(error: Action_Error<T>, supplier: (error: Action_Error<T>) => Error_Reason): undefined {
    show_error_ui(supplier(error));
    return;
}

function show_ability_use_error_ui(caster: Unit, ability_id: Ability_Id, error: Action_Error<Ability_Use_Error>): undefined {
    show_action_error_ui(error, ability_use_error_reason);

    if (error.kind == Ability_Use_Error.silenced) {
        const row = control_panel.hero_rows.find(row => row.unit_id == caster.id);

        if (!row) return;

        const button = row.ability_buttons.find(button => button.ability == ability_id);

        if (!button) return;

        button.overlay.RemoveClass("animate_silence_try");
        button.overlay.AddClass("animate_silence_try");
    }
}

function show_player_action_error_ui(error: Action_Error<Player_Action_Error>): undefined {
    if (error.kind == Player_Action_Error.not_your_turn && is_unit_selection(selection)) {
        (() => {
            const act_on_unit_permission = authorize_act_on_known_unit(battle, selection.unit);
            if (!act_on_unit_permission.ok) return;

            const act_on_owned_unit_permission = authorize_act_on_owned_unit({ ok: true, battle: battle, player: battle.this_player }, act_on_unit_permission);
            if (!act_on_owned_unit_permission.ok) return;

            try_emit_random_hero_sound(selection.unit, sounds => sounds.not_yet);
        })();
    }

    show_action_error_ui(error, player_act_error_reason);

    return;
}

function authorized_act_on_owned_unit_with_error_ui(unit: Unit): Act_On_Owned_Unit_Permission | undefined {
    const player_act_permission = authorize_action_by_player(battle, battle.this_player);
    if (!player_act_permission.ok) return show_player_action_error_ui(player_act_permission);

    const act_on_unit_permission = authorize_act_on_known_unit(battle, unit);
    if (!act_on_unit_permission.ok) return show_action_error_ui(act_on_unit_permission, act_on_unit_error_reason);

    const act_on_owned_unit_permission = authorize_act_on_owned_unit(player_act_permission, act_on_unit_permission);
    if (!act_on_owned_unit_permission.ok) return show_action_error_ui(act_on_owned_unit_permission, act_on_owned_unit_error_reason);

    return act_on_owned_unit_permission;
}

function authorize_unit_order_with_error_ui(unit: Unit): Order_Unit_Permission | undefined {
    const act_on_owned_unit_permission = authorized_act_on_owned_unit_with_error_ui(unit);
    if (!act_on_owned_unit_permission) return;

    const order_permission = authorize_order_unit(act_on_owned_unit_permission);
    if (!order_permission.ok) return show_action_error_ui(order_permission, order_unit_error_reason);

    return order_permission;
}

function authorize_ability_use_with_error_ui(unit: Unit, ability: Ability): Ability_Use_Permission | undefined {
    const order_permission = authorize_unit_order_with_error_ui(unit);
    if (!order_permission) return;

    const ability_use = authorize_ability_use(order_permission, ability.id);
    if (!ability_use.ok) return show_ability_use_error_ui(order_permission.unit, ability.id, ability_use);

    return ability_use;
}


function try_attack_target(source: Unit, target: XY, flash_ground_on_error: boolean) {
    const ability_use_permission = authorize_ability_use_with_error_ui(source, source.attack);

    if (!ability_use_permission) return;

    if (source.attack.type == Ability_Type.target_ground) {
        const attack_use_permission = authorize_ground_target_ability_use(ability_use_permission, target);

        if (attack_use_permission.ok) {
            try_emit_random_hero_sound(source, sounds => sounds.attack);

            take_battle_action({
                type: Action_Type.ground_target_ability,
                ability_id: source.attack.id,
                unit_id: source.id,
                to: target
            })
        } else {
            show_action_error_ui(attack_use_permission, ground_target_ability_use_error_reason);

            if (flash_ground_on_error && attack_use_permission.kind == Ground_Target_Ability_Use_Error.not_in_range) {
                const cell_index_to_highlight: boolean[] = [];

                for (const cell of battle.cells) {
                    const index = grid_cell_index(battle, cell.position);

                    if (ability_targeting_fits(battle, source.attack.targeting, source.position, cell.position)) {
                        cell_index_to_highlight[index] = true;
                    }
                }

                highlight_outline_temporarily(cell_index_to_highlight, color_red, 0.2);
            }
        }
    }
}

function try_use_targeted_ability(unit: Unit, ability: Ability, at_position: XY, cursor_entity_unit?: Unit): boolean {
    const ability_select_permission = authorize_ability_use_with_error_ui(unit, ability);

    if (!ability_select_permission) return false;

    switch (ability.type) {
        case Ability_Type.target_ground: {
            const ability_use_permission = authorize_ground_target_ability_use(ability_select_permission, at_position);

            if (ability_use_permission.ok) {
                take_battle_action({
                    type: Action_Type.ground_target_ability,
                    unit_id: unit.id,
                    ability_id: ability.id,
                    to: at_position
                });
            } else {
                show_action_error_ui(ability_use_permission, ground_target_ability_use_error_reason);

                return false;
            }

            break;
        }

        case Ability_Type.target_unit: {
            if (!cursor_entity_unit) {
                show_error_ui(custom_error("Select a target"));
                return false;
            }

            const act_on_target_permission = authorize_act_on_known_unit(battle, cursor_entity_unit);

            if (!act_on_target_permission.ok) {
                show_action_error_ui(act_on_target_permission, act_on_unit_error_reason);
                return false;
            }

            const ability_use_permission = authorize_unit_target_ability_use(ability_select_permission, act_on_target_permission);

            if (ability_use_permission.ok) {
                take_battle_action({
                    type: Action_Type.unit_target_ability,
                    unit_id: unit.id,
                    ability_id: ability.id,
                    target_id: cursor_entity_unit.id
                });
            } else {
                show_action_error_ui(ability_use_permission, unit_target_ability_use_error_reason);

                return false;
            }
        }

        case Ability_Type.no_target:
        case Ability_Type.passive: {
            break;
        }

        default: unreachable(ability);
    }

    return true;
}

function highlight_move_path(unit: Unit, to: XY) {
    // TODO should be able to extract the path from move_permission
    const path = find_grid_path(unit.position, to);
    if (!path) return;

    const cell_index_to_highlight: boolean[] = [];

    for (const point of path) {
        cell_index_to_highlight[grid_cell_index(battle, point)] = true;
    }

    highlight_outline_temporarily(cell_index_to_highlight, color_green, 0.5);
}

function try_order_unit_to_pick_up_rune(unit: Unit, rune: Rune) {
    const order_permission = authorize_unit_order_with_error_ui(unit);
    if (!order_permission) return;

    const rune_pickup_permission = authorize_rune_pickup_order(order_permission, rune.id);
    if (!rune_pickup_permission.ok) return show_action_error_ui(rune_pickup_permission, rune_pickup_error_reason);

    const move_permission = authorize_move_order(order_permission, rune.position, true);
    if (!move_permission.ok) return show_action_error_ui(move_permission, move_order_error_reason);

    // TODO highlight move area on error
    try_emit_random_hero_sound(unit, sounds => sounds.move);
    highlight_move_path(unit, rune.position);

    take_battle_action({
        type: Action_Type.pick_up_rune,
        rune_id: rune.id,
        unit_id: unit.id
    });
}

function try_order_unit_to_move(unit: Unit, move_where: XY) {
    const order_permission = authorize_unit_order_with_error_ui(unit);
    if (!order_permission) return;

    const move_permission = authorize_move_order(order_permission, move_where, false);
    if (!move_permission.ok) return show_action_error_ui(move_permission, move_order_error_reason);

    try_emit_random_hero_sound(unit, sounds => sounds.move);
    highlight_move_path(unit, move_where);

    take_battle_action({
        type: Action_Type.move,
        to: move_where,
        unit_id: unit.id
    });
}

type Use_Spell_Action = Action_Use_Unit_Target_Spell | Action_Use_No_Target_Spell;

function try_use_card_spell(spell: Card_Spell, hovered_cell: XY, action_permission: Player_Action_Permission, card_use_permission: Card_Use_Permission): Use_Spell_Action | undefined {
    switch (spell.spell_type) {
        case Spell_Type.unit_target: {
            const target = unit_at(battle, hovered_cell);

            if (!target) {
                show_error_ui(custom_error("Select a target"));
                return;
            }

            const spell_use_permission = authorize_known_unit_target_card_spell_use(card_use_permission, target);
            if (!spell_use_permission.ok) return show_action_error_ui(spell_use_permission, unit_target_spell_use_error_reason);

            return {
                type: Action_Type.use_unit_target_spell_card,
                card_id: spell.id,
                unit_id: target.id,
            };
        }

        case Spell_Type.no_target: {
            const spell_use_permission = authorize_no_target_card_spell_use(card_use_permission);
            if (!spell_use_permission.ok) return show_action_error_ui(spell_use_permission, no_target_spell_use_error_reason);

            return {
                type: Action_Type.use_no_target_spell_card,
                card_id: spell.id
            }
        }

        default: unreachable(spell);
    }
}

function try_use_card(card: Card, hovered_cell: XY, success_callback: () => void) {
    const action_permission = authorize_action_by_player(battle, battle.this_player);
    if (!action_permission.ok) return show_player_action_error_ui(action_permission);

    const card_use_permission = authorize_card_use(action_permission, card.id);
    if (!card_use_permission.ok) return show_action_error_ui(card_use_permission, card_use_error_reason);

    switch (card.type) {
        case Card_Type.hero: {
            const hero_card_use_permission = authorize_hero_card_use(card_use_permission, hovered_cell);
            if (!hero_card_use_permission.ok) return show_action_error_ui(hero_card_use_permission, hero_card_use_error_reason);

            take_battle_action({
                type: Action_Type.use_hero_card,
                card_id: card.id,
                at: hovered_cell
            }, success_callback);

            break;
        }

        case Card_Type.existing_hero: {
            const hero_card_use_permission = authorize_existing_hero_card_use(card_use_permission, hovered_cell);
            if (!hero_card_use_permission.ok) return show_action_error_ui(hero_card_use_permission, hero_card_use_error_reason);

            take_battle_action({
                type: Action_Type.use_existing_hero_card,
                card_id: card.id,
                at: hovered_cell
            }, success_callback);

            break;
        }

        case Card_Type.spell: {
            const action = try_use_card_spell(card, hovered_cell, action_permission, card_use_permission);

            if (action) {
                take_battle_action(action, success_callback);
            }

            break;
        }

        case Card_Type.unknown: {
            return;
        }

        default: unreachable(card);
    }
}

function try_purchase_item(unit: Unit, shop: Shop, item_id: Item_Id, success_callback: () => void) {
    const act_on_owned_unit_permission = authorized_act_on_owned_unit_with_error_ui(unit);
    if (!act_on_owned_unit_permission) return;

    const use_shop_permission = authorize_shop_use(act_on_owned_unit_permission, shop.id);
    if (!use_shop_permission.ok) return show_action_error_ui(use_shop_permission, use_shop_error_reason);

    const purchase_permission = authorize_item_purchase(use_shop_permission, item_id);
    if (!purchase_permission.ok) return show_action_error_ui(purchase_permission, purchase_item_error_reason);

    Game.EmitSound("General.Buy");

    take_battle_action({
        type: Action_Type.purchase_item,
        unit_id: unit.id,
        shop_id: shop.id,
        item_id: item_id
    }, success_callback);
}