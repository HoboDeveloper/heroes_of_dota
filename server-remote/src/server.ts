import {createServer} from "http";
import {start_battle} from "./battle";
import {randomBytes} from "crypto"
import {XY, xy} from "./common";

type Request_Handler = (body: string) => Request_Result;

const enum Result_Type {
    ok = 0,
    error = 1
}

export interface Player {
    id: number;
    characters: Character[];
    current_character: Character | undefined;
    current_location: XY;
    movement_history: Movement_History_Entry[];
}

interface Character {
    id: number;
}

const players: Player[] = [];
const token_to_player = new Map<string, Player>();
const steam_id_to_player = new Map<string, Player>();

let player_id_auto_increment = 0;
let character_id_auto_increment = 0;

const test_player = make_new_player();
players.push(test_player);

function generate_access_token() {
    return randomBytes(32).toString("hex");
}

function make_new_player(): Player {
    return {
        id: player_id_auto_increment++,
        characters: [],
        current_character: undefined,
        current_location: xy(0, 0),
        movement_history: []
    }
}

function make_character(): Character {
    return {
        id: character_id_auto_increment++
    }
}

function try_do_with_player<T>(access_token: string, do_what: (player: Player) => T): T | undefined {
    const player = token_to_player.get(access_token);

    if (!player) {
        return undefined;
    }

    return do_what(player);
}

function player_by_id(player_id: number) {
    return players.find(player => player.id == player_id);
}

function create_new_character_for_player(player: Player): Character {
    const new_character = make_character();

    player.characters.push(new_character);

    return new_character;
}

function try_authorize_steam_player_from_dedicated_server(steam_id: string) {
    let player = steam_id_to_player.get(steam_id);

    if (!player) {
       player = make_new_player();
       steam_id_to_player.set(steam_id, player);
       players.push(player)
    }

    const token = generate_access_token();
    token_to_player.set(token, player);

    return token;
}

function get_player_characters(player: Player) {
    return player.characters;
}

function login_with_character(player: Player, character_id: number) {
    const character = player.characters.find(character => character.id == character_id);

    if (!character) {
        return undefined;
    }

    player.current_character = character;

    return character;
}

interface Result_Ok {
    type: Result_Type.ok;
    content?: string;
}

interface Result_Error {
    type: Result_Type.error;
    code: number;
}

const handlers = new Map<string, Request_Handler>();

function character_to_json_object(character: Character) {
    return {
        id: character.id
    };
}

function validate_dedicated_server_key(key: string) {
    return true;
}

// TODO automatically validate dedicated key on /trusted path
// TODO don't forget that elements in JSON array can be null
handlers.set("/trusted/try_authorize_steam_user", body => {
    const request = JSON.parse(body) as {
        dedicated_server_key: string,
        steam_id: string
    };

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const token = try_authorize_steam_player_from_dedicated_server(request.steam_id);

    return make_ok_json({
        token: token
    });
});

handlers.set("/get_player_characters", body => {
    const request = JSON.parse(body) as {
        access_token: string,
    };

    const characters = try_do_with_player(request.access_token, get_player_characters);

    if (characters) {
        return make_ok_json(characters.map(character_to_json_object));
    } else {
        return make_error(400);
    }
});

handlers.set("/create_new_character", body => {
    const request = JSON.parse(body) as {
        access_token: string,
    };

    const character = try_do_with_player(request.access_token, create_new_character_for_player);

    if (character) {
        return make_ok_json(character_to_json_object(character));
    } else {
        return make_error(400);
    }
});

handlers.set("/login_with_character", body => {
    const request = JSON.parse(body) as Login_With_Character_Request;
    const result = try_do_with_player(request.access_token, player => {
        const character = login_with_character(player, request.character_id);

        if (character) {
            return {
                player: player,
                character: character
            }
        }
    });

    if (result) {
        return make_ok_json({
            position: result.player.current_location
        });
    } else {
        return make_error(400);
    }
});

handlers.set("/trusted/submit_player_movement", body => {
    const request = JSON.parse(body) as Submit_Player_Movement_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    try_do_with_player(request.access_token, player => {
        console.log("Submitted movement for", player.id);

        player.current_location = xy(request.current_location.x, request.current_location.y);
        player.movement_history = request.movement_history.map(entry => ({
            order_x: entry.order_x,
            order_y: entry.order_y,
            location_x: entry.location_x,
            location_y: entry.location_y
        }));

        {
            test_player.current_location = xy(request.current_location.x + 800, request.current_location.y);
            test_player.movement_history = request.movement_history.map(entry => ({
                order_x: entry.order_x + 800,
                order_y: entry.order_y,
                location_x: entry.location_x + 800,
                location_y: entry.location_y
            }));
        }
    });

    return make_ok_json({});
});

// TODO not necessarily has to be trusted, right? It's just a read, though might be a heavy one
handlers.set("/trusted/query_players_movement", body => {
    const request = JSON.parse(body) as Query_Players_Movement_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const player_locations = try_do_with_player<Query_Players_Movement_Response>(request.access_token, requesting_player => {
        return players.filter(player => player != requesting_player).map(player => ({
            id: player.id,
            movement_history: player.movement_history.map(entry => ({
                order_x: entry.order_x,
                order_y: entry.order_y,
                location_x: entry.location_x,
                location_y: entry.location_y
            })),
            current_location: {
                x: player.current_location.x,
                y: player.current_location.y
            }
        }))
    });

    if (player_locations) {
        return make_ok_json(player_locations);
    } else {
        return make_error(400);
    }
});

handlers.set("/trusted/attack_character", body => {
    const request = JSON.parse(body) as {
        dedicated_server_key: string,
        access_token: string,
        target_player_id: number
    };

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const ok = try_do_with_player(request.access_token, player => {
        const other_player = player_by_id(request.target_player_id);

        if (!other_player) {
            return false;
        }

        start_battle([
            player,
            other_player
        ]);

        return true;
    });

    if (ok) {
        return make_ok_json({});
    } else {
        return make_error(400);
    }
});

type Request_Result = Result_Ok | Result_Error;

function make_error(code: number): Result_Error {
    return { type: Result_Type.error, code: code };
}

function make_ok(result: string): Result_Ok {
    return { type: Result_Type.ok, content: result };
}

function make_ok_json(data: any): Result_Ok {
    return make_ok(JSON.stringify(data));
}

function handle_request(url: string, data: string): Request_Result {
    try {
        const handler = handlers.get(url);

        if (handler) {
            return handler(data);
        } else {
            return make_error(404);
        }
    } catch (error) {
        console.log(error);
        console.log(error.stack);

        return make_error(500);
    }
}

export function start_server() {
    createServer((req, res) => {
        const url = req.url;

        if (!url) {
            req.connection.destroy();
            return;
        }

        let body = "";

        req.on("data", (data: any) => {
            const data_limit = 1e6;

            if (data.length > data_limit || body.length > data_limit) {
                req.connection.destroy();
            } else {
                body += data;
            }
        });

        req.on("end", () => {
            const result = handle_request(url, body);

            switch (result.type) {
                case Result_Type.ok: {
                    res.writeHead(200, { "Content-Type": "text/json" });
                    res.end(result.content);
                    break;
                }

                case Result_Type.error: {
                    res.writeHead(result.code);
                    res.end();
                    break;
                }
            }
        });
    }).listen(3637);
}


/*
flow:
    try_auth -> token
    get_player_characters(token) -> characters

    if wants_to_create_new_character {
        create_new_character(token)
    }

    login_with_character(token, char) -> position

    while(true)
        if in_world {
            report_player_movement(token, current_position)
            query_players_movement(token) -> other_player_with_movement
        }

        if wants_to_battle {
            start_battle(token, other_player_id)
        }

        if in_battle {
            query_battle_actions(token, latest_action_we_have) -> actions_after_specified

            if wants_to_act {
                send_battle_action(token, action)
            }
        }
 */
