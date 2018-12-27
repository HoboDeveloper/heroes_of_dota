const remote_root = IsInToolsMode ? "http://127.0.0.1:3638" : "http://cia-is.moe:3638";

function get_dedicated_server_key() {
    return GetDedicatedServerKey("v1");
}

function remote_request_async<T extends Object, N extends Object>(endpoint: string, body: T, callback: (data: N) => void, error_callback?: (code: number) => void) {
    const request = CreateHTTPRequestScriptVM("POST", remote_root + endpoint);

    request.SetHTTPRequestRawPostBody("application/json", json.encode(body));
    request.Send(response => {
        if (response.StatusCode == 200) {
            callback(json.decode(response.Body) as N);
        } else {
            print(`Error executing request to ${endpoint}: code ${response.StatusCode}, ${response.Body}`);

            if (error_callback) {
                error_callback(response.StatusCode);
            }
        }
    });
}

function remote_request<T extends Object, N extends Object>(endpoint: string, body: T): N | undefined {
    let request_completed = false;
    let result: N | undefined = undefined;

    remote_request_async<T, N>(endpoint, body,
        response => {
            result = response;
            request_completed = true;
        },
        () => {
            result = undefined;
            request_completed = true;
        });

    wait_until(() => request_completed);

    return result;
}

function remote_request_with_retry_on_403<T extends Object, N extends Object>(endpoint: string, main_player: Main_Player, body: T): N | undefined {
    let request_completed = false;
    let result: N | undefined = undefined;

    while (true) {
        let unauthorized = false;

        remote_request_async<T, N>(endpoint, body,
            response => {
                result = response;
                request_completed = true;
            },
            code => {
                result = undefined;
                request_completed = true;

                if (code == 403) {
                    unauthorized = true;
                }
            });

        wait_until(() => request_completed);

        if (unauthorized) {
            const steam_id = PlayerResource.GetSteamID(main_player.player_id).toString();
            const token = remote_request<Authorize_Steam_User_Request, Authorize_Steam_User_Response>("/trusted/try_authorize_steam_user", {
                steam_id: steam_id,
                dedicated_server_key: get_dedicated_server_key()
            });

            if (token) {
                main_player.token = token.token;
            }
        } else {
            return result;
        }
    }
}