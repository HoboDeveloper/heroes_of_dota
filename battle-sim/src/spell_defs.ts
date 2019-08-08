type Spell_Discriminator = {
    type: Card_Type,
    spell_type: Spell_Type
    spell_id: Spell_Id
}

type Spell_Stats<T extends Card_Spell> = Pick<T, Exclude<keyof T, keyof Spell_Discriminator>>

declare function spell<T extends Card_Spell>(stats: Spell_Stats<T>): T;

function spell_id_to_spell(spell_id: Spell_Id, temporary_card_id: number): Card_Spell {
    switch (spell_id) {
        case Spell_Id.euls_scepter: {
            return spell<Spell_Euls_Scepter>({
                id: temporary_card_id,
            });
        }

        case Spell_Id.mekansm: {
            return spell<Spell_Mekansm>({
                id: temporary_card_id,
                heal: 5,
                armor: 1,
                duration: 3
            })
        }
    }
}
