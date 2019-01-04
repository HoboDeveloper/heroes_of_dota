type Battle_Net_Table_Data = {
    world_origin: {
        x: number,
        y: number
    },
    entity_id_to_unit_id: { [entity_id:number]:number },
    current_visual_head: number
}

type Player_Net_Table = {
    token: string,
    state: Player_State,
    // TODO decide if this should be union-based
    battle: Battle_Net_Table_Data | undefined
}

type Put_Battle_Deltas_Event = {
    deltas: Battle_Delta[],
    from_head: number
}

type Debug_Chat_Message_Event = {
    message: string;
}