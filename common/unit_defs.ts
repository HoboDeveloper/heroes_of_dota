function unit_definition_by_type(type: Unit_Type): Unit_Definition {
    switch (type) {
        case Unit_Type.ursa: {
            return {
                health: 30,
                move_points: 4
            }
        }
    }

    return {
        health: 20,
        move_points: 4
    }
}