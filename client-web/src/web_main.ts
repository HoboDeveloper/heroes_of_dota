type Mouse_State = {
    clicked: boolean
    button: number
    x: number
    y: number
};

type Game_Base = {
    ctx: CanvasRenderingContext2D
    canvas_width: number
    canvas_height: number
    access_token: string
    requested_player_state_at: number
    mouse: Mouse_State
    player_id: number
    any_button_clicked_this_frame: boolean
}

type Game_Not_Logged_In = Game_Base & {
    state: Player_State.not_logged_in
}

type Game_On_Global_Map = Game_Base & {
    state: Player_State.on_global_map
    nearby_players: Player[]
    refreshed_nearby_players_at: number
}

type Game_In_Battle = Game_Base & {
    state: Player_State.in_battle
    battle: Battle
    battle_id: number
    requested_battle_deltas_at: number
    selection: Selection_State
    battle_log: Colored_Line[]
}

type Game = Game_In_Battle | Game_On_Global_Map | Game_Not_Logged_In;

declare const enum Selection_Type {
    none = 0,
    card = 1,
    unit = 2,
    ability = 3
}

type No_Selection = {
    type: Selection_Type.none
}

type Card_Selection = {
    type: Selection_Type.card
    card_id: number
}

type Unit_Selection = {
    type: Selection_Type.unit
    unit_id: number
}

type Ability_Selection = {
    type: Selection_Type.ability
    unit_id: number
    ability_id: Ability_Id
}

type Selection_State = No_Selection | Card_Selection | Unit_Selection | Ability_Selection;

declare const enum Button_State {
    default = 0,
    hovered = 1,
    clicked = 2
}

type Player = {
    id: number
    name: string
}

type Image_Resource = {
    img: HTMLImageElement
    loaded: boolean
}

type Colored_String = {
    color: string
    text: string
}

type Colored_Line = Array<Colored_String>

let game: Game;

const image_cache: Map<string, Image_Resource> = new Map();
const cell_size = 36;
const grid_top_left_x = 120;
const grid_top_left_y = 120;

declare function embed_base64(from_path: string): string;

function image_from_url(url: string): Image_Resource {
    const resource = image_cache.get(url);

    if (resource) {
        return resource;
    }

    const new_resource: Image_Resource = {
        img: new Image(),
        loaded: false
    };

    new_resource.img.onload = () => new_resource.loaded = true;
    new_resource.img.src = url;

    image_cache.set(url, new_resource);

    return new_resource;
}

function rune_image(type: Rune_Type): Image_Resource {
    function rune_type_to_base64_image(): string {
        switch (type) {
            case Rune_Type.haste: return embed_base64("images/rune_haste.png");
            case Rune_Type.bounty: return embed_base64("images/rune_bounty.png");
            case Rune_Type.double_damage: return embed_base64("images/rune_double_damage.png");
            case Rune_Type.regeneration: return embed_base64("images/rune_regeneration.png");
        }
    }

    return image_from_url(`data:image/png;base64,${rune_type_to_base64_image()}`)
}

async function api_request<Request, Response>(path: string, data: Request): Promise<Response> {
    const response = await fetch("http://127.0.0.1:3638" + path, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "same-origin",
        redirect: "follow",
        referrer: "no-referrer",
        body: JSON.stringify(data),
    });

    return await response.json() as Response;
}

async function take_battle_action(game: Game_In_Battle, action: Turn_Action) {
    const request = {
        access_token: game.access_token,
        action: action
    };

    const response = await api_request<Take_Battle_Action_Request, Take_Battle_Action_Response>("/take_battle_action", request);

    receive_battle_deltas(game, response.previous_head, response.deltas);
}

function contains(x: number, y: number, sx: number, sy: number, width: number, height: number) {
    return x >= sx && y >= sy && x < sx + width && y < sy + height;
}

function on_player_clicked(state: Game, player: Player) {
    api_request<Attack_Player_Request, Attack_Player_Response>("/trusted/attack_player", {
        dedicated_server_key: "",
        access_token: state.access_token,
        target_player_id: player.id
    });
}

function button_behavior(top_left_x: number, top_left_y: number, width: number, height: number): Button_State {
    const hovered = contains(game.mouse.x, game.mouse.y, top_left_x, top_left_y, width, height);

    if (hovered) {
        if (was_button_clicked(0)) {
            game.any_button_clicked_this_frame = true;

            return Button_State.clicked;
        } else {
            return Button_State.hovered;
        }
    }

    return Button_State.default;
}

function do_button(text: string, top_left_x: number, top_left_y: number, font_size_px: number, padding: number): Button_State {
    const ctx = game.ctx;

    ctx.font = `${font_size_px}px Open Sans`;

    const text_width = ctx.measureText(text).width;
    const button_width = padding + text_width + padding;
    const button_height = padding + font_size_px + padding;

    const state = button_behavior(top_left_x, top_left_y, button_width, button_height);

    ctx.fillStyle = state == Button_State.hovered ? "#a4c7c2" : "#d0d0d0";
    ctx.fillRect(top_left_x, top_left_y, button_width, button_height);

    ctx.fillStyle = "black";
    ctx.fillText(text, top_left_x + padding, top_left_y + padding + font_size_px / 2);

    return state;
}

function button(text: string, top_left_x: number, top_left_y: number, font_size_px: number, padding: number): boolean {
    return do_button(text, top_left_x, top_left_y, font_size_px, padding) == Button_State.clicked;
}

function draw_player_list(game: Game_On_Global_Map) {
    const font_size_px = 18;
    const padding = 8;
    const margin = 4;

    let height_offset = 0;

    for (const player of game.nearby_players) {
        const top_left_x = 30, top_left_y = 70 + height_offset;

        if (button(player.name, top_left_x, top_left_y, font_size_px, padding)) {
            on_player_clicked(game, player);
        }

        height_offset += margin + padding + font_size_px + padding + margin;
    }
}

function drop_selection(game: Game_In_Battle) {
    game.selection = { type: Selection_Type.none };
}

function was_button_clicked(button: number) {
    return game.mouse.button == button && game.mouse.clicked;
}

function draw_header(game: Game) {
    const ctx = game.ctx;
    const font_size_px = 20;

    ctx.font = `${font_size_px}px Open Sans`;
    ctx.fillStyle = "black";
    ctx.fillText(enum_to_string(game.state), 30, 30);
}

async function check_and_try_refresh_nearby_players(game: Game_On_Global_Map, time: number) {
    if (time - game.refreshed_nearby_players_at < 1000) {
        return;
    }

    game.refreshed_nearby_players_at = time;

    const response = await api_request<Query_Players_Movement_Request, Query_Players_Movement_Response>("/trusted/query_players_movement", {
        dedicated_server_key: "",
        access_token: game.access_token
    });

    game.nearby_players = response.map(player => {
        return {
            id: player.id,
            name: player.player_name
        }
    });
}

async function check_and_try_request_player_state(state: Game, time: number) {
    if (time - state.requested_player_state_at < 1000) {
        return
    }

    state.requested_player_state_at = time;

    const player_data = await api_request<Get_Player_State_Request, Player_State_Data>("/get_player_state", {
        access_token: state.access_token
    });

    if (player_data.state != game.state) {
        game = game_from_state(player_data, game);
    }
}

async function check_and_try_request_battle_deltas(game: Game_In_Battle, time: number) {
    if (time - game.requested_battle_deltas_at < 1000) {
        return;
    }

    const head_before = game.battle.delta_head;
    const request: Query_Deltas_Request = {
        access_token: game.access_token,
        battle_id: game.battle_id,
        since_delta: head_before
    };

    game.requested_battle_deltas_at = time;

    const response = await api_request<Query_Deltas_Request, Query_Deltas_Response>("/query_battle_deltas", request);

    receive_battle_deltas(game, head_before, response.deltas);
}

function receive_battle_deltas(game: Game_In_Battle, head_before_merge: number, deltas: Delta[]) {
    const battle = game.battle;

    if (deltas.length == 0) {
        return;
    }

    console.log(`Received ${deltas.length} new deltas`);

    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    for (; battle.delta_head < battle.deltas.length; battle.delta_head++) {
        const delta = battle.deltas[battle.delta_head];

        if (!delta) {
            break;
        }

        const line = delta_to_colored_line(game, delta);

        if (line) {
            game.battle_log.push(line);
        } else {
            console.log(`Delta (${enum_to_string(delta.type)}) is not supported for battle log`, delta);
        }

        collapse_delta(battle, delta);
    }
}

function on_cell_right_clicked(game: Game_In_Battle, player: Battle_Player, x: number, y: number) {
    switch (game.selection.type) {
        case Selection_Type.card: {
            const zone = player.deployment_zone;

            if (x < zone.max_x && x >= zone.min_x && y < zone.max_y && y >= zone.min_y) {
                take_battle_action(game, {
                    type: Action_Type.use_hero_card,
                    at: {x: x, y: y},
                    card_id: game.selection.card_id
                })
            }

            break;
        }

        case Selection_Type.unit: {
            const selected_unit = find_unit_by_id(game.battle, game.selection.unit_id);
            const right_clicked_unit = unit_at(game.battle, xy(x, y));
            const right_clicked_rune = rune_at(game.battle, xy(x, y));

            if (!selected_unit) {
                break;
            }

            if (right_clicked_unit) {
                if (selected_unit.attack.type == Ability_Type.target_ground) {
                    if (ability_targeting_fits(selected_unit.attack.targeting, selected_unit.position, xy(x, y))) {
                        take_battle_action(game, {
                            type: Action_Type.ground_target_ability,
                            unit_id: selected_unit.id,
                            ability_id: selected_unit.attack.id,
                            to: xy(x, y)
                        });
                    }
                }
            } else if (right_clicked_rune) {
                const [can_go] = can_find_path(game.battle, selected_unit.position, xy(x, y), selected_unit.move_points, true);

                if (can_go) {
                    take_battle_action(game, {
                        type: Action_Type.pick_up_rune,
                        unit_id: selected_unit.id,
                        rune_id: right_clicked_rune.id
                    });
                }
            } else {
                const [can_go] = can_find_path(game.battle, selected_unit.position, xy(x, y), selected_unit.move_points);

                if (can_go) {
                    take_battle_action(game, {
                        type: Action_Type.move,
                        unit_id: selected_unit.id,
                        to: xy(x, y)
                    });
                }
            }

            break;
        }
    }
}

function is_unit_selection(selection: Selection_State): selection is (Unit_Selection | Ability_Selection) {
    return selection.type == Selection_Type.unit || selection.type == Selection_Type.ability;
}

function on_cell_selected(game: Game_In_Battle, player: Battle_Player, x: number, y: number) {
    const unit_in_cell = unit_at(game.battle, xy(x, y));

    if (game.selection.type == Selection_Type.ability) {
        const selected = find_unit_by_id(game.battle, game.selection.unit_id);

        if (selected) {
            const ability = find_unit_ability(selected, game.selection.ability_id);

            if (ability && (ability.type == Ability_Type.target_unit || ability.type == Ability_Type.target_ground)) {
                const can_be_cast = ability_targeting_fits(ability.targeting, selected.position, xy(x, y));

                if (ability.type == Ability_Type.target_unit && unit_in_cell && can_be_cast) {
                    take_battle_action(game, {
                        type: Action_Type.unit_target_ability,
                        ability_id: ability.id,
                        unit_id: selected.id,
                        target_id: unit_in_cell.id
                    });

                    game.selection = {
                        type: Selection_Type.unit,
                        unit_id: selected.id
                    };
                }

                if (ability.type == Ability_Type.target_ground && can_be_cast) {
                    take_battle_action(game, {
                        type: Action_Type.ground_target_ability,
                        ability_id: ability.id,
                        unit_id: selected.id,
                        to: xy(x, y)
                    });

                    game.selection = {
                        type: Selection_Type.unit,
                        unit_id: selected.id
                    };
                }

                return;
            }
        }
    }

    if (unit_in_cell) {
        game.selection = {
            type: Selection_Type.unit,
            unit_id: unit_in_cell.id
        }
    } else {
        drop_selection(game);
    }
}

function get_hero_name(type: Unit_Type): string {
    switch (type) {
        default: return enum_to_string(type);
    }
}

function highlight_cells_unit_can_go_to(battle: Battle, unit: Unit) {
    const xy = unit.position;
    const min_x = Math.max(0, xy.x - unit.move_points);
    const min_y = Math.max(0, xy.y - unit.move_points);
    const max_x = Math.max(battle.grid_size.x, xy.x + unit.move_points);
    const max_y = Math.max(battle.grid_size.y, xy.y + unit.move_points);

    for (let x = min_x; x < max_x; x++) {
        for (let y = min_y; y < max_y; y++) {
            const [can_go] = can_find_path(battle, xy, {x: x, y: y}, unit.move_points);

            if (can_go) {
                game.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                game.ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
            }
        }
    }
}

function highlight_cells_for_ability(battle: Battle, unit: Unit, ability: Ability_Active) {
    for (let x = 0; x < battle.grid_size.x; x++) {
        for (let y = 0; y < battle.grid_size.y; y++) {
            if (ability_targeting_fits(ability.targeting, unit.position, xy(x, y))) {
                game.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                game.ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
            }
        }
    }
}

function highlight_cells_for_ability_selector(battle: Battle, from_position: XY, to_position: XY, selector: Ability_Target_Selector) {
    for (let x = 0; x < battle.grid_size.x; x++) {
        for (let y = 0; y < battle.grid_size.y; y++) {
            if (ability_selector_fits(selector, from_position, to_position, xy(x, y))) {
                game.ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
                game.ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
            }
        }
    }
}

namespace clr {
    export function txt(text: string, color: string): Colored_String {
        return {
            text: text,
            color: color
        }
    }

    export function plain(text: string): Colored_String {
        return {
            text: text,
            color: "black"
        }
    }

    export function player_color(player_id: number) {
        return game.player_id == player_id ? "rgba(0, 255, 0, 0.8)" : "rgba(255, 0, 0, 0.8)";
    }

    export function player_name_by_id(battle: Battle, player_id: number) {
        const player = find_player_by_id(battle, player_id);

        if (!player) {
            return plain("ERROR");
        }

        return player_name(player);
    }

    export function player_name(player: Battle_Player) {
        return txt(player.name, player_color(player.id))
    }

    export function unit_name_by_type(type: Unit_Type, player_id: number) {
        return txt(enum_to_string(type), player_color(player_id))
    }

    export function unit_name(unit: Unit) {
        return unit_name_by_type(unit.type, unit.owner_player_id);
    }

    export function ability_name(ability: Ability) {
        return txt(enum_to_string(ability.id), "gray");
    }

    export function card_name(card: Card) {
        switch (card.type) {
            case Card_Type.hero: return txt(enum_to_string(card.unit_type), "gray");
        }

        return plain("Unknown");
    }

}

function delta_to_colored_line(game: Game_In_Battle, delta: Delta): Colored_Line | undefined {
    switch (delta.type) {
        case Delta_Type.draw_card: {
            const player = find_player_by_id(game.battle, delta.player_id);

            if (!player) break;

            return [
                clr.player_name_by_id(game.battle, player.id),
                clr.plain(" draws "),
                clr.card_name(delta.card)
            ]
        }

        case Delta_Type.use_card: {
            const player = find_player_by_id(game.battle, delta.player_id);

            if (!player) break;

            const card = find_player_card_by_id(player, delta.card_id);

            if (!card) break;

            switch (card.type) {
                case Card_Type.hero: return [
                    clr.player_name(player),
                    clr.plain(" summons "),
                    clr.unit_name_by_type(card.unit_type, delta.player_id)
                ];

                default: break;
            }

            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            return [
                clr.unit_name(unit),
                clr.plain(` moves ${delta.move_cost} steps`)
            ]
        }

        case Delta_Type.use_unit_target_ability: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);
            const target = find_unit_by_id(game.battle, delta.target_unit_id);

            if (!unit) break;
            if (!target) break;

            const ability = find_unit_ability(unit, delta.ability_id);

            if (!ability) break;

            return [
                clr.unit_name(unit),
                clr.plain(" uses "),
                clr.ability_name(ability),
                clr.plain(" on "),
                clr.unit_name(target)
            ]
        }

        case Delta_Type.use_no_target_ability:
        case Delta_Type.use_ground_target_ability: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            const ability = find_unit_ability(unit, delta.ability_id);

            if (!ability) break;

            return [
                clr.unit_name(unit),
                clr.plain(" uses "),
                clr.ability_name(ability)
            ]
        }

        case Delta_Type.ability_effect_applied: {
            const id: Ability_Id = delta.effect.ability_id;

            return [
                clr.txt(enum_to_string(id), "gray"),
                clr.plain(" triggers")
            ]
        }

        case Delta_Type.end_turn: {
            return [
                clr.txt("Next turn", "gray")
            ]
        }

        case Delta_Type.level_change: {
            const unit = find_unit_by_id(game.battle, delta.unit_id);

            if (!unit) break;

            return [
                clr.unit_name(unit),
                clr.plain(" is now level "),
                clr.txt(delta.new_level.toString(), "gray")
            ]
        }

        case Delta_Type.modifier_removed: {
            for (const unit of game.battle.units) {
                for (const modifier of unit.modifiers) {
                    if (modifier.handle_id == delta.modifier_handle_id) {
                        return [
                            clr.unit_name(unit),
                            clr.plain(" loses "),
                            clr.txt(enum_to_string(modifier.id), "gray"),
                            clr.plain(" modifier")
                        ];
                    }
                }
            }

            break;
        }

        /* TODO repurpose this for modifiers
        case Delta_Type.unit_field_change: {
            const source = find_unit_by_id(game.battle, delta.source_unit_id);
            const target = find_unit_by_id(game.battle, delta.target_unit_id);

            if (!source) break;
            if (!target) break;

            function delta_string(value: number) {
                if (value >= 0) {
                    return `+${value}`;
                } else {
                    return `${value}`;
                }
            }

            if (source == target) {
                return [
                    clr.unit_name(source),
                    clr.plain("'s "),
                    clr.txt(enum_to_string(delta.field), "gray"),
                    clr.plain(" changes to "),
                    clr.txt(delta.new_value.toString(), "gray"),
                    clr.plain(` (${delta_string(delta.value_delta)})`)
                ]
            } else {
                return [
                    clr.unit_name(source),
                    clr.plain(" changes "),
                    clr.unit_name(target),
                    clr.plain("'s "),
                    clr.txt(enum_to_string(delta.field), "gray"),
                    clr.plain(" to "),
                    clr.txt(delta.new_value.toString(), "gray"),
                    clr.plain(` (${delta_string(delta.value_delta)})`)
                ]
            }
        }*/
    }

    return undefined;
}

function draw_battle_log(game: Game_In_Battle) {
    const ctx = game.ctx;
    const lines = game.battle_log;

    const how_many_lines_to_show = 20;
    const starting_index = Math.max(lines.length - how_many_lines_to_show, 0);

    const font_height = 16;

    const starting_x = 120 + game.battle.grid_size.x * cell_size + 180;

    let cursor_x = starting_x;
    let cursor_y = grid_top_left_y;

    ctx.font = `${font_height}px Open Sans`;

    for (let index = 0; index < how_many_lines_to_show && index < lines.length; index++) {
        const line = lines[starting_index + index];

        for (const string of line) {
            const width = ctx.measureText(string.text).width;

            ctx.fillStyle = string.color;
            ctx.fillText(string.text, cursor_x, cursor_y);

            cursor_x += width;
        }

        cursor_x = starting_x;
        cursor_y += font_height + 4;
    }
}

function draw_grid(game: Game_In_Battle, player: Battle_Player, highlight_occupied: boolean) {
    const ctx = game.ctx;

    const grid_size = game.battle.grid_size;

    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.translate(grid_top_left_x, grid_top_left_y);
    ctx.beginPath();

    for (let x = 0; x <= grid_size.x; x++) {
        ctx.moveTo(x * cell_size, 0);
        ctx.lineTo(x * cell_size, grid_size.y * cell_size);
    }

    for (let y = 0; y <= grid_size.y; y++) {
        ctx.moveTo(0, y * cell_size);
        ctx.lineTo(grid_size.x * cell_size, y * cell_size);
    }

    ctx.stroke();

    if (game.selection.type == Selection_Type.card) {
        const zone = player.deployment_zone;

        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.strokeRect(
            zone.min_x * cell_size,
            zone.min_y * cell_size,
            (zone.max_x - zone.min_x) * cell_size,
            (zone.max_y - zone.min_y) * cell_size
        );
    }

    let hovered_cell: XY | undefined;

    for (let x = 0; x < grid_size.x; x++) {
        for (let y = 0; y < grid_size.y; y++) {
            const hovered = contains(
                game.mouse.x,
                game.mouse.y,
                grid_top_left_x + x * cell_size,
                grid_top_left_y + y * cell_size,
                cell_size,
                cell_size
            );

            if (hovered) {
                if (was_button_clicked(0)) {
                    on_cell_selected(game, player, x, y);

                    game.any_button_clicked_this_frame = true;
                } else if (was_button_clicked(2)) {
                    on_cell_right_clicked(game, player, x, y);

                    game.any_button_clicked_this_frame = true;
                } else {
                    ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
                    ctx.fillRect(x * cell_size, y * cell_size, cell_size, cell_size);
                }

                hovered_cell = xy(x, y);
            }
        }
    }

    ctx.fillStyle = "black";

    const icon_size = cell_size * 0.75;
    const icon_offset = (cell_size - icon_size) / 2;

    for (const unit of game.battle.units) {
        if (unit.dead) continue;

        const xy = unit.position;

        if (is_unit_selection(game.selection) && game.selection.unit_id == unit.id) {
            ctx.strokeStyle = "green";
            ctx.lineWidth = 4;
            ctx.strokeRect(xy.x * cell_size, xy.y * cell_size, cell_size, cell_size);

            if (!highlight_occupied) {
                if (game.selection.type == Selection_Type.ability) {
                    const ability_id = game.selection.ability_id;
                    const ability = find_unit_ability(unit, ability_id);

                    if (ability && ability.type != Ability_Type.passive) {
                        if (ability.type == Ability_Type.target_unit || ability.type == Ability_Type.target_ground) {
                            if (hovered_cell && ability_targeting_fits(ability.targeting, unit.position, hovered_cell)) {
                                highlight_cells_for_ability_selector(game.battle, unit.position, hovered_cell, ability.targeting.selector);
                            } else {
                                highlight_cells_for_ability(game.battle, unit, ability);
                            }
                        } else {
                            highlight_cells_for_ability(game.battle, unit, ability);
                        }
                    }
                } else {
                    if (!unit.has_taken_an_action_this_turn) {
                        highlight_cells_unit_can_go_to(game.battle, unit);
                    }
                }
            }
        }

        const ally = unit.owner_player_id == game.player_id;

        if (ally) {
            if (unit.has_taken_an_action_this_turn) {
                ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
            } else {
                ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
            }
        } else {
            ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
        }

        ctx.fillRect(xy.x * cell_size, xy.y * cell_size, cell_size, cell_size);

        const image = image_from_url(`http://cdn.dota2.com/apps/dota2/images/heroes/${get_hero_name(unit.type)}_icon.png`);

        if (image.loaded) {
            ctx.drawImage(
                image.img,
                0, 0,
                image.img.width, image.img.height,
                xy.x * cell_size + icon_offset,
                xy.y * cell_size + icon_offset,
                icon_size,
                icon_size
            );
        }

        const text = unit.health.toString();
        const shadow_color = ally ? "rgb(17, 162, 0)" : "#aa0000aa";

        // Health
        {
            ctx.font = "12px Open Sans";
            ctx.lineWidth = 2;
            ctx.strokeStyle = shadow_color;
            ctx.shadowColor = shadow_color;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowBlur = 4;
            ctx.strokeText(text, xy.x * cell_size, xy.y * cell_size);

            ctx.shadowBlur = 0;
            ctx.fillStyle = "#fff";
            ctx.fillText(text, xy.x * cell_size, xy.y * cell_size);
        }

        // Level
        {
            for (let index = 0; index < unit.level; index++) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "black";
                ctx.shadowColor = "black";
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 4;

                const radius = 3;

                const pip_x = xy.x * cell_size + index * radius + 2;
                const pip_y = xy.y * cell_size + cell_size;

                ctx.beginPath();
                ctx.arc(pip_x, pip_y, radius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.fillStyle = "yellow";

                ctx.beginPath();
                ctx.arc(pip_x, pip_y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    for (const rune of game.battle.runes) {
        const image = rune_image(rune.type);
        const xy = rune.position;

        if (is_unit_selection(game.selection)) {
            const unit = find_unit_by_id(game.battle, game.selection.unit_id);

            if (unit) {
                const [can_go] = can_find_path(game.battle, unit.position, xy, unit.move_points, true);

                if (can_go) {
                    game.ctx.fillStyle = "rgba(0, 255, 0, 0.1)";
                    game.ctx.fillRect(xy.x * cell_size, xy.y * cell_size, cell_size, cell_size);
                }
            }
        }

        if (image.loaded) {
            ctx.drawImage(
                image.img,
                0, 0,
                image.img.width, image.img.height,
                xy.x * cell_size + icon_offset,
                xy.y * cell_size + icon_offset,
                icon_size,
                icon_size
            );
        }
    }

    for (const shop of game.battle.shops) {
        const image = image_from_url(`data:image/png;base64,${embed_base64("images/shop.png")}`);

        if (image.loaded) {
            ctx.drawImage(
                image.img,
                0, 0,
                image.img.width, image.img.height,
                shop.position.x * cell_size + icon_offset,
                shop.position.y * cell_size + icon_offset,
                icon_size,
                icon_size
            );
        }
    }

    ctx.translate(-grid_top_left_x, -grid_top_left_y);
}

function draw_card_list(game: Game_In_Battle, player: Battle_Player) {
    for (let index = 0; index < player.hand.length; index++) {
        const card = player.hand[index];

        const top_left_x = 30;
        const top_left_y = 180 + index * 34;

        if (card.type == Card_Type.hero) {
            if (button(enum_to_string(card.unit_type), top_left_x, top_left_y, 18, 6)) {
                game.selection = {
                    type: Selection_Type.card,
                    card_id: card.id
                }
            }
        }

        if (game.selection.type == Selection_Type.card && game.selection.card_id == card.id) {
            const ctx = game.ctx;

            ctx.strokeStyle = "green";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(top_left_x, top_left_y);
            ctx.lineTo(top_left_x, top_left_y + 30);
            ctx.stroke();
        }
    }
}

function draw_ability_list(game: Game_In_Battle, unit: Unit): boolean {
    const top_left_x = 120 + game.battle.grid_size.x * cell_size + 30;

    let ability_highlighted = false;

    for (let index = 0; index < unit.abilities.length; index++) {
        const ability = unit.abilities[index];
        const needs_targeting = ability.type == Ability_Type.target_ground || ability.type == Ability_Type.target_unit;
        const top_left_y = 120 + index * 34;

        const ability_name = enum_to_string(ability.id);
        const button_text = ability.type != Ability_Type.passive ? `${ability_name} (${ability.charges_remaining})` : ability_name;

        const state = do_button(button_text, top_left_x, top_left_y, 14, 6);

        if (state == Button_State.clicked) {
            if (needs_targeting) {
                game.selection = {
                    type: Selection_Type.ability,
                    unit_id: unit.id,
                    ability_id: ability.id
                }
            } else if (ability.type == Ability_Type.no_target) {
                take_battle_action(game, {
                    type: Action_Type.use_no_target_ability,
                    unit_id: unit.id,
                    ability_id: ability.id
                });
            }
        } else if (state == Button_State.hovered) {
            if (ability.type != Ability_Type.passive) {
                game.ctx.translate(grid_top_left_x, grid_top_left_y);
                highlight_cells_for_ability(game.battle, unit, ability);
                game.ctx.translate(-grid_top_left_x, -grid_top_left_y);

                ability_highlighted = true;
            }
        }

        if (game.selection.type == Selection_Type.ability && game.selection.ability_id == ability.id) {
            const ctx = game.ctx;

            ctx.strokeStyle = "green";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(top_left_x, top_left_y);
            ctx.lineTo(top_left_x, top_left_y + 30);
            ctx.stroke();
        }
    }

    return ability_highlighted;
}

function do_one_frame(time: number) {
    const ctx = game.ctx;

    ctx.clearRect(0, 0, game.canvas_width, game.canvas_height);
    ctx.textBaseline = "middle";

    draw_header(game);

    switch (game.state) {
        case Player_State.on_global_map: {
            draw_player_list(game);

            check_and_try_refresh_nearby_players(game, time);

            break;
        }

        case Player_State.in_battle: {
            const this_player = find_player_by_id(game.battle, game.player_id);

            if (!this_player) {
                break;
            }

            let ability_was_highlighted = false;

            if (is_unit_selection(game.selection)) {
                const selected_unit = find_unit_by_id(game.battle, game.selection.unit_id);

                if (selected_unit) {
                    if (draw_ability_list(game, selected_unit)) {
                        ability_was_highlighted = true;
                    }
                }
            }

            draw_grid(game, this_player, ability_was_highlighted);

            if (button("End turn", 30, 120, 18, 6)) {
                take_battle_action(game, {
                    type: Action_Type.end_turn
                });

                drop_selection(game);
            }

            draw_card_list(game, this_player);
            draw_battle_log(game);

            if (was_button_clicked(0) && !game.any_button_clicked_this_frame) {
                drop_selection(game);
            }

            check_and_try_request_battle_deltas(game, time);

            break;
        }

        case Player_State.not_logged_in: {
            break;
        }
    }

    check_and_try_request_player_state(game, time);

    game.mouse.clicked = false;
    game.any_button_clicked_this_frame = false;
}

function start_animation_frame_loop(time: number) {
    requestAnimationFrame(time => start_animation_frame_loop(time));

    do_one_frame(time);
}

function fix_canvas_dpi_scale(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    const width = canvas.width;
    const height = canvas.height;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const backingStoreRatio = 1; //context.backingStorePixelRatio || 1
    const ratio = devicePixelRatio / backingStoreRatio;

    if (devicePixelRatio !== backingStoreRatio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;

        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    } else {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = '';
        canvas.style.height = '';
    }

    context.scale(ratio, ratio);
}

function game_from_state(player_state: Player_State_Data, game_base: Game_Base): Game {
    switch (player_state.state) {
        case Player_State.in_battle: {
            const battle_log: Colored_Line[] = [];
            const battle = {
                ...make_battle(player_state.participants, player_state.grid_size.width, player_state.grid_size.height),
                change_health: (battle: Battle, source: Unit, target: Unit, change: Health_Change) => {
                    if (change.value_delta > 0) {
                        battle_log.push([
                            clr.unit_name(source),
                            clr.plain(" restores "),
                            clr.txt(change.value_delta.toString(), "gray"),
                            clr.plain(" health to "),
                            clr.unit_name(target)
                        ]);
                    } else if (change.value_delta < 0) {
                        battle_log.push([
                            clr.unit_name(target),
                            clr.plain(" takes "),
                            clr.txt((-change.value_delta).toString(), "gray"),
                            clr.plain(" damage from "),
                            clr.unit_name(source)
                        ]);
                    }

                    const died = change_health_default(battle, source, target, change);

                    if (died) {
                        battle_log.push([
                            clr.unit_name(target),
                            clr.plain(" dies")
                        ]);
                    }

                    return died;
                },
                apply_modifier: (source: Unit, target: Unit, modifier: Modifier_Application) => {
                    apply_modifier_default(source, target, modifier);

                    const lines = [
                        clr.unit_name(source),
                        clr.plain(" applies "),
                        clr.txt(enum_to_string(modifier.modifier_id), "gray"),
                        clr.plain(" to "),
                        clr.unit_name(target)
                    ];

                    if (modifier.duration) {
                        lines.push(
                            clr.plain(" for "),
                            clr.txt(modifier.duration.toString(), "gray"),
                            clr.plain(" turns")
                        );
                    }

                    battle_log.push(lines);
                }
            };

            fill_grid(battle);

            return {
                ...game_base,
                state: player_state.state,
                requested_battle_deltas_at: 0,
                battle: battle,
                battle_id: player_state.battle_id,
                selection: { type: Selection_Type.none },
                battle_log: battle_log
            };
        }

        case Player_State.on_global_map: {
            return {
                ...game_base,
                state: player_state.state,
                nearby_players: [],
                refreshed_nearby_players_at: 0
            };
        }

        case Player_State.not_logged_in: {
            return {
                ...game_base,
                state: player_state.state
            };
        }
    }
}

async function start_game() {
    const canvas_element = document.getElementById("canvas");

    if (!canvas_element) {
        throw "Canvas not found";
    }

    const canvas = (canvas_element as HTMLCanvasElement);
    const context = canvas.getContext("2d");

    if (!context) {
        throw "Unable to create draw context";
    }

    fix_canvas_dpi_scale(canvas, context);

    const auth = await api_request<Authorize_Steam_User_Request, Authorize_Steam_User_Response>("/trusted/try_authorize_steam_user", {
        dedicated_server_key: "",
        steam_id: "3637",
        steam_user_name: "Mister Guy"
    });

    const player_state = await api_request<Get_Player_State_Request, Player_State_Data>("/get_player_state", {
        access_token: auth.token
    });

    if (player_state.state == Player_State.not_logged_in) {
        const characters = await api_request<Get_Player_Characters_Request, Get_Player_Characters_Response>("/get_player_characters", {
            access_token: auth.token
        });

        let selected_character = characters[0];

        if (!selected_character) {
            selected_character = await api_request<Create_New_Character_Request, Create_New_Character_Response>("/create_new_character", {
                access_token: auth.token
            });
        }

        await api_request<Login_With_Character_Request, Login_With_Character_Response>("/login_with_character", {
            access_token: auth.token,
            character_id: selected_character.id
        });
    }

    game = game_from_state(player_state, {
        canvas_width: canvas.width,
        canvas_height: canvas.height,
        ctx: context,
        access_token: auth.token,
        requested_player_state_at: 0,
        any_button_clicked_this_frame: false,
        mouse: {
            x: 0,
            y: 0,
            button: 0,
            clicked: false
        },
        player_id: auth.id
    });

    const cursor_position_on_canvas = (event: MouseEvent) => {
        const transform = context.getTransform().inverse();

        const rect = canvas.getBoundingClientRect();
        const scale_x = canvas.width / rect.width;
        const scale_y = canvas.height / rect.height;

        return transform.transformPoint({
            x: (event.clientX - rect.left) * scale_x,
            y: (event.clientY - rect.top) * scale_y
        });
    };

    canvas.addEventListener("mousedown", event => {
        const real_position = cursor_position_on_canvas(event);

        game.mouse = {
            clicked: true,
            x: real_position.x,
            y: real_position.y,
            button: event.button
        };
    });

    canvas.addEventListener("mousemove", event => {
        const real_position = cursor_position_on_canvas(event);

        game.mouse.x = real_position.x;
        game.mouse.y = real_position.y;
    });

    canvas.addEventListener("contextmenu", event => event.preventDefault());

    start_animation_frame_loop(0);
}