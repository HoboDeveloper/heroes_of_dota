type XYZ = [number, number, number];

$.Msg("TS initialized");

const remote_root = Game.IsInToolsMode() ? "http://127.0.0.1:3638" : "http://cia-is.moe:3638";

function remote_request<T extends Object, N extends Object>(endpoint: string, body: T, callback: (response: N) => void) {
    $.AsyncWebRequest(remote_root + endpoint, {
        type: "POST",
        data: { json_data: JSON.stringify(body) },
        timeout: 10_000,
        success: response => callback(JSON.parse(response))
    });
}

function get_net_table<T>(table_name: string, key: string): T {
    return CustomNetTables.GetTableValue(table_name, key) as T;
}

function particle_at(position: XYZ) {
    const particle = Particles.CreateParticle("particles/ui/square_overlay.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

    Particles.SetParticleControl(particle, 0, position);
    Particles.SetParticleControl(particle, 1, [64, 0, 0]);
    // Particles.SetParticleControl(particle, 2, [255,255,255]);
    Particles.SetParticleControl(particle, 3, [50, 0, 0]);

    $.Schedule(3.0, () => {
        Particles.DestroyParticleEffect(particle, true);
        Particles.ReleaseParticleIndex(particle);
    });
}

function scheduled() {
    $.Schedule(3.0, scheduled);
    $.Msg("GAGA");

    const mouse_position = GameUI.GetCursorPosition();
    const position = GameUI.GetScreenWorldPosition(mouse_position);

    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            particle_at([
                position[0] + i * 128,
                position[1] + j * 128,
                position[2]
            ]);
        }
    }
}

function get_access_token() {
    return get_net_table<Player_Net_Table>("main", "player").token;
}

function add_new_chat_messages(messages: Chat_Message[]) {
    const messages_panel = $("#chat_messages");

    for (let message of messages) {
        const message_panel = $.CreatePanel("Label", messages_panel, "");

        message_panel.text = `${message.from_player_name}: ${message.message}`;
    }

    const children = messages_panel.Children();
    const message_limit = 15;

    if (children.length > message_limit) {
        for (let index = 0; index < children.length - message_limit; index++) {
            children[index].DeleteAsync(0);
        }
    }
}

function periodically_pull_chat_messages() {
    $.Schedule(1.5, periodically_pull_chat_messages);

    const request = {
        access_token: get_access_token()
    };

    remote_request<Pull_Pending_Chat_Messages_Request, Pull_Pending_Chat_Messages_Response>("/pull_chat_messages", request, response => {
        add_new_chat_messages(response.messages);
    });
}

function hack_into_game_chat() {
    function find_chat_top_level_panel() {
        const top_element = $.GetContextPanel().GetParent().GetParent().GetParent();
        const hud = top_element.FindChild("HUDElements");

        hud.FindChild("topbar").FindChild("DayGlow").style.visibility = "collapse";

        return hud.FindChild("HudChat");
    }

    function hide_default_chat_box(hud_chat: Panel) {
        const chat_controls = hud_chat.FindChildTraverse("ChatControls");

        for (const child of hud_chat.FindChildTraverse("ChatMainPanel").Children()) {
            if (child != chat_controls) {
                child.style.visibility = "collapse";
            }
        }
    }

    function register_custom_chat_input_event(chat_input: TextEntry) {
        chat_input.SetPanelEvent(PanelEvent.ON_INPUT_SUBMIT, function() {
            if (chat_input.text === "-ping") {
                Game.ServerCmd("dota_ping");
            } else if (chat_input.text.length > 0) {
                remote_request<Submit_Chat_Message_Request, Submit_Chat_Message_Response>("/submit_chat_message", {
                    access_token: get_access_token(),
                    message: chat_input.text
                }, response => add_new_chat_messages(response.messages));
            }

            chat_input.text = "";

            const time = Game.Time();
            if (Game.Time() - (chat_visible_at || time) > 0.1) {
                $.DispatchEvent("DropInputFocus", chat_input);
                chat_visible_at = undefined;
                return;
            }
        });
    }

    function update_chat_box_visibility_state() {
        const is_visible_now = hud_chat.BHasClass("Active");

        if (!chat_was_visible && is_visible_now) {
            chat_visible_at = Game.Time();
        }

        if (chat_was_visible && !is_visible_now) {
            chat_visible_at = undefined;
        }

        if (chat_was_visible != is_visible_now) {
            // $("#GameChat").SetHasClass("ChatVisible", is_visible_now);
        }

        chat_was_visible = is_visible_now;

        $.Schedule(0, update_chat_box_visibility_state);
    }

    const hud_chat = find_chat_top_level_panel();
    const chat_input = hud_chat.FindChildTraverse("ChatInput") as TextEntry;

    let chat_was_visible = false;
    let chat_visible_at: number | undefined = undefined;

    hide_default_chat_box(hud_chat);
    register_custom_chat_input_event(chat_input);
    update_chat_box_visibility_state();
}

// scheduled();

GameEvents.Subscribe("log_message", event => {
    // $.Msg(event.message);
});


function subscribe_to_net_table_key<T>(table: string, key: string, callback: (data: T) => void){
    const listener = CustomNetTables.SubscribeNetTableListener(table, function(table, table_key, data){
        if (key == table_key){
            if (!data) {
                return;
            }

            callback(data);
        }
    });

    const data = CustomNetTables.GetTableValue(table, key);

    if (data) {
        callback(data);
    }

    return listener;
}

function subscribe_to_debug_message_event() {
    GameEvents.Subscribe("log_chat_debug_message", data => {
        const event = data as Debug_Chat_Message_Event;

        remote_request<Submit_Chat_Message_Request, Submit_Chat_Message_Response>("/submit_chat_message", {
            access_token: get_access_token(),
            message: event.message
        }, response => add_new_chat_messages(response.messages));
    });
}

let chat_initialized = false;

subscribe_to_net_table_key<Player_Net_Table>("main", "player", () => {
    if (!chat_initialized) {
        hack_into_game_chat();
        periodically_pull_chat_messages();
        subscribe_to_debug_message_event();

        chat_initialized = true;
    }
});