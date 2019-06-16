type Ability_Active_Discriminator = {
    id: Ability_Id,
    type: Ability_Type,
    targeting: Ability_Targeting
}

type Ability_Passive_Discriminator = {
    id: Ability_Id,
    type: Ability_Type,
}

type Active_Ability_Stats<T extends Ability_Definition_Active> = Pick<T, Exclude<keyof T, keyof Ability_Active_Discriminator>> & { targeting: T["targeting"] }
type Passive_Ability_Stats<T extends Ability_Definition_Passive> = Pick<T, Exclude<keyof T, keyof Ability_Passive_Discriminator>>;

declare function active_ability<T extends Ability_Definition_Active>(stats: Active_Ability_Stats<T>): T;
declare function passive_ability<T extends Ability_Definition_Passive>(stats: Passive_Ability_Stats<T>): T;

function unit_definition_by_type(type: Unit_Type): Unit_Definition {
    function target_line(length: number): Ability_Targeting_Line {
        return {
            type: Ability_Targeting_Type.line,
            line_length: length,
            stop_at_first_obstacle_hit: false
        }
    }

    function target_unit_in_manhattan_distance(distance: number): Ability_Targeting_Unit_In_Manhattan_Distance {
        return {
            type: Ability_Targeting_Type.unit_in_manhattan_distance,
            distance: distance
        }
    }

    function target_rect_area_around_caster(area_radius: number): Ability_Targeting_Rectangular_Area_Around_Caster {
        return {
            type: Ability_Targeting_Type.rectangular_area_around_caster,
            area_radius: area_radius
        }
    }

    function basic_attack(damage: number, range: number): Ability_Basic_Attack {
        return active_ability<Ability_Basic_Attack>({
            available_since_level: 0,
            targeting: target_line(range),
            damage: damage,
            cooldown: 0,
            mana_cost: 0
        });
    }

    switch (type) {
        case Unit_Type.ursa: {
            return {
                health: 30,
                mana: 10,
                move_points: 4,
                attack: basic_attack(6, 1),
                abilities: [
                ]
            }
        }

        case Unit_Type.sniper: {
            return {
                health: 24,
                mana: 10,
                move_points: 3,
                attack: basic_attack(5, 4),
                abilities: [
                ]
            }
        }

        case Unit_Type.pudge: {
            return {
                health: 35,
                mana: 10,
                move_points: 2,
                attack: basic_attack(7, 1),
                abilities: [
                    active_ability<Ability_Pudge_Hook>({
                        available_since_level: 1,
                        targeting: target_line(5),
                        cooldown: 2,
                        mana_cost: 3,
                        damage: 6
                    }),
                    passive_ability<Ability_Pudge_Flesh_Heap>({
                        available_since_level: 2,
                        health_per_kill: 5
                    }),
                    active_ability<Ability_Pudge_Rot>({
                        available_since_level: 3,
                        targeting: target_rect_area_around_caster(1),
                        cooldown: 1,
                        mana_cost: 1,
                        damage: 5
                    }),
                    active_ability<Ability_Pudge_Dismember>({
                        available_since_level: 4,
                        targeting: target_unit_in_manhattan_distance(1),
                        cooldown: 2,
                        mana_cost: 4,
                        damage: 14
                    })
                ]
            }
        }

        case Unit_Type.tidehunter: {
            return {
                health: 35,
                mana: 10,
                move_points: 3,
                attack: basic_attack(6, 1),
                abilities: [
                    active_ability<Ability_Tide_Gush>({
                        available_since_level: 1,
                        targeting: target_unit_in_manhattan_distance(6),
                        cooldown: 2,
                        mana_cost: 4,
                        damage: 4,
                        move_points_reduction: 2
                    }),
                    active_ability<Ability_Tide_Anchor_Smash>({
                        available_since_level: 2,
                        targeting: target_rect_area_around_caster(1),
                        cooldown: 1,
                        mana_cost: 2,
                        damage: 4,
                        attack_reduction: 2
                    }),
                    passive_ability<Ability_Tide_Kraken_Shell>({
                        available_since_level: 3,
                        attack_reduction: 3
                    }),
                    active_ability<Ability_Tide_Ravage>({
                        available_since_level: 4,
                        targeting: target_unit_in_manhattan_distance(5),
                        damage: 5,
                        cooldown: 3,
                        mana_cost: 5
                    })
                ]
            }
        }

        case Unit_Type.luna: {
            return {
                health: 25,
                mana: 12,
                move_points: 4,
                attack: basic_attack(5, 2),
                abilities: [
                    active_ability<Ability_Luna_Lucent_Beam>({
                        available_since_level: 1,
                        targeting: target_unit_in_manhattan_distance(5),
                        cooldown: 2,
                        mana_cost: 4,
                        damage: 6
                    }),
                    passive_ability<Ability_Luna_Moon_Glaive>({
                        available_since_level: 2
                    }),
                    passive_ability<Ability_Luna_Lunar_Blessing>({
                        available_since_level: 3,
                        attack_bonus: 2
                    }),
                    active_ability<Ability_Luna_Eclipse>({
                        available_since_level: 4,
                        targeting: target_unit_in_manhattan_distance(4),
                        total_beams: 16,
                        cooldown: 3,
                        mana_cost: 5
                    })
                ]
            }
        }

        default: return unreachable(type);
    }
}