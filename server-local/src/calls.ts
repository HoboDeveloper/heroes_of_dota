function try_authorize_user(id: PlayerID, dedicated_server_key: string): Authorize_Steam_User_Response | undefined {
    const steam_id = PlayerResource.GetSteamID(id).toString();

    return remote_request<Authorize_Steam_User_Request, Authorize_Steam_User_Response>("/trusted/try_authorize_steam_user", {
        steam_id: steam_id,
        steam_user_name: PlayerResource.GetPlayerName(id),
        dedicated_server_key: dedicated_server_key
    });
}

function try_get_player_state(main_player: Main_Player) {
    return remote_request_with_retry_on_403<Get_Player_State_Request, Player_State_Data>("/get_player_state", main_player, {
        access_token: main_player.token
    });
}

function try_query_characters(main_player: Main_Player) {
    return remote_request_with_retry_on_403<Get_Player_Characters_Request, Character_Data[]>("/get_player_characters", main_player, {
        access_token: main_player.token
    });
}

function try_create_new_character(main_player: Main_Player) {
    return remote_request_with_retry_on_403<Create_New_Character_Request, Create_New_Character_Response>("/create_new_character", main_player, {
        access_token: main_player.token
    });
}

function try_log_in_with_character(main_player: Main_Player, character_id: number) {
    return remote_request_with_retry_on_403<Login_With_Character_Request, Login_With_Character_Response>("/login_with_character", main_player, {
        access_token: main_player.token,
        character_id: character_id
    });
}

function try_with_delays_until_success<T>(delay: number, producer: () => T | undefined): T {
    let result: T | undefined;

    while((result = producer()) == undefined) wait(delay);

    return result;
}
