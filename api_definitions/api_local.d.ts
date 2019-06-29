type Move_Delta_Paths = { [delta_index: number]: { x: number, y: number }[] }

// TODO transfer modifiers/state counters
type Shared_Visualizer_Unit_Data = {
    id: number
    level: number
    health: number
    max_health: number
    move_points: number
    max_move_points: number
    attack_bonus: number
    stunned_counter: number
}

type Player_Net_Table_Base = {
    id: number
    token: string
}

type Player_Net_Table_Not_Logged_In = {
    state: Player_State.not_logged_in
}

type Player_Net_Table_On_Global_Map = Player_Net_Table_Base & {
    state: Player_State.on_global_map
}

type Player_Net_Table_In_Battle = Player_Net_Table_Base & {
    state: Player_State.in_battle
    battle: {
        id: number
        participants: Battle_Participant_Info[]
        world_origin: {
            x: number
            y: number
        }
        grid_size: {
            width: number
            height: number
        }
        entity_id_to_unit_data: { [entity_id: number]: Shared_Visualizer_Unit_Data }
        current_visual_head: number
    }
}

type Player_Net_Table = Player_Net_Table_On_Global_Map | Player_Net_Table_In_Battle | Player_Net_Table_Not_Logged_In

type Put_Deltas_Event = {
    deltas: Delta[]
    delta_paths: Move_Delta_Paths
    from_head: number
}

type Debug_Chat_Message_Event = {
    message: string
}

type Fast_Forward_Event = Battle_Snapshot

type Grid_Highlight_Basic_Attack_Event = {
    unit_id: number
    from: {
        x: number
        y: number
    }
    to: {
        x: number
        y: number
    }
}

type Game_Over_Event = {
    winner_player_id: number
}

type Unit_Snapshot = Shared_Visualizer_Unit_Data & {
    owner_id: number
    type: Unit_Type
    position: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
}

type Battle_Snapshot = {
    units: Unit_Snapshot[]
    delta_head: number
}