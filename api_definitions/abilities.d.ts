declare const enum Ability_Id {
    basic_attack = -1,
    pudge_hook = 0,
    pudge_rot = 1,
    pudge_dismember = 3,
    tide_gush = 4,
    tide_anchor_smash = 5,
    tide_ravage = 7,
    luna_lucent_beam = 8,
    luna_moon_glaive = 9,
    luna_eclipse = 11,
    skywrath_concussive_shot = 12,
    skywrath_ancient_seal = 13,
    skywrath_mystic_flare = 14,
    dragon_knight_breathe_fire = 15,
    dragon_knight_dragon_tail = 16,
    dragon_knight_elder_dragon_form = 17,
    dragon_knight_elder_dragon_form_attack = 18,
    lion_hex = 19,
    lion_impale = 20,
    lion_finger_of_death = 21,
    mirana_starfall = 22,
    mirana_arrow = 23,
    mirana_leap = 24,

    sniper_shrapnel = 99
}

declare const enum Modifier_Id {
    rune_double_damage = -2,
    rune_haste = -1,
    tide_gush = 0,
    tide_anchor_smash = 1,
    tide_ravage = 2,
    skywrath_concussive_shot = 3,
    skywrath_ancient_seal = 4,
    dragon_knight_dragon_tail = 5,
    dragon_knight_elder_dragon_form = 6,
    lion_hex = 7,
    lion_impale = 8,
    mirana_arrow = 9,
    item_boots_of_travel = 100,
    item_heart_of_tarrasque = 101,
    item_assault_cuirass = 102,
    item_satanic = 103,
    item_divine_rapier = 104,
    item_mask_of_madness = 105,
    item_armlet = 106,
    spell_euls_scepter = 200,
    spell_mekansm = 201
}

declare const enum Ability_Flag {
    does_not_consume_action = 0
}

type Ability_Definition_Active_Base = {
    available_since_level: number
    charges: number
    targeting: Ability_Targeting
    flags: Ability_Flag[]
}

type Ability_Definition_Passive_Base = {
    available_since_level: number
}

type Ability_Basic_Attack = Ability_Definition_Active_Base & {
    id: Ability_Id.basic_attack
    type: Ability_Type.target_ground
    targeting: Ability_Targeting_Line
}

type Ability_Pudge_Hook = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_hook
    type: Ability_Type.target_ground
    targeting: Ability_Targeting_Line
    damage: number
}

type Ability_Pudge_Rot = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_rot
    type: Ability_Type.no_target
    damage: number
}

type Ability_Pudge_Dismember = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_dismember
    type: Ability_Type.target_unit
    damage: number
}

type Ability_Tide_Gush = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_gush
    type: Ability_Type.target_unit
    damage: number
    move_points_reduction: number
}

type Ability_Tide_Anchor_Smash = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_anchor_smash
    type: Ability_Type.no_target
    damage: number
    attack_reduction: number
}

type Ability_Tide_Ravage = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_ravage
    type: Ability_Type.no_target
    damage: number
}

type Ability_Luna_Lucent_Beam = Ability_Definition_Active_Base & {
    id: Ability_Id.luna_lucent_beam
    type: Ability_Type.target_unit
    damage: number
}

type Ability_Luna_Moon_Glaive = Ability_Definition_Passive_Base & {
    id: Ability_Id.luna_moon_glaive
    type: Ability_Type.passive
}

type Ability_Luna_Eclipse = Ability_Definition_Active_Base & {
    id: Ability_Id.luna_eclipse
    type: Ability_Type.no_target
    total_beams: number
}

type Ability_Skywrath_Concussive_Shot = Ability_Definition_Active_Base & {
    id: Ability_Id.skywrath_concussive_shot
    type: Ability_Type.no_target
    damage: number
    move_points_reduction: number
    duration: number
}

type Ability_Skywrath_Ancient_Seal = Ability_Definition_Active_Base & {
    id: Ability_Id.skywrath_ancient_seal
    type: Ability_Type.target_unit
    duration: number
}

type Ability_Skywrath_Mystic_Flare = Ability_Definition_Active_Base & {
    id: Ability_Id.skywrath_mystic_flare
    type: Ability_Type.target_ground
    damage: number
}

type Ability_Dragon_Knight_Breathe_Fire = Ability_Definition_Active_Base & {
    id: Ability_Id.dragon_knight_breathe_fire
    type: Ability_Type.target_ground
    damage: number
}

type Ability_Dragon_Knight_Dragon_Tail = Ability_Definition_Active_Base & {
    id: Ability_Id.dragon_knight_dragon_tail
    type: Ability_Type.target_unit
    damage: number
}

type Ability_Dragon_Knight_Elder_Dragon_Form = Ability_Definition_Active_Base & {
    id: Ability_Id.dragon_knight_elder_dragon_form
    type: Ability_Type.no_target
    duration: number
}

type Ability_Dragon_Knight_Elder_Dragon_Form_Attack = Ability_Definition_Active_Base & {
    id: Ability_Id.dragon_knight_elder_dragon_form_attack
    type: Ability_Type.target_ground
}

type Ability_Lion_Hex = Ability_Definition_Active_Base & {
    id: Ability_Id.lion_hex
    type: Ability_Type.target_unit
    duration: number
    move_points_reduction: number
}

type Ability_Lion_Impale = Ability_Definition_Active_Base & {
    id: Ability_Id.lion_impale
    type: Ability_Type.target_ground
    damage: number
}

type Ability_Lion_Finger_Of_Death = Ability_Definition_Active_Base & {
    id: Ability_Id.lion_finger_of_death
    type: Ability_Type.target_unit
    damage: number
}

type Ability_Mirana_Starfall = Ability_Definition_Active_Base & {
    id: Ability_Id.mirana_starfall
    type: Ability_Type.no_target
    damage: number
}

type Ability_Mirana_Arrow = Ability_Definition_Active_Base & {
    id: Ability_Id.mirana_arrow
    type: Ability_Type.target_ground
    targeting: Ability_Targeting_Line
}

type Ability_Mirana_Leap = Ability_Definition_Active_Base & {
    id: Ability_Id.mirana_leap
    type: Ability_Type.target_ground
}

type Ability_Sniper_Shrapnel = Ability_Definition_Active_Base & {
    id: Ability_Id.sniper_shrapnel
    type: Ability_Type.target_ground
}

type Ability_Ground_Target =
    Ability_Basic_Attack |
    Ability_Pudge_Hook |
    Ability_Skywrath_Mystic_Flare |
    Ability_Dragon_Knight_Breathe_Fire |
    Ability_Dragon_Knight_Elder_Dragon_Form_Attack |
    Ability_Lion_Impale |
    Ability_Mirana_Arrow |
    Ability_Mirana_Leap

type Ability_Unit_Target =
    Ability_Pudge_Dismember |
    Ability_Tide_Gush |
    Ability_Luna_Lucent_Beam |
    Ability_Skywrath_Ancient_Seal |
    Ability_Dragon_Knight_Dragon_Tail |
    Ability_Lion_Hex |
    Ability_Lion_Finger_Of_Death

type Ability_No_Target =
    Ability_Pudge_Rot |
    Ability_Tide_Anchor_Smash |
    Ability_Tide_Ravage |
    Ability_Luna_Eclipse |
    Ability_Skywrath_Concussive_Shot |
    Ability_Dragon_Knight_Elder_Dragon_Form |
    Ability_Mirana_Starfall

type Ability_Definition_Active = Ability_Ground_Target | Ability_Unit_Target | Ability_No_Target

type Ability_Definition_Passive =
    Ability_Luna_Moon_Glaive

type Ability_Definition = Ability_Definition_Active | Ability_Definition_Passive

type Ability_Effect =
    Ability_Effect_Luna_Moon_Glaive |
    Ability_Effect_Mirana_Starfall

type Delta_Ground_Target_Ability =
    Delta_Ability_Basic_Attack |
    Delta_Ability_Pudge_Hook |
    Delta_Ability_Skywrath_Mystic_Flare |
    Delta_Ability_Dragon_Knight_Breathe_Fire |
    Delta_Ability_Dragon_Knight_Elder_Dragon_Form_Attack |
    Delta_Ability_Lion_Impale |
    Delta_Ability_Mirana_Arrow |
    Delta_Ability_Mirana_Leap

type Delta_Unit_Target_Ability =
    Delta_Ability_Pudge_Dismember |
    Delta_Ability_Tide_Gush |
    Delta_Ability_Luna_Lucent_Beam |
    Delta_Ability_Skywrath_Ancient_Seal |
    Delta_Ability_Dragon_Knight_Dragon_Tail |
    Delta_Ability_Lion_Hex |
    Delta_Ability_Lion_Finger_Of_Death

type Delta_Use_No_Target_Ability =
    Delta_Ability_Pudge_Rot |
    Delta_Ability_Tide_Anchor_Smash |
    Delta_Ability_Tide_Ravage |
    Delta_Ability_Luna_Eclipse |
    Delta_Ability_Skywrath_Concussive_Shot |
    Delta_Ability_Dragon_Knight_Elder_Dragon_Form |
    Delta_Ability_Mirana_Starfall


type Basic_Attack_Hit = {
    hit: true
    target_unit_id: number
    damage_dealt: Health_Change
}

type Delta_Ability_Basic_Attack = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.basic_attack
    result: Basic_Attack_Hit | Line_Ability_Miss
}

type Pudge_Hook_Hit = {
    hit: true
    target_unit_id: number
    damage_dealt: Health_Change
    move_target_to: {
        x: number
        y: number
    }
}

type Line_Ability_Miss = {
    hit: false
    final_point: {
        x: number
        y: number
    }
}

type Delta_Ability_Pudge_Hook = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_hook
    result: Pudge_Hook_Hit | Line_Ability_Miss
}

type Delta_Ability_Pudge_Rot = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_rot
    targets: Unit_Health_Change[]
}

type Health_Change = {
    new_value: number
    value_delta: number
}

type Unit_Health_Change = {
    target_unit_id: number;
    change: Health_Change;
}

type Unit_Modifier_Application = {
    target_unit_id: number
    modifier: Modifier_Application
}

type Delta_Ability_Pudge_Dismember = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_dismember
    health_restored: Health_Change
    damage_dealt: Health_Change
}

type Delta_Ability_Tide_Gush = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.tide_gush
    modifier: Modifier_Application
    damage_dealt: Health_Change
}

type Delta_Ability_Tide_Anchor_Smash = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_anchor_smash
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}

type Delta_Ability_Tide_Ravage = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_ravage
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}

type Delta_Ability_Luna_Lucent_Beam = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.luna_lucent_beam,
    damage_dealt: Health_Change
}

type Concussive_Shot_Hit = {
    hit: true
    target_unit_id: number
    damage: Health_Change
    modifier: Modifier_Application
}

type Concussive_Shot_Miss = {
    hit: false
}

type Delta_Ability_Skywrath_Concussive_Shot = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.skywrath_concussive_shot
    result: Concussive_Shot_Hit | Concussive_Shot_Miss
}

type Delta_Ability_Skywrath_Ancient_Seal = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.skywrath_ancient_seal,
    modifier: Modifier_Application
}

type Delta_Ability_Skywrath_Mystic_Flare = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.skywrath_mystic_flare
    damage_remaining: number
    targets: Unit_Health_Change[]
}

type Ability_Effect_Luna_Moon_Glaive = {
    ability_id: Ability_Id.luna_moon_glaive
    source_unit_id: number
    target_unit_id: number
    original_target_id: number
    damage_dealt: Health_Change
}

type Ability_Effect_Mirana_Starfall = {
    ability_id: Ability_Id.mirana_starfall
    source_unit_id: number
    target_unit_id: number
    damage_dealt: Health_Change
}

type Delta_Ability_Luna_Eclipse = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.luna_eclipse
    missed_beams: number
    targets: Unit_Health_Change[]
}

type Delta_Ability_Dragon_Knight_Breathe_Fire = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_breathe_fire
    targets: Unit_Health_Change[]
}

type Delta_Ability_Dragon_Knight_Dragon_Tail = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_dragon_tail
    damage_dealt: Health_Change
    modifier: Modifier_Application
}

type Delta_Ability_Dragon_Knight_Elder_Dragon_Form = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_elder_dragon_form
    modifier: Modifier_Application
}

type Delta_Ability_Dragon_Knight_Elder_Dragon_Form_Attack = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_elder_dragon_form_attack
    targets: Unit_Health_Change[]
}

type Delta_Ability_Lion_Hex = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.lion_hex
    modifier: Modifier_Application
}

type Delta_Ability_Lion_Impale = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.lion_impale
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}

type Delta_Ability_Lion_Finger_Of_Death = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.lion_finger_of_death
    damage_dealt: Health_Change
}

type Delta_Ability_Mirana_Starfall = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.mirana_starfall
    targets: Unit_Health_Change[]
}

type Mirana_Arrow_Hit = {
    hit: true
    stun: Unit_Modifier_Application
}

type Delta_Ability_Mirana_Arrow = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.mirana_arrow
    result: Mirana_Arrow_Hit | Line_Ability_Miss
}

type Delta_Ability_Mirana_Leap = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.mirana_leap
}