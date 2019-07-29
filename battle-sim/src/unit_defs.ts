type Ability_Active_Discriminator = {
    id: Ability_Id,
    type: Ability_Type,
    starts_inactive: boolean
}

type Ability_Passive_Discriminator = {
    id: Ability_Id,
    type: Ability_Type,
}

type Active_Ability_Stats<T extends Ability_Definition_Active> = Pick<T, Exclude<keyof T, keyof Ability_Active_Discriminator>>
type Passive_Ability_Stats<T extends Ability_Definition_Passive> = Pick<T, Exclude<keyof T, keyof Ability_Passive_Discriminator>>;

declare function active_ability<T extends Ability_Definition_Active>(stats: Active_Ability_Stats<T>): T;
declare function passive_ability<T extends Ability_Definition_Passive>(stats: Passive_Ability_Stats<T>): T;

function target_line(length: number, selector: Ability_Target_Selector = single_target()): Ability_Targeting_Line {
    return {
        type: Ability_Targeting_Type.line,
        line_length: length,
        selector: selector
    }
}

function single_target(): Ability_Target_Selector_Single_Target {
    return {
        type: Ability_Target_Selector_Type.single_target
    }
}

function targets_in_rectangle(radius: number): Ability_Target_Selector_Rectangle {
    return {
        type: Ability_Target_Selector_Type.rectangle,
        area_radius: radius
    }
}

function targets_in_line(length: number): Ability_Target_Selector_Line {
    return {
        type: Ability_Target_Selector_Type.line,
        length: length
    }
}

function target_in_manhattan_distance(distance: number, selector: Ability_Target_Selector = single_target()): Ability_Targeting_Target_In_Manhattan_Distance {
    return {
        type: Ability_Targeting_Type.unit_in_manhattan_distance,
        distance: distance,
        selector: selector
    }
}

function target_rect_area_around_caster(area_radius: number, selector: Ability_Target_Selector = single_target()): Ability_Targeting_Rectangular_Area_Around_Caster {
    return {
        type: Ability_Targeting_Type.rectangular_area_around_caster,
        area_radius: area_radius,
        selector: selector
    }
}

function basic_attack(range: number): Ability_Basic_Attack {
    return active_ability<Ability_Basic_Attack>({
        available_since_level: 0,
        targeting: target_line(range),
        charges: 1
    });
}

function unit_definition_by_type(type: Unit_Type): Unit_Definition {
    switch (type) {
        case Unit_Type.ursa: {
            return {
                health: 15,
                attack_damage: 5,
                move_points: 4,
                attack: basic_attack(1),
                abilities: [
                ],
                ability_bench: []
            }
        }

        case Unit_Type.sniper: {
            return {
                health: 12,
                move_points: 3,
                attack_damage: 4,
                attack: basic_attack(4),
                abilities: [
                ],
                ability_bench: []
            }
        }

        case Unit_Type.pudge: {
            return {
                health: 16,
                move_points: 2,
                attack_damage: 5,
                attack: basic_attack(1),
                abilities: [
                    active_ability<Ability_Pudge_Hook>({
                        available_since_level: 1,
                        targeting: target_line(5),
                        charges: 1,
                        damage: 5
                    }),
                    active_ability<Ability_Pudge_Rot>({
                        available_since_level: 2,
                        targeting: target_rect_area_around_caster(1),
                        charges: 1,
                        damage: 5
                    }),
                    active_ability<Ability_Pudge_Dismember>({
                        available_since_level: 3,
                        targeting: target_in_manhattan_distance(1),
                        charges: 1,
                        damage: 10
                    })
                ],
                ability_bench: []
            }
        }

        case Unit_Type.tidehunter: {
            return {
                health: 16,
                move_points: 3,
                attack_damage: 5,
                attack: basic_attack(1),
                abilities: [
                    active_ability<Ability_Tide_Gush>({
                        available_since_level: 1,
                        targeting: target_in_manhattan_distance(6),
                        charges: 1,
                        damage: 4,
                        move_points_reduction: 2
                    }),
                    active_ability<Ability_Tide_Anchor_Smash>({
                        available_since_level: 2,
                        targeting: target_rect_area_around_caster(1),
                        charges: 2,
                        damage: 4,
                        attack_reduction: 2
                    }),
                    active_ability<Ability_Tide_Ravage>({
                        available_since_level: 3,
                        targeting: target_in_manhattan_distance(5),
                        damage: 5,
                        charges: 1,
                    })
                ],
                ability_bench: []
            }
        }

        case Unit_Type.luna: {
            return {
                health: 12,
                move_points: 4,
                attack_damage: 4,
                attack: basic_attack(2),
                abilities: [
                    active_ability<Ability_Luna_Lucent_Beam>({
                        available_since_level: 1,
                        targeting: target_in_manhattan_distance(5),
                        charges: 1,
                        damage: 5
                    }),
                    passive_ability<Ability_Luna_Moon_Glaive>({
                        available_since_level: 2
                    }),
                    active_ability<Ability_Luna_Eclipse>({
                        available_since_level: 3,
                        targeting: target_in_manhattan_distance(4),
                        total_beams: 14,
                        charges: 1,
                    })
                ],
                ability_bench: []
            }
        }

        case Unit_Type.skywrath_mage: {
            return {
                health: 10,
                move_points: 3,
                attack_damage: 3,
                attack: basic_attack(3),
                abilities: [
                    active_ability<Ability_Skywrath_Concussive_Shot>({
                        available_since_level: 1,
                        targeting: target_rect_area_around_caster(3),
                        charges: 1,
                        move_points_reduction: 2,
                        damage: 4,
                        duration: 2
                    }),
                    active_ability<Ability_Skywrath_Ancient_Seal>({
                        available_since_level: 2,
                        targeting: target_in_manhattan_distance(3),
                        charges: 1,
                        duration: 3
                    }),
                    active_ability<Ability_Skywrath_Mystic_Flare>({
                        available_since_level: 3,
                        targeting: target_in_manhattan_distance(5, targets_in_rectangle(1)),
                        charges: 1,
                        damage: 10
                    })
                ],
                ability_bench: []
            }
        }

        case Unit_Type.dragon_knight: {
            return {
                health: 14,
                move_points: 3,
                attack_damage: 4,
                attack: basic_attack(1),
                abilities: [
                    active_ability<Ability_Dragon_Knight_Breathe_Fire>({
                        available_since_level: 1,
                        targeting: target_line(3, {
                            type: Ability_Target_Selector_Type.t_shape,
                            stem_length: 3,
                            arm_length: 2
                        }),
                        charges: 1,
                        damage: 5
                    }),
                    active_ability<Ability_Dragon_Knight_Dragon_Tail>({
                        available_since_level: 2,
                        targeting: target_in_manhattan_distance(1),
                        charges: 1,
                        damage: 3
                    }),
                    active_ability<Ability_Dragon_Knight_Elder_Dragon_Form>({
                        available_since_level: 3,
                        targeting: target_in_manhattan_distance(0),
                        charges: 1,
                        duration: 3
                    })
                ],
                ability_bench: [
                    active_ability<Ability_Dragon_Knight_Elder_Dragon_Form_Attack>({
                        available_since_level: 0,
                        targeting: target_line(4, targets_in_rectangle(1)),
                        charges: 1
                    })
                ]
            }
        }

        case Unit_Type.lion: {
            return {
                health: 9,
                move_points: 3,
                attack_damage: 3,
                attack: basic_attack(3),
                abilities: [
                    active_ability<Ability_Lion_Hex>({
                        available_since_level: 1,
                        targeting: target_in_manhattan_distance(3),
                        charges: 1,
                        duration: 2,
                        move_points_reduction: 1
                    }),
                    active_ability<Ability_Lion_Impale>({
                        available_since_level: 2,
                        targeting: target_line(3, targets_in_line(3)),
                        charges: 1,
                        damage: 4
                    })
                ],
                ability_bench: []
            }
        }

        default: return unreachable(type);
    }
}