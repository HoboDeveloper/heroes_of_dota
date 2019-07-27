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

    sniper_shrapnel = 18
}

declare const enum Modifier_Id {
    tide_gush = 0,
    tide_anchor_smash = 1,
    tide_ravage = 2,
    skywrath_concussive_shot = 3,
    skywrath_ancient_seal = 4
}

type Ability_Basic_Attack = Ability_Definition_Active_Base & {
    id: Ability_Id.basic_attack
    type: Ability_Type.target_ground
    targeting: Ability_Targeting_Line
    damage: number
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
    targeting: Ability_Targeting_Rectangular_Area_Around_Caster
    damage: number
}

type Ability_Pudge_Dismember = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_dismember
    type: Ability_Type.target_unit
    targeting: Ability_Targeting_Target_In_Manhattan_Distance
    damage: number
}

type Ability_Tide_Gush = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_gush
    type: Ability_Type.target_unit
    targeting: Ability_Targeting_Target_In_Manhattan_Distance
    damage: number
    move_points_reduction: number
}

type Ability_Tide_Anchor_Smash = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_anchor_smash
    type: Ability_Type.no_target
    targeting: Ability_Targeting_Rectangular_Area_Around_Caster
    damage: number
    attack_reduction: number
}

type Ability_Tide_Ravage = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_ravage
    type: Ability_Type.no_target
    targeting: Ability_Targeting_Target_In_Manhattan_Distance
    damage: number
}

type Ability_Luna_Lucent_Beam = Ability_Definition_Active_Base & {
    id: Ability_Id.luna_lucent_beam
    type: Ability_Type.target_unit
    targeting: Ability_Targeting_Target_In_Manhattan_Distance
    damage: number
}

type Ability_Luna_Moon_Glaive = Ability_Definition_Passive_Base & {
    id: Ability_Id.luna_moon_glaive
    type: Ability_Type.passive
}

type Ability_Luna_Eclipse = Ability_Definition_Active_Base & {
    id: Ability_Id.luna_eclipse
    type: Ability_Type.no_target
    targeting: Ability_Targeting_Target_In_Manhattan_Distance
    total_beams: number
}

type Ability_Skywrath_Concussive_Shot = Ability_Definition_Active_Base & {
    id: Ability_Id.skywrath_concussive_shot
    type: Ability_Type.no_target
    targeting: Ability_Targeting_Rectangular_Area_Around_Caster
    damage: number
    move_points_reduction: number
    duration: number
}

type Ability_Skywrath_Ancient_Seal = Ability_Definition_Active_Base & {
    id: Ability_Id.skywrath_ancient_seal
    type: Ability_Type.target_unit
    targeting: Ability_Targeting_Target_In_Manhattan_Distance
    duration: number
}

type Ability_Skywrath_Mystic_Flare = Ability_Definition_Active_Base & {
    id: Ability_Id.skywrath_mystic_flare
    type: Ability_Type.target_ground
    targeting: Ability_Targeting_Target_In_Manhattan_Distance
    damage: number
}

type Ability_Dragon_Knight_Breathe_Fire = Ability_Definition_Active_Base & {
    id: Ability_Id.dragon_knight_breathe_fire
    type: Ability_Type.target_ground
    targeting: Ability_Targeting_Line
    damage: number
}

type Ability_Sniper_Shrapnel = Ability_Definition_Active_Base & {
    id: Ability_Id.sniper_shrapnel
    type: Ability_Type.target_ground
    targeting: Ability_Targeting_Rectangular_Area_Around_Caster
}

type Ability_Definition_Active =
    Ability_Basic_Attack |
    Ability_Pudge_Hook |
    Ability_Pudge_Rot |
    Ability_Pudge_Dismember |
    Ability_Tide_Gush |
    Ability_Tide_Anchor_Smash |
    Ability_Tide_Ravage |
    Ability_Luna_Lucent_Beam |
    Ability_Luna_Eclipse |
    Ability_Skywrath_Concussive_Shot |
    Ability_Skywrath_Ancient_Seal |
    Ability_Skywrath_Mystic_Flare |
    Ability_Dragon_Knight_Breathe_Fire

type Ability_Definition_Passive =
    Ability_Luna_Moon_Glaive

type Ability_Definition = Ability_Definition_Active | Ability_Definition_Passive

type Ability_Effect =
    Ability_Effect_Luna_Moon_Glaive

type Delta_Ground_Target_Ability =
    Delta_Ability_Basic_Attack |
    Delta_Ability_Pudge_Hook |
    Delta_Ability_Skywrath_Mystic_Flare |
    Delta_Ability_Dragon_Knight_Breathe_Fire

type Delta_Unit_Target_Ability =
    Delta_Ability_Pudge_Dismember |
    Delta_Ability_Tide_Gush |
    Delta_Ability_Luna_Lucent_Beam |
    Delta_Ability_Skywrath_Ancient_Seal

type Delta_Use_No_Target_Ability =
    Delta_Ability_Pudge_Rot |
    Delta_Ability_Tide_Anchor_Smash |
    Delta_Ability_Tide_Ravage |
    Delta_Ability_Luna_Eclipse |
    Delta_Ability_Skywrath_Concussive_Shot

type Basic_Attack_Hit = {
    hit: true
    target_unit_id: number
    damage_dealt: Value_Change
}

type Delta_Ability_Basic_Attack = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.basic_attack
    result: Basic_Attack_Hit | Line_Ability_Miss
}

type Pudge_Hook_Hit = {
    hit: true
    target_unit_id: number
    damage_dealt: Value_Change
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
    targets: {
        target_unit_id: number
        damage_dealt: Value_Change
    }[]
}

type Value_Change = {
    new_value: number
    value_delta: number
}

type Delta_Ability_Pudge_Dismember = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_dismember
    health_restored: Value_Change
    damage_dealt: Value_Change
}

type Delta_Ability_Tide_Gush = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.tide_gush
    modifier: Modifier_Application
    duration: number
    damage_dealt: Value_Change
}

type Delta_Ability_Tide_Anchor_Smash = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_anchor_smash
    duration: number
    targets: {
        target_unit_id: number
        modifier: Modifier_Application
        damage_dealt: Value_Change
    }[]
}

type Ravage_Target = {
    target_unit_id: number
    damage_dealt: Value_Change
    modifier: Modifier_Application
}

type Delta_Ability_Tide_Ravage = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_ravage
    duration: number
    targets: Ravage_Target[]
}

type Delta_Ability_Luna_Lucent_Beam = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.luna_lucent_beam,
    damage_dealt: Value_Change
}

type Concussive_Shot_Hit = {
    hit: true
    target_unit_id: number
    damage: Value_Change
    modifier: Modifier_Application
    duration: number
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
    duration: number
}

type Delta_Ability_Skywrath_Mystic_Flare = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.skywrath_mystic_flare
    damage_remaining: number
    targets: {
        target_unit_id: number
        damage_dealt: Value_Change
    }[]
}

type Ability_Effect_Luna_Moon_Glaive = {
    ability_id: Ability_Id.luna_moon_glaive
    source_unit_id: number
    target_unit_id: number
    original_target_id: number
    damage_dealt: Value_Change
}

type Delta_Ability_Luna_Eclipse = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.luna_eclipse
    missed_beams: number
    targets: {
        target_unit_id: number
        damage_dealt: Value_Change
    }[]
}

type Delta_Ability_Dragon_Knight_Breathe_Fire = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_breathe_fire
    targets: {
        target_unit_id: number
        damage_dealt: Value_Change
    }[]
}