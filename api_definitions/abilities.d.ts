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

declare const enum Ability_Effect_Type {
    ability = 0,
    modifier = 1
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

type Battle_Delta_Unit_Ground_Target_Ability =
    Battle_Delta_Ability_Basic_Attack |
    Battle_Delta_Ability_Pudge_Hook

type Battle_Delta_Unit_Unit_Target_Ability =
    Battle_Delta_Ability_Pudge_Dismember |
    Battle_Delta_Ability_Tide_Gush

type Battle_Delta_Unit_Use_No_Target_Ability =
    Battle_Delta_Ability_Pudge_Rot |
    Battle_Delta_Ability_Tide_Anchor_Smash |
    Battle_Delta_Ability_Tide_Ravage

type Battle_Delta_Ability_Basic_Attack_Deltas_Hit = {
    hit: true
    delta: Battle_Delta_Health_Change
}

type Battle_Delta_Ability_Basic_Attack = Battle_Delta_Unit_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.basic_attack
    result: Battle_Delta_Ability_Basic_Attack_Deltas_Hit | Battle_Delta_Ability_Line_Ability_Miss
}

type Battle_Delta_Ability_Pudge_Hook_Deltas_Hit = {
    hit: true
    deltas: [ Battle_Delta_Health_Change, Battle_Delta_Unit_Force_Move ]
}

type Battle_Delta_Ability_Line_Ability_Miss = {
    hit: false
    final_point: {
        x: number
        y: number
    }
}

type Battle_Delta_Ability_Pudge_Hook = Battle_Delta_Unit_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_hook
    result: Battle_Delta_Ability_Pudge_Hook_Deltas_Hit | Battle_Delta_Ability_Line_Ability_Miss
}

type Battle_Delta_Ability_Pudge_Rot = Battle_Delta_Unit_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_rot
    deltas: Battle_Delta_Health_Change[]
}

type Ability_Effect_Pudge_Flesh_Heap = {
    ability_id: Ability_Id.pudge_flesh_heap
    deltas: [ Battle_Delta_Unit_Max_Health_Change, Battle_Delta_Health_Change ]
}

type Battle_Delta_Ability_Pudge_Dismember = Battle_Delta_Unit_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_dismember
    heal_delta: Battle_Delta_Health_Change
    damage_delta: Battle_Delta_Health_Change
}

type Battle_Delta_Ability_Tide_Gush = Battle_Delta_Unit_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.tide_gush
    delta: Battle_Delta_Modifier_Applied<Ability_Effect_Tide_Gush_Modifier>
}

type Ability_Effect_Tide_Gush_Modifier = {
    ability_id: Ability_Id.tide_gush
    type: Ability_Effect_Type.modifier
    deltas: [Battle_Delta_Health_Change, Battle_Delta_Unit_Max_Move_Points_Change]
}

type Battle_Delta_Ability_Tide_Anchor_Smash = Battle_Delta_Unit_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_anchor_smash
    deltas: Battle_Delta_Modifier_Applied<Ability_Effect_Tide_Anchor_Smash_Modifier>[]
}

type Ability_Effect_Tide_Anchor_Smash_Modifier = {
    ability_id: Ability_Id.tide_anchor_smash
    type: Ability_Effect_Type.modifier
    deltas: [Battle_Delta_Health_Change, Battle_Delta_Unit_Attack_Bonus_Change]
}

type Ability_Effect_Tide_Kraken_Shell_Trigger = {
    ability_id: Ability_Id.tide_kraken_shell
    unit_id: number
}

type Battle_Delta_Ability_Tide_Ravage = Battle_Delta_Unit_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_ravage
    deltas: Battle_Delta_Modifier_Applied<Ability_Effect_Tide_Ravage_Modifier>[]
}

type Ability_Effect_Tide_Ravage_Modifier = {
    ability_id: Ability_Id.tide_ravage
    type: Ability_Effect_Type.modifier
    deltas: [Battle_Delta_Health_Change, Battle_Delta_Unit_State_Stunned_Counter_Change]
}
