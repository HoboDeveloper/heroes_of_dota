
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


type Error_Reason = {
    reason: number,
    message?: string
};

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
        case Move_Order_Error.other: return custom_error("Error");
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


function try_attack_target(source: Unit, target: XY, flash_ground_on_error: boolean) {
    const ability_use_permission = authorize_ability_use_with_error_ui(source, source.attack);

    if (!ability_use_permission) return;

    if (source.attack.type == Ability_Type.target_ground) {
        const attack_use_permission = authorize_ground_target_ability_use(ability_use_permission, target);

        if (attack_use_permission.ok) {
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

                    if (ability_targeting_fits(source.attack.targeting, source.position, cell.position)) {
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

function try_order_unit_to_move(unit: Unit, move_where: XY) {
    const order_permission = authorize_unit_order_with_error_ui(unit);
    if (!order_permission) return;

    const move_permission = authorize_move_order(order_permission, move_where, false);
    if (!move_permission.ok) return show_action_error_ui(move_permission, move_order_error_reason);

    // TODO should be able to extract the path from move_permission
    const path = find_grid_path(unit.position, move_where);
    if (!path) return;

    take_battle_action({
        type: Action_Type.move,
        to: move_where,
        unit_id: unit.id
    });

    const cell_index_to_highlight: boolean[] = [];

    for (const point of path) {
        cell_index_to_highlight[grid_cell_index(battle, point)] = true;
    }

    highlight_outline_temporarily(cell_index_to_highlight, color_green, 0.5);
}

function try_use_card(card: Card, hovered_cell: XY, success_callback: () => void) {
    function card_to_action(): Turn_Action | undefined {
        switch (card.type) {
            case Card_Type.spell: {
                switch (card.spell_type) {
                    case Spell_Type.unit_target: {
                        const target = unit_at(battle, hovered_cell);

                        if (target) {
                            return {
                                type: Action_Type.use_unit_target_spell_card,
                                card_id: card.id,
                                unit_id: target.id,
                            }
                        }

                        break;
                    }

                    case Spell_Type.no_target: {
                        return {
                            type: Action_Type.use_no_target_spell_card,
                            card_id: card.id
                        }
                    }

                    // TODO Spell_Type.ground_target + unreachable
                }

                break;
            }

            case Card_Type.hero: {
                return {
                    type: Action_Type.use_hero_card,
                    card_id: card.id,
                    at: hovered_cell
                }
            }

            case Card_Type.unknown: {
                return;
            }

            default: unreachable(card);
        }
    }

    const action = card_to_action();

    // TODO :Authorization
    if (action) {
        take_battle_action(action, () => success_callback);
    }
}