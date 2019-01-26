declare const enum Player_State {
    on_global_map = 0,
    in_battle = 1,
    not_logged_in = 2
}

declare const enum Battle_Delta_Type {
    health_change = 0,
    mana_change = 1,
    unit_move = 2,
    unit_spawn = 3,
    end_turn = 4,
    unit_force_move = 5,
    unit_ground_target_ability = 6,
    unit_unit_target_ability = 7,
    unit_use_no_target_ability = 8,
    unit_level_change = 9,
    unit_max_health_change = 10,
    modifier_appled = 11,
    modifier_removed = 12
}

declare const enum Action_Type {
    move = 2,
    end_turn = 3,
    ground_target_ability = 4,
    unit_target_ability = 5,
    use_no_target_ability = 6
}

declare const enum Unit_Type {
    ursa = 0,
    sniper = 1,
    pudge = 2
}

declare const enum Unit_State {
    stunned = 0,
    silenced = 1,
    rooted = 2
}

declare const enum Ability_Targeting_Type {
    line = 0,
    unit_in_manhattan_distance = 2,
    rectangular_area_around_caster = 3
}

declare const enum Ability_Id {
    basic_attack = -1,
    pudge_hook = 0,
    pudge_rot = 1,
    pudge_flesh_heap = 2,
    pudge_dismember = 3,
    sniper_shrapnel = 4
}

declare const enum Ability_Type {
    passive = 0,
    no_target = 1,
    target_ground = 2,
    target_unit = 3
}

type Unit_Definition = {
    health: number;
    mana: number;
    move_points: number;
    attack: Ability_Definition_Active;
    abilities: Ability_Definition[];
}

type Ability_Definition_Active_Base = {
    available_since_level: number;
    cooldown: number;
    mana_cost: number;
}

type Ability_Definition_Passive_Base = {
    available_since_level: number
}

type Ability_Basic_Attack = Ability_Definition_Active_Base & {
    id: Ability_Id.basic_attack,
    type: Ability_Type.target_ground,
    targeting: Ability_Targeting_Line,
    damage: number
};

type Ability_Pudge_Hook = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_hook,
    type: Ability_Type.target_ground,
    targeting: Ability_Targeting_Line,
}

type Ability_Pudge_Rot = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_rot,
    type: Ability_Type.no_target,
    targeting: Ability_Targeting_Rectangular_Area_Around_Caster,
}

type Ability_Pudge_Flesh_Heap = Ability_Definition_Passive_Base & {
    id: Ability_Id.pudge_flesh_heap,
    type: Ability_Type.passive,
    health_per_kill: number
}

type Ability_Pudge_Dismember = Ability_Definition_Active_Base & {
    id: Ability_Id.pudge_dismember,
    type: Ability_Type.target_unit,
    targeting: Ability_Targeting_Unit_In_Manhattan_Distance,
}

type Ability_Sniper_Shrapnel = Ability_Definition_Active_Base & {
    id: Ability_Id.sniper_shrapnel,
    type: Ability_Type.target_ground,
    targeting: Ability_Targeting_Rectangular_Area_Around_Caster
}

type Ability_Definition_Active =
    Ability_Basic_Attack |
    Ability_Pudge_Hook |
    Ability_Pudge_Rot |
    Ability_Pudge_Dismember;

type Ability_Definition_Passive =
    Ability_Pudge_Flesh_Heap;

type Ability_Definition = Ability_Definition_Active | Ability_Definition_Passive;

type Ability_Targeting_Line = {
    type: Ability_Targeting_Type.line,
    line_length: number,
    stop_at_first_obstacle_hit: boolean
}

type Ability_Targeting_Unit_In_Manhattan_Distance = {
    type: Ability_Targeting_Type.unit_in_manhattan_distance,
    distance: number
}

type Ability_Targeting_Rectangular_Area_Around_Caster = {
    type: Ability_Targeting_Type.rectangular_area_around_caster,
    area_radius: number;
}

type Ability_Targeting =
    Ability_Targeting_Line |
    Ability_Targeting_Unit_In_Manhattan_Distance |
    Ability_Targeting_Rectangular_Area_Around_Caster;

type Action_Move = {
    type: Action_Type.move;
    unit_id: number,
    to: {
        x: number,
        y: number
    };
}

type Action_End_Turn = {
    type: Action_Type.end_turn;
}

type Action_Ground_Target_Ability = {
    type: Action_Type.ground_target_ability;
    ability_id: Ability_Id;
    unit_id: number;
    to: {
        x: number,
        y: number
    }
}

type Action_Unit_Target_Ability = {
    type: Action_Type.unit_target_ability;
    ability_id: Ability_Id;
    unit_id: number;
    target_id: number;
}

type Action_No_Target_Ability = {
    type: Action_Type.use_no_target_ability;
    ability_id: Ability_Id;
    unit_id: number;
}

type Turn_Action =
    Action_Move |
    Action_Ground_Target_Ability |
    Action_Unit_Target_Ability |
    Action_No_Target_Ability |
    Action_End_Turn;

type Battle_Player = {
    id: number,
    name: string
}

type Ability_Effect =
    Ability_Effect_Basic_Attack |
    Ability_Effect_Pudge_Hook |
    Ability_Effect_Pudge_Rot |
    Ability_Effect_Pudge_Flesh_Heap |
    Ability_Effect_Pudge_Dismember;

type Ability_Effect_Basic_Attack = {
    ability_id: Ability_Id.basic_attack;
    delta: Battle_Delta_Health_Change | undefined
}

type Ability_Effect_Pudge_Hook_Deltas_Hit = {
    hit: true,
    deltas: [ Battle_Delta_Health_Change, Battle_Delta_Unit_Force_Move ]
}

type Ability_Effect_Pudge_Hook_Deltas_Missed = {
    hit: false,
    final_point: {
        x: number,
        y: number
    }
}

type Ability_Effect_Pudge_Hook = {
    ability_id: Ability_Id.pudge_hook,
    result: Ability_Effect_Pudge_Hook_Deltas_Hit | Ability_Effect_Pudge_Hook_Deltas_Missed;
}

type Ability_Effect_Pudge_Rot = {
    ability_id: Ability_Id.pudge_rot,
    deltas: Battle_Delta_Health_Change[]
}

type Ability_Effect_Pudge_Flesh_Heap = {
    ability_id: Ability_Id.pudge_flesh_heap,
    deltas: [ Battle_Delta_Unit_Max_Health_Change, Battle_Delta_Health_Change ]
}

type Ability_Effect_Pudge_Dismember = {
    ability_id: Ability_Id.pudge_dismember,
    heal_delta: Battle_Delta_Health_Change,
    damage_delta: Battle_Delta_Health_Change
}

type Unit_Field_Change = {
    source_ability_id: Ability_Id;
    source_unit_id: number,
    target_unit_id: number;
    new_value: number,
    value_delta: number,
}

type Battle_Delta_Health_Change = Unit_Field_Change & {
    type: Battle_Delta_Type.health_change;
}

type Battle_Delta_Mana_Change = {
    type: Battle_Delta_Type.mana_change;
    unit_id: number;
    new_mana: number;
    mana_change: number;
}

type Battle_Delta_Unit_Move = {
    type: Battle_Delta_Type.unit_move;
    unit_id: number;
    move_cost: number,
    to_position: {
        x: number,
        y: number
    }
};

type Battle_Delta_Unit_Force_Move = {
    type: Battle_Delta_Type.unit_force_move;
    unit_id: number;
    to_position: {
        x: number,
        y: number
    }
}

type Battle_Delta_Unit_Spawn = {
    type: Battle_Delta_Type.unit_spawn;
    unit_type: Unit_Type;
    unit_id: number;
    owner_id: number;
    at_position: {
        x: number,
        y: number
    }
};

type Battle_Delta_Unit_Ground_Target_Ability = {
    type: Battle_Delta_Type.unit_ground_target_ability,
    effect: Ability_Effect;
    unit_id: number,
    target_position: {
        x: number,
        y: number
    }
}

type Battle_Delta_Unit_Unit_Target_Ability = {
    type: Battle_Delta_Type.unit_unit_target_ability,
    effect: Ability_Effect;
    unit_id: number,
    target_unit_id: number;
}

type Battle_Delta_Unit_Use_No_Target_Ability = {
    type: Battle_Delta_Type.unit_use_no_target_ability,
    effect: Ability_Effect;
    unit_id: number,
}

type Battle_Delta_End_Turn = {
    type: Battle_Delta_Type.end_turn;
}

type Battle_Delta_Unit_Level_Change = Unit_Field_Change & {
    type: Battle_Delta_Type.unit_level_change,
    received_from_enemy_kill: boolean
}

type Battle_Delta_Unit_Max_Health_Change = Unit_Field_Change & {
    type: Battle_Delta_Type.unit_max_health_change;
}

type Battle_Delta_Modifier_Applied = {
    type: Battle_Delta_Type.modifier_appled,
    modifier_id: number,
    effect: Ability_Effect,
    target_unit_id: number,
    source_unit_id: number
}

type Battle_Delta_Modifier_Removed = {
    type: Battle_Delta_Type.modifier_removed,
    modifier_id: number
}

type Battle_Delta =
    Battle_Delta_Health_Change |
    Battle_Delta_Mana_Change |
    Battle_Delta_Unit_Move |
    Battle_Delta_Unit_Spawn |
    Battle_Delta_Unit_Force_Move |
    Battle_Delta_Unit_Ground_Target_Ability |
    Battle_Delta_Unit_Unit_Target_Ability |
    Battle_Delta_Unit_Use_No_Target_Ability |
    Battle_Delta_Unit_Level_Change |
    Battle_Delta_Unit_Max_Health_Change |
    Battle_Delta_Modifier_Applied |
    Battle_Delta_Modifier_Removed |
    Battle_Delta_End_Turn;

type Movement_History_Entry = {
    order_x: number,
    order_y: number,
    location_x: number,
    location_y: number
}

type Query_Battle_Deltas_Request = {
    access_token: string;
    since_delta: number;
}

type Query_Battle_Deltas_Response = {
    deltas: Battle_Delta[]
};

type Take_Battle_Action_Request = {
    access_token: string;
    action: Turn_Action;
}

type Take_Battle_Action_Response = {
    previous_head: number,
    deltas: Battle_Delta[]
};

type Submit_Player_Movement_Request = {
    dedicated_server_key: string,
    access_token: string,
    current_location: {
        x: number,
        y: number
    },
    movement_history: Movement_History_Entry[]
}

type Submit_Player_Movement_Response = {};

type Authorize_Steam_User_Request = {
    steam_id: string,
    steam_user_name: string,
    dedicated_server_key: string
}

type Authorize_Steam_User_Response = {
    id: number,
    token: string;
}

type Get_Player_State_Request = {
    access_token: string;
}

type Query_Players_Movement_Request = {
    dedicated_server_key: string,
    access_token: string
};

type Player_Movement_Data = {
    id: number
    movement_history: Movement_History_Entry[],
    current_location: { x: number, y: number }
}

type Query_Players_Movement_Response = Player_Movement_Data[];

type Get_Player_Characters_Request = {
    access_token: string,
};

type Create_New_Character_Response = Character_Data;
type Get_Player_Characters_Response = Character_Data[];

type Character_Data = {
    id: number
}

type Create_New_Character_Request = {
    access_token: string,
}

type Login_With_Character_Request = {
    access_token: string,
    character_id: number
};

type Login_With_Character_Response = {};

type Player_State_Not_Logged_In_Data = {
    state: Player_State.not_logged_in
}

type Player_State_On_Global_Map_Data = {
    state: Player_State.on_global_map,
    player_position: {
        x: number,
        y: number
    }
}

type Player_State_In_Battle_Data = {
    state: Player_State.in_battle,
    grid_size: {
        width: number,
        height: number
    },
    participants: Battle_Player[]
}

type Player_State_Data = Player_State_Not_Logged_In_Data | Player_State_On_Global_Map_Data | Player_State_In_Battle_Data;

type Attack_Player_Request = {
    dedicated_server_key: string,
    access_token: string,
    target_player_id: number
};

type Attack_Player_Response = Player_State_Data;

type Submit_Chat_Message_Request = {
    access_token: string;
    message: string;
}

type Submit_Chat_Message_Response = Pull_Pending_Chat_Messages_Response;

type Pull_Pending_Chat_Messages_Request = {
    access_token: string;
}

type Pull_Pending_Chat_Messages_Response = {
    messages: Chat_Message[];
}

type Chat_Message = {
    from_player_id: number;
    from_player_name: string;
    message: string;
}

type Battle_Cheat_Command_Request = {
    access_token: string,
    cheat: string,
    selected_unit_id: number
}