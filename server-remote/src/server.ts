import {createServer} from "http";
import {randomBytes} from "crypto"
import {
    Battle_Record, cheat,
    find_battle_by_id, get_all_battles,
    get_battle_deltas_after, random_in_array, random_unoccupied_point_in_deployment_zone,
    start_battle,
    try_take_turn_action
} from "./battle";
import {unreachable, XY, xy} from "./common";
import {pull_pending_chat_messages_for_player, submit_chat_message} from "./chat";
import {performance} from "perf_hooks"
import {readFileSync} from "fs";
import * as battleground from "./battleground";

eval(readFileSync("dist/battle_sim.js", "utf8"));

type Request_Handler = (body: string) => Request_Result;

const enum Result_Type {
    ok = 0,
    error = 1
}

const enum Right {
    submit_battle_action,
    log_in_with_character,
    attack_a_character,
    participate_in_a_battle,
    submit_movement,
    submit_chat_messages,
    query_battles
}

export interface Player {
    id: number;
    name: string;
    characters: Character[];
    current_character: Character | undefined;
    current_location: XY;
    movement_history: Movement_History_Entry[];
    state: Player_State;
    current_battle_id: number; // TODO maybe we don't want to have current_battle_id in other states, but a union for 1 value? ehh
}

interface Character {
    id: number;
}

const players: Player[] = [];
const token_to_player = new Map<string, Player>();
const steam_id_to_player = new Map<string, Player>();

let player_id_auto_increment = 0;
let character_id_auto_increment = 0;

let test_player: Player | undefined = undefined;

export function get_all_authorized_players() {
    return players;
}

function generate_access_token() {
    return randomBytes(32).toString("hex");
}

function make_new_player(name: string): Player {
    return {
        id: player_id_auto_increment++,
        name: name,
        state: Player_State.not_logged_in,
        characters: [],
        current_character: undefined,
        current_location: xy(0, 0),
        movement_history: [],
        current_battle_id: 0
    }
}

function make_character(): Character {
    return {
        id: character_id_auto_increment++
    }
}

const enum Do_With_Player_Result_Type {
    ok,
    error,
    unauthorized
}

type Do_With_Player_Ok<T> = {
    type: Do_With_Player_Result_Type.ok,
    data: T;
};

type Do_With_Player_Unauthorized = {
    type: Do_With_Player_Result_Type.unauthorized;
}

type Do_With_Player_Error = {
    type: Do_With_Player_Result_Type.error;
}

type Do_With_Player_Result<T> = Do_With_Player_Ok<T> | Do_With_Player_Error | Do_With_Player_Unauthorized;

function try_do_with_player<T>(access_token: string, do_what: (player: Player) => T | undefined): Do_With_Player_Result<T> {
    const player = token_to_player.get(access_token);

    if (!player) {
        return { type: Do_With_Player_Result_Type.unauthorized };
    }

    const data = do_what(player);

    if (data) {
        return { type: Do_With_Player_Result_Type.ok, data: data };
    } else {
        return { type: Do_With_Player_Result_Type.error };
    }
}

function action_on_player_to_result<N, T>(result: Do_With_Player_Result<N>, map?: (data: N) => T): Request_Result {
    switch (result.type) {
        case Do_With_Player_Result_Type.ok: {
            if (map) {
                return make_ok_json<T>(map(result.data));
            } else {
                return make_ok_json<N>(result.data);
            }
        }

        case Do_With_Player_Result_Type.error: {
            return make_error(400);
        }

        case Do_With_Player_Result_Type.unauthorized: {
            return make_error(403);
        }
    }
}

function player_by_id(player_id: number) {
    return players.find(player => player.id == player_id);
}

function create_new_character_for_player(player: Player): Character {
    const new_character = make_character();

    player.characters.push(new_character);

    return new_character;
}

function try_authorize_steam_player_from_dedicated_server(steam_id: string, steam_name: string): [number, string] {
    let player = steam_id_to_player.get(steam_id);

    if (!player) {
       player = make_new_player(steam_name);
       steam_id_to_player.set(steam_id, player);
       players.push(player)
    }

    const token = generate_access_token();
    token_to_player.set(token, player);

    return [player.id, token];
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
    player.state = Player_State.on_global_map;

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

function character_to_json_object(character: Character): Character_Data {
    return {
        id: character.id
    };
}

function player_to_player_state_object(player: Player): Player_State_Data {
    switch (player.state) {
        case Player_State.on_global_map: {
            return {
                state: player.state,
                player_position: {
                    x: player.current_location.x,
                    y: player.current_location.y
                }
            }
        }

        case Player_State.in_battle: {
            const battle = find_battle_by_id(player.current_battle_id);

            if (!battle) {
                throw `Battle ${player.current_battle_id} not found for player ${player.id}`;
            }

            return {
                state: player.state,
                battle_id: player.current_battle_id,
                random_seed: battle.random_seed,
                participants: battle.players.map(player => ({
                    id: player.id,
                    name: player.name,
                    deployment_zone: player.deployment_zone
                })),
                grid_size: {
                    width: battle.grid_size.x,
                    height: battle.grid_size.y
                }
            }
        }

        case Player_State.not_logged_in: {
            return {
                state: player.state
            }
        }

        default: unreachable(player.state);
    }

    return {
        state: player.state,
        player_position: {
            x: player.current_location.x,
            y: player.current_location.y
        }
    }
}

function can_player(player: Player, right: Right) {
    switch (right) {
        case Right.log_in_with_character: {
            return player.state == Player_State.not_logged_in;
        }

        case Right.attack_a_character: {
            return player.state == Player_State.on_global_map;
        }

        case Right.participate_in_a_battle: {
            return player.state == Player_State.on_global_map;
        }

        case Right.submit_movement: {
            return player.state == Player_State.on_global_map;
        }

        case Right.submit_battle_action: {
            return player.state == Player_State.in_battle;
        }

        case Right.submit_chat_messages: {
            return player.state != Player_State.not_logged_in;
        }

        case Right.query_battles: {
            return player.state == Player_State.on_global_map;
        }
    }

    return unreachable(right);
}

function validate_dedicated_server_key(key: string) {
    return true;
}

function initiate_battle_between_players(player_one: Player, player_two: Player) {
    player_one.state = Player_State.in_battle;
    player_two.state = Player_State.in_battle;

    const battle_id = start_battle([
        player_one,
        player_two
    ], battleground.forest());

    player_one.current_battle_id = battle_id;
    player_two.current_battle_id = battle_id;
}

// TODO automatically validate dedicated key on /trusted path
// TODO don't forget that elements in JSON array can be null
handlers.set("/trusted/try_authorize_steam_user", body => {
    const request = JSON.parse(body) as Authorize_Steam_User_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const [player_id, token] = try_authorize_steam_player_from_dedicated_server(request.steam_id, request.steam_user_name);

    return make_ok_json<Authorize_Steam_User_Response>({
        id: player_id,
        token: token
    });
});

export function report_battle_over(battle: Battle, winner_player_id: number) {
    for (const battle_player of battle.players) {
        const player = player_by_id(battle_player.id);

        if (player) {
            player.state = Player_State.on_global_map;

            if (player.id == winner_player_id) {
                submit_chat_message(player, `Battle over! ${player.name} wins`);
            }
        }
    }
}

function take_ai_action(battle: Battle_Record, ai: Battle_Player) {
    function act(action: Turn_Action) {
        try_take_turn_action(battle, ai, action);
    }

    if (ai.hand.length > 0) {
        const random_hero_card = random_in_array(ai.hand.filter(card => card.type == Card_Type.hero));

        if (random_hero_card) {
            const random_unoccupied_position = random_unoccupied_point_in_deployment_zone(battle, ai.deployment_zone);

            if (random_unoccupied_position) {
                act({
                    type: Action_Type.use_hero_card,
                    card_id: random_hero_card.id,
                    at: random_unoccupied_position
                });
            }
        }
    }

    act({
        type: Action_Type.end_turn
    })
}

handlers.set("/get_player_state", body => {
    const request = JSON.parse(body) as Get_Player_State_Request;
    const player_state = try_do_with_player(request.access_token, player_to_player_state_object);

    return action_on_player_to_result(player_state);
});

handlers.set("/get_player_characters", body => {
    const request = JSON.parse(body) as Get_Player_Characters_Request;
    const characters = try_do_with_player(request.access_token, get_player_characters);

    return action_on_player_to_result<Character[], Get_Player_Characters_Response>(characters, characters => characters.map(character_to_json_object));
});

handlers.set("/create_new_character", body => {
    const request = JSON.parse(body) as Create_New_Character_Request;
    const character = try_do_with_player(request.access_token, create_new_character_for_player);

    return action_on_player_to_result<Character, Create_New_Character_Response>(character, character_to_json_object);
});

handlers.set("/login_with_character", body => {
    type Player_With_Character = { player: Player, character: Character };

    const request = JSON.parse(body) as Login_With_Character_Request;
    const result = try_do_with_player<Player_With_Character>(request.access_token, player => {
        if (!can_player(player, Right.log_in_with_character)) {
            return undefined;
        }

        const character = login_with_character(player, request.character_id);

        if (character) {
            return {
                player: player,
                character: character
            }
        }
    });

    return action_on_player_to_result<Player_With_Character, Player_State_Data>(result, result => player_to_player_state_object(result.player));
});

handlers.set("/trusted/submit_player_movement", body => {
    const request = JSON.parse(body) as Submit_Player_Movement_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const ok = try_do_with_player(request.access_token, player => {
        if (!can_player(player, Right.submit_movement)) {
            return;
        }

        player.current_location = xy(request.current_location.x, request.current_location.y);
        player.movement_history = request.movement_history.map(entry => ({
            order_x: entry.order_x,
            order_y: entry.order_y,
            location_x: entry.location_x,
            location_y: entry.location_y
        }));

        if (test_player) {
            test_player.current_location = xy(request.current_location.x + 800, request.current_location.y);
            test_player.movement_history = request.movement_history.map(entry => ({
                order_x: entry.order_x + 800,
                order_y: entry.order_y,
                location_x: entry.location_x + 800,
                location_y: entry.location_y
            }));
        }

        return true;
    });

    return action_on_player_to_result<boolean, Submit_Player_Movement_Response>(ok, () => ({}));
});

// TODO not necessarily has to be trusted, right? It's just a read, though might be a heavy one
handlers.set("/trusted/query_players_movement", body => {
    const request = JSON.parse(body) as Query_Players_Movement_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const player_locations = try_do_with_player<Query_Players_Movement_Response>(request.access_token, requesting_player => {
        if (!can_player(requesting_player, Right.submit_movement)) {
            return;
        }

        const result: Player_Movement_Data[] = [];

        for (const player of players) {
            if (player != requesting_player && can_player(player, Right.submit_movement)) {
                result.push({
                    id: player.id,
                    player_name: player.name,
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
                });
            }
        }

        return result;
    });

    return action_on_player_to_result(player_locations);
});

handlers.set("/trusted/attack_player", body => {
    const request = JSON.parse(body) as Attack_Player_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const player_state = try_do_with_player(request.access_token, player => {
        if (!can_player(player, Right.attack_a_character)) {
            return;
        }

        const other_player = player_by_id(request.target_player_id);

        if (!other_player) {
            return;
        }

        if (!can_player(other_player, Right.participate_in_a_battle)) {
            return;
        }

        initiate_battle_between_players(player, other_player);

        return player_to_player_state_object(player);
    });

    return action_on_player_to_result(player_state);
});

handlers.set("/query_battle_deltas", body => {
    const request = JSON.parse(body) as Query_Deltas_Request;
    const result = try_do_with_player<Query_Deltas_Response>(request.access_token, player => {
        const battle = find_battle_by_id(request.battle_id);

        if (!battle) {
            console.error(`Battle #${request.battle_id} was not found`);
            return;
        }

        return {
            deltas: get_battle_deltas_after(battle, request.since_delta),
        };
    });

    return action_on_player_to_result(result);
});

handlers.set("/take_battle_action", body => {
    const request = JSON.parse(body) as Take_Battle_Action_Request;
    const result = try_do_with_player<Take_Battle_Action_Response>(request.access_token, player => {
        if (!can_player(player, Right.submit_battle_action)) {
            return;
        }

        const battle = find_battle_by_id(player.current_battle_id);

        if (!battle) {
            console.error(`Player ${player.id} is in battle, but battle was not found`);
            return;
        }

        const battle_player = battle.players.find(battle_player => battle_player.id == player.id);

        if (!battle_player) {
            console.error(`Player ${player.id} is in battle, but was not found in the list of players`);
            return;
        }

        const previous_head = battle.deltas.length;
        const deltas = try_take_turn_action(battle, battle_player, request.action);
        const ai = test_player;

        if (ai) {
            const battle_ai = battle.players.find(battle_player => battle_player.id == ai.id);

            if (battle_ai && request.action.type == Action_Type.end_turn && battle.players[battle.turning_player_index].id == ai.id) {
                setTimeout(() => take_ai_action(battle, battle_ai), 1000);
            }
        }

        if (deltas) {
            return {
                deltas: deltas,
                previous_head: previous_head
            }
        }
    });

    return action_on_player_to_result(result);
});

handlers.set("/query_battles", body => {
    const request = JSON.parse(body) as Query_Battles_Request;

    const result = try_do_with_player<Query_Battles_Response>(request.access_token, player => {
        if (!can_player(player, Right.query_battles)) {
            return;
        }

        return {
            battles: get_all_battles().map(battle => ({
                id: battle.id,
                random_seed: battle.random_seed,
                grid_size: {
                    width: battle.grid_size.x,
                    height: battle.grid_size.y
                },
                participants: battle.players.map(player => ({
                    id: player.id,
                    name: player.name,
                    deployment_zone: player.deployment_zone
                }))
            }))
        };
    });

    return action_on_player_to_result(result);
});

handlers.set("/battle_cheat", body => {
    // TODO validate admin profile

    const request = JSON.parse(body) as Battle_Cheat_Command_Request;
    const result = try_do_with_player<true>(request.access_token, player => {
        const battle = find_battle_by_id(player.current_battle_id);

        if (!battle) return;

        cheat(battle, player, request.cheat, request.selected_unit_id);

        return true;
    });

    return action_on_player_to_result(result);
});

handlers.set("/submit_chat_message", body => {
    const request = JSON.parse(body) as Submit_Chat_Message_Request;
    const result = try_do_with_player<Submit_Chat_Message_Response>(request.access_token, player => {
        if (!can_player(player, Right.submit_chat_messages)) {
            return;
        }

        // TODO validate message size

        submit_chat_message(player, request.message);

        return {
            messages: pull_pending_chat_messages_for_player(player)
        }
    });

    return action_on_player_to_result(result);
});

handlers.set("/pull_chat_messages", body => {
    const request = JSON.parse(body) as Pull_Pending_Chat_Messages_Request;
    const result = try_do_with_player<Pull_Pending_Chat_Messages_Response>(request.access_token, player => {
        return {
            messages: pull_pending_chat_messages_for_player(player)
        };
    });

    return action_on_player_to_result(result);
});

handlers.set("/", body => {
    return make_ok_json({
        status: "ok"
    });
});

type Request_Result = Result_Ok | Result_Error;

function make_error(code: number): Result_Error {
    return { type: Result_Type.error, code: code };
}

function make_ok(result: string): Result_Ok {
    return { type: Result_Type.ok, content: result };
}

function make_ok_json<T>(data: T): Result_Ok {
    return make_ok(JSON.stringify(data));
}

function handle_request(url: string, data: string): Request_Result {
    try {
        const handler = handlers.get(url);

        if (handler) {
            const json_data_key = "json_data=";

            if (data.startsWith(json_data_key)) {
                return handler(decodeURIComponent(data.substring(json_data_key.length).replace(/\+/g, "%20")));
            } else {
                return handler(data);
            }
        } else {
            return make_error(404);
        }
    } catch (error) {
        console.log(error);
        console.log(error.stack);

        return make_error(500);
    }
}

export function start_server(with_test_player: boolean) {
    if (with_test_player) {
        test_player = make_new_player("Test guy");
        test_player.state = Player_State.on_global_map;
        test_player.movement_history = [{
            location_x: 0,
            location_y: 0,
            order_x: 0,
            order_y: 0
        }];

        players.push(test_player);

        console.log("Test player enabled");
    }

    const game_html = readFileSync("dist/game.html", "utf8");
    const battle_sim = readFileSync("dist/battle_sim.js", "utf8");
    const web_main = readFileSync("dist/web_main.js", "utf8");

    const server = createServer((req, res) => {
        const url = req.url;
        const time_start = performance.now();

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
            const headers: Record<string, string> = {
                "Access-Control-Allow-Origin": "*"
            };

            if (req.method == "GET") {
                switch (url) {
                    case "/": {
                        res.writeHead(200);
                        res.end(game_html);
                        break;
                    }

                    case "/battle_sim.js": {
                        res.writeHead(200);
                        res.end(battle_sim);

                        break;
                    }

                    case "/web_main.js": {
                        res.writeHead(200);
                        res.end(web_main);
                        break;
                    }

                    default: {
                        res.writeHead(404);
                        res.end("Not found");
                    }
                }

                return;
            }

            if (req.method == "OPTIONS") {
                res.writeHead(200, headers);
                res.end();
                return;
            }

            const handle_start = performance.now();
            const result = handle_request(url, body);
            const handle_time = performance.now() - handle_start;

            switch (result.type) {
                case Result_Type.ok: {
                    headers["Content-Type"] = "text/json";

                    res.writeHead(200, headers);
                    res.end(result.content);
                    break;
                }

                case Result_Type.error: {
                    res.writeHead(result.code, headers);
                    res.end();
                    break;
                }
            }

            const time = performance.now() - time_start;
            console.log(`${url} -> ${result.type == Result_Type.ok ? 'ok' : result.code}, took ${time.toFixed(2)}ms total, handle: ${handle_time.toFixed(2)}ms`)
        });
    }).listen(3638);

    server.on("listening", () => {
        const address = server.address();

        if (typeof address == "object") {
            console.log(`Started at http://${address.address}:${address.port}`)
        }
    });
}