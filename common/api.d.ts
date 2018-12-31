declare const enum Player_State {
    on_global_map = 0,
    in_battle = 1,
    not_logged_in = 2
}

declare const enum Battle_Delta_Type {
    health_change = 0,
    unit_move = 1,
    unit_attack = 2,
    unit_spawn = 3,
    end_turn = 4
}

declare const enum Action_Type {
    attack = 0,
    move = 1,
    end_turn = 2
}

// TODO I can see how attacking a cell would cause issues in queued actions which result in a unit being moved,
// TODO I think there should be an Action_Attack_Cell and Action_Attack_Target
type Action_Attack = {
    type: Action_Type.attack;
    unit_id: number,
    to: {
        x: number,
        y: number
    };
}

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

type Turn_Action = Action_Attack | Action_Move | Action_End_Turn;

type Battle_Delta_Health_Change = {
    type: Battle_Delta_Type.health_change;
    source_unit_id: number;
    target_unit_id: number;
    new_health: number;
    damage_dealt: number;
    health_restored: number;
}

type Battle_Delta_Unit_Move = {
    type: Battle_Delta_Type.unit_move;
    unit_id: number;
    to_position: {
        x: number,
        y: number
    }
};

type Battle_Delta_Unit_Attack = {
    type: Battle_Delta_Type.unit_attack,
    unit_id: number,
    attacked_position: {
        x: number,
        y: number
    }
}

type Battle_Delta_Unit_Spawn = {
    type: Battle_Delta_Type.unit_spawn;
    unit_id: number;
    owner_id: number;
    at_position: {
        x: number,
        y: number
    }
};

type Battle_Delta_End_Turn = {
    type: Battle_Delta_Type.end_turn;
};

type Battle_Delta =
    Battle_Delta_Health_Change |
    Battle_Delta_Unit_Attack |
    Battle_Delta_Unit_Move |
    Battle_Delta_Unit_Spawn |
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
    dedicated_server_key: string
}

type Authorize_Steam_User_Response = {
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

type Player_State_Data = {
    state: Player_State,
    player_position: {
        x: number,
        y: number
    }
}

type Attack_Player_Request = {
    dedicated_server_key: string,
    access_token: string,
    target_player_id: number
};

type Attack_Player_Response = {
}