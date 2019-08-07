declare const enum Spell_Id {
    // buyback = 0,
    // experience_requiem = 1,
    euls_scepter = 2,
    mekansm = 3,
}

declare const enum Spell_Type {
    no_target = 0,
    unit_target = 1,
    ground_target = 2
}

type Card_Spell = Card_Spell_Unit_Target | Card_Spell_No_Target

type Card_Spell_Unit_Target =
    Spell_Euls_Scepter

type Card_Spell_No_Target =
    Spell_Mekansm

type Card_Spell_Unit_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.unit_target
    id: number
}

type Card_Spell_No_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.no_target
    id: number
}

type Spell_Euls_Scepter = Card_Spell_Unit_Target_Base & {
    spell_id: Spell_Id.euls_scepter
}

type Spell_Mekansm = Card_Spell_No_Target_Base & {
    spell_id: Spell_Id.mekansm
    spell_type: Spell_Type.no_target
}

type Delta_Use_Unit_Target_Spell =
    Delta_Spell_Euls_Scepter

type Delta_Use_No_Target_Spell =
    Delta_Spell_Mekansm

type Delta_Use_Unit_Target_Spell_Base = {
    type: Delta_Type.use_unit_target_spell
    player_id: number
    target_id: number
}

type Delta_Use_No_Target_Spell_Base = {
    type: Delta_Type.use_no_target_spell
    player_id: number
}

type Delta_Spell_Euls_Scepter = Delta_Use_Unit_Target_Spell_Base & {
    spell_id: Spell_Id.euls_scepter
    modifier: Modifier_Application
}

type Delta_Spell_Mekansm = Delta_Use_No_Target_Spell_Base & {
    spell_id: Spell_Id.mekansm
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}