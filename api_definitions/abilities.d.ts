declare const enum Ability_Id {
    basic_attack = -1,
    pudge_hook = 0,
    pudge_rot = 1,
    pudge_flesh_heap = 2,
    pudge_dismember = 3,
    tide_gush = 4,
    tide_anchor_smash = 5,
    tide_kraken_shell = 6,
    tide_ravage = 7,
    luna_lucent_beam = 8,
    luna_moon_glaive = 9,
    luna_lunar_blessing = 10,
    luna_eclipse = 11,

    sniper_shrapnel = 12
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

type Ability_Pudge_Flesh_Heap = Ability_Definition_Passive_Base & {
    id: Ability_Id.pudge_flesh_heap
    type: Ability_Type.passive
    health_per_kill: number
}

type Ability_Pudge_Dismember = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_dismember
    type: Ability_Type.target_unit
    targeting: Ability_Targeting_Unit_In_Manhattan_Distance
}

type Ability_Tide_Gush = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_gush
    type: Ability_Type.target_unit
    targeting: Ability_Targeting_Unit_In_Manhattan_Distance
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

type Ability_Tide_Kraken_Shell = Ability_Definition_Passive_Base & {
    id: Ability_Id.tide_kraken_shell
    type: Ability_Type.passive
    attack_reduction: number
}

type Ability_Tide_Ravage = Ability_Definition_Active_Base & {
    id: Ability_Id.tide_ravage
    type: Ability_Type.no_target
    targeting: Ability_Targeting_Unit_In_Manhattan_Distance
    damage: number
}

type Ability_Luna_Lucent_Beam = Ability_Definition_Active_Base & {
    id: Ability_Id.luna_lucent_beam
    type: Ability_Type.target_unit
    targeting: Ability_Targeting_Unit_In_Manhattan_Distance
    damage: number
}

type Ability_Luna_Moon_Glaive = Ability_Definition_Passive_Base & {
    id: Ability_Id.luna_moon_glaive
    type: Ability_Type.passive
}

type Ability_Luna_Lunar_Blessing = Ability_Definition_Passive_Base & {
    id: Ability_Id.luna_lunar_blessing
    type: Ability_Type.passive
    attack_bonus: number
}

type Ability_Luna_Eclipse = Ability_Definition_Active_Base & {
    id: Ability_Id.luna_eclipse
    type: Ability_Type.no_target
    targeting: Ability_Targeting_Unit_In_Manhattan_Distance
    total_beams: number
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
    Ability_Luna_Eclipse

type Ability_Definition_Passive =
    Ability_Pudge_Flesh_Heap |
    Ability_Tide_Kraken_Shell |
    Ability_Luna_Moon_Glaive |
    Ability_Luna_Lunar_Blessing

type Ability_Definition = Ability_Definition_Active | Ability_Definition_Passive

type Ability_Effect =
    Ability_Effect_Pudge_Flesh_Heap |
    Ability_Effect_Tide_Kraken_Shell_Trigger |
    Ability_Effect_Luna_Moon_Glaive |
    Ability_Effect_Luna_Lunar_Blessing

type Delta_Ground_Target_Ability =
    Delta_Ability_Basic_Attack |
    Delta_Ability_Pudge_Hook

type Delta_Unit_Target_Ability =
    Delta_Ability_Pudge_Dismember |
    Delta_Ability_Tide_Gush |
    Delta_Ability_Luna_Lucent_Beam

type Delta_Use_No_Target_Ability =
    Delta_Ability_Pudge_Rot |
    Delta_Ability_Tide_Anchor_Smash |
    Delta_Ability_Tide_Ravage |
    Delta_Ability_Luna_Eclipse

type Delta_Ability_Basic_Attack_Deltas_Hit = {
    hit: true
    delta: Delta_Health_Change
}

type Delta_Ability_Basic_Attack = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.basic_attack
    result: Delta_Ability_Basic_Attack_Deltas_Hit | Delta_Ability_Line_Ability_Miss
}

type Delta_Ability_Pudge_Hook_Deltas_Hit = {
    hit: true
    deltas: [ Delta_Health_Change, Delta_Force_Move ]
}

type Delta_Ability_Line_Ability_Miss = {
    hit: false
    final_point: {
        x: number
        y: number
    }
}

type Delta_Ability_Pudge_Hook = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_hook
    result: Delta_Ability_Pudge_Hook_Deltas_Hit | Delta_Ability_Line_Ability_Miss
}

type Delta_Ability_Pudge_Rot = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_rot
    deltas: Delta_Health_Change[]
}

type Ability_Effect_Pudge_Flesh_Heap = {
    ability_id: Ability_Id.pudge_flesh_heap
    deltas: [ Delta_Max_Health_Change, Delta_Health_Change ]
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
    modifier_id: number
    duration: number
    damage_dealt: Value_Change
    move_points_change: Value_Change
}

type Delta_Ability_Tide_Anchor_Smash = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_anchor_smash
    duration: number
    effects: {
        unit_id: number
        modifier_id: number
        attack_change: Value_Change
        damage_dealt: Value_Change
    }[]
}

type Ability_Effect_Tide_Kraken_Shell_Trigger = {
    ability_id: Ability_Id.tide_kraken_shell
    unit_id: number
}

type Ravage_Target = {
    unit_id: number
    modifier_id: number
    damage_dealt: Value_Change
    stun_counter: Value_Change
}

type Delta_Ability_Tide_Ravage = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_ravage
    targets: Ravage_Target[]
}

type Delta_Ability_Luna_Lucent_Beam = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.luna_lucent_beam,
    damage_dealt: Value_Change
}

type Ability_Effect_Luna_Moon_Glaive = {
    ability_id: Ability_Id.luna_moon_glaive
    source_unit_id: number
    target_unit_id: number
    original_target_id: number
    damage_dealt: Value_Change
}

type Ability_Effect_Luna_Lunar_Blessing = {
    ability_id: Ability_Id.luna_lunar_blessing
    delta: Delta_Attack_Bonus_Change
}

type Delta_Ability_Luna_Eclipse = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.luna_eclipse
    missed_beams: number
    targets: {
        target_unit_id: number
        damage_dealt: Value_Change
    }[]
}