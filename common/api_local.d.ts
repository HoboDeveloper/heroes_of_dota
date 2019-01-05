type Move_Delta_Paths = { [delta_index: number]: { world_x: number, world_y: number }[] }

type Player_Net_Table_Base = {
    id: number,
    token: string
}

type Player_Net_Table_Not_Logged_In = {
    state: Player_State.not_logged_in
}

type Player_Net_Table_On_Global_Map = Player_Net_Table_Base & {
    state: Player_State.on_global_map
}

type Player_Net_Table_In_Battle = Player_Net_Table_Base & {
    state: Player_State.in_battle,
    battle: {
        participants: Battle_Player[],
        world_origin: {
            x: number,
            y: number
        },
        grid_size: {
            width: number,
            height: number
        }
        entity_id_to_unit_id: { [entity_id: number]: number },
        current_visual_head: number
    }
}

type Player_Net_Table = Player_Net_Table_On_Global_Map | Player_Net_Table_In_Battle | Player_Net_Table_Not_Logged_In;

type Put_Battle_Deltas_Event = {
    deltas: Battle_Delta[],
    delta_paths: Move_Delta_Paths,
    from_head: number
}

type Debug_Chat_Message_Event = {
    message: string;
}