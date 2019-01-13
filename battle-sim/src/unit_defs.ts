function unit_definition_by_type(type: Unit_Type): Unit_Definition {
    switch (type) {
        case Unit_Type.ursa: {
            return {
                health: 30,
                mana: 10,
                move_points: 4,
                abilities: [
                ]
            }
        }

        case Unit_Type.sniper: {
            return {
                health: 24,
                mana: 10,
                move_points: 3,
                abilities: [
                ]
            }
        }

        case Unit_Type.pudge: {
            return {
                health: 35,
                mana: 10,
                move_points: 2,
                abilities: [
                    {
                        id: Ability_Id.pudge_hook,
                        available_since_level: 1,
                        type: Ability_Type.target_ground,
                        cooldown: 2,
                        mana_cost: 3
                    },
                    {
                        id: Ability_Id.pudge_rot,
                        available_since_level: 2,
                        type: Ability_Type.no_target,
                        cooldown: 1,
                        mana_cost: 1
                    },
                    {
                        id: Ability_Id.pudge_flesh_heap,
                        available_since_level: 3,
                        type: Ability_Type.passive
                    },
                    {
                        id: Ability_Id.pudge_dismember,
                        available_since_level: 4,
                        type: Ability_Type.target_unit,
                        cooldown: 2,
                        mana_cost: 4
                    }
                ]
            }
        }

        default: return unreachable(type);
    }
}