type Move_Delta_Paths = Record<number, { x: number, y: number }[]>

type Visualizer_Unit_Data_Base = Unit_Stats & {
    id: number
}

type Visualizer_Hero_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.hero
    level: number
}

type Visualizer_Creep_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.creep
}

type Visualizer_Unit_Data = Visualizer_Hero_Data | Visualizer_Creep_Data

type Visualizer_Player_Data = {
    id: number
    gold: number
}

type Modifier_Data = {
    modifier_id: Modifier_Id
    modifier_handle_id: number
    changes: Modifier_Change[]
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
        players: Visualizer_Player_Data[]
        world_origin: {
            x: number
            y: number
        }
        grid_size: {
            width: number
            height: number
        }
        entity_id_to_unit_data: Record<number, Visualizer_Unit_Data>
        entity_id_to_rune_id: Record<number, number>
        entity_id_to_shop_id: Record<number, number>
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

type Battle_Cheat_Event = {
    message: string
}

type Fast_Forward_Event = Battle_Snapshot

type Grid_Highlight_Targeted_Ability_Event = {
    unit_id: number
    ability_id: Ability_Id
    from: {
        x: number
        y: number
    }
    to: {
        x: number
        y: number
    }
}

type Grid_Highlight_No_Target_Ability_Event = {
    unit_id: number
    ability_id: Ability_Id
    from: {
        x: number
        y: number
    }
}

type Game_Over_Event = {
    winner_player_id: number
}

type Player_Snapshot = {
    id: number
    gold: number
}

type Unit_Snapshot_Base = Unit_Stats & {
    id: number
    modifiers: Modifier_Data[]
    position: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
}

type Hero_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.hero
    level: number
    owner_id: number
    type: Hero_Type
}

type Creep_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.creep
}

type Unit_Snapshot = Hero_Snapshot | Creep_Snapshot

type Rune_Snapshot = {
    id: number
    type: Rune_Type
    position: {
        x: number
        y: number
    }
}

type Shop_Snapshot = {
    id: number
    position: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
}

type Tree_Snapshot = {
    id: number
    position: {
        x: number
        y: number
    }
}

type Battle_Snapshot = {
    players: Player_Snapshot[]
    units: Unit_Snapshot[]
    runes: Rune_Snapshot[]
    shops: Shop_Snapshot[]
    trees: Tree_Snapshot[]
    delta_head: number
}