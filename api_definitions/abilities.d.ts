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

    sniper_shrapnel = 8
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
    Ability_Tide_Ravage;

type Ability_Definition_Passive =
    Ability_Pudge_Flesh_Heap |
    Ability_Tide_Kraken_Shell

type Ability_Definition = Ability_Definition_Active | Ability_Definition_Passive

type Ability_Effect =
    Ability_Effect_Pudge_Flesh_Heap |
    Ability_Effect_Tide_Gush_Modifier |
    Ability_Effect_Tide_Anchor_Smash_Modifier |
    Ability_Effect_Tide_Kraken_Shell_Trigger |
    Ability_Effect_Tide_Ravage_Modifier;

type Delta_Ground_Target_Ability =
    Delta_Ability_Basic_Attack |
    Delta_Ability_Pudge_Hook

type Delta_Unit_Target_Ability =
    Delta_Ability_Pudge_Dismember |
    Delta_Ability_Tide_Gush

type Delta_Use_No_Target_Ability =
    Delta_Ability_Pudge_Rot |
    Delta_Ability_Tide_Anchor_Smash |
    Delta_Ability_Tide_Ravage

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

type Delta_Ability_Pudge_Dismember = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_dismember
    heal_delta: Delta_Health_Change
    damage_delta: Delta_Health_Change
}

type Delta_Ability_Tide_Gush = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.tide_gush
    delta: Delta_Modifier_Applied<Ability_Effect_Tide_Gush_Modifier>
}

type Ability_Effect_Tide_Gush_Modifier = {
    ability_id: Ability_Id.tide_gush
    deltas: [Delta_Health_Change, Delta_Max_Move_Points_Change]
}

type Delta_Ability_Tide_Anchor_Smash = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_anchor_smash
    deltas: Delta_Modifier_Applied<Ability_Effect_Tide_Anchor_Smash_Modifier>[]
}

type Ability_Effect_Tide_Anchor_Smash_Modifier = {
    ability_id: Ability_Id.tide_anchor_smash
    deltas: [Delta_Health_Change, Delta_Attack_Bonus_Change]
}

type Ability_Effect_Tide_Kraken_Shell_Trigger = {
    ability_id: Ability_Id.tide_kraken_shell
    unit_id: number
}

type Delta_Ability_Tide_Ravage = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_ravage
    deltas: Delta_Modifier_Applied<Ability_Effect_Tide_Ravage_Modifier>[]
}

type Ability_Effect_Tide_Ravage_Modifier = {
    ability_id: Ability_Id.tide_ravage
    deltas: [Delta_Health_Change, Delta_State_Stunned_Counter_Change]
}
