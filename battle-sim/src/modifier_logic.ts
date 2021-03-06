function apply_modifier_field_change(target: Unit_Stats, change: Modifier_Change_Field_Change, invert: boolean) {
    const delta = invert ? -change.delta : change.delta;

    switch (change.field) {
        case Modifier_Field.move_points_bonus: {
            target.move_points_bonus += delta;
            target.move_points = Math.min(target.move_points, target.max_move_points + target.move_points_bonus);

            if (delta > 0 && !invert) {
                target.move_points += delta;
            }

            break;
        }

        case Modifier_Field.armor_bonus: {
            target.armor += delta;
            break;
        }

        case Modifier_Field.attack_bonus: {
            target.attack_bonus += delta;
            break;
        }

        case Modifier_Field.health_bonus: {
            target.max_health += delta;
            target.health = Math.min(target.health, target.max_health);

            if (delta > 0 && !invert) {
                target.health = Math.min(target.health + delta, target.max_health);
            }

            break;
        }

        case Modifier_Field.state_stunned_counter: {
            target.state_stunned_counter += delta;
            break;
        }

        case Modifier_Field.state_silenced_counter: {
            target.state_silenced_counter += delta;
            break;
        }

        case Modifier_Field.state_disarmed_counter: {
            target.state_disarmed_counter += delta;
            break;
        }

        case Modifier_Field.state_out_of_the_game_counter: {
            target.state_out_of_the_game_counter += delta;
            break;
        }

        default: unreachable(change.field);
    }
}