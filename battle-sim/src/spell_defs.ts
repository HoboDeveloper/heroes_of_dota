type Spell_Discriminator = {
    type: Card_Type,
    spell_type: Spell_Type
    spell_id: Spell_Id
}

type Spell_Stats<T extends Card_Spell_Definition> = Pick<T, Exclude<keyof T, keyof Spell_Discriminator>>

declare function spell<T extends Card_Spell_Definition>(stats: Spell_Stats<T>): T;

function spell_definition_by_id(spell_id: Spell_Id): Card_Spell_Definition {
    switch (spell_id) {
        case Spell_Id.euls_scepter: {
            return spell<Spell_Euls_Scepter>({
            });
        }

        case Spell_Id.mekansm: {
            return spell<Spell_Mekansm>({
                heal: 5,
                armor: 1,
                duration: 3
            })
        }
    }
}
