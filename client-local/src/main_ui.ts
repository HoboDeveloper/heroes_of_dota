type XYZ = [number, number, number];

$.Msg("TS initialized");

const remote_root = Game.IsInToolsMode() ? "http://127.0.0.1:3638" : "http://cia-is.moe:3638";

function remote_request<T extends Object, N extends Object>(endpoint: string, body: T, callback: (response: N) => void) {
    $.AsyncWebRequest(remote_root + endpoint, {
        type: "POST",
        data: { json_data: JSON.stringify(body) },
        timeout: 10000,
        success: response => callback(JSON.parse(response))
    });
}

function fire_event<T extends Object>(event_name: string, data: T) {
    GameEvents.SendCustomGameEventToServer(event_name, data);
}

function get_net_table<T>(table_name: string, key: string): T {
    return CustomNetTables.GetTableValue(table_name, key) as T;
}

function get_access_token() {
    const net_table = get_net_table<Player_Net_Table>("main", "player");

    if (net_table.state == Player_State.not_logged_in) {
        return "";
    }

    return net_table.token;
}

function get_visualiser_delta_head(): number | undefined {
    const net_table = get_net_table<Player_Net_Table>("main", "player");

    if (net_table.state == Player_State.in_battle) {
        return net_table.battle.current_visual_head;
    }

    return undefined;
}

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

if (!Array.prototype.find) {
    // @ts-ignore
    Array.prototype.find = function <T>(predicate: (element: T) => boolean): T | undefined {
        for (const element of this) {
            if (predicate(element)) {
                return element;
            }
        }

        return undefined;
    };
}

if (!Array.prototype.findIndex) {
    // @ts-ignore
    Array.prototype.findIndex = function <T>(predicate: (element: T) => boolean): number | undefined {
        for (let index = 0; index < this.length; index++) {
            if (predicate(this[index])) {
                return index;
            }
        }

        return undefined;
    };
}

function from_server_array<T>(array: Array<T>): Array<T> {
    const result: Array<T> = [];

    for (const index in array) {
        result[parseInt(index) - 1] = array[index];
    }

    return result;
}

interface Temporary_Storage_Panel extends Panel {
    temporary_particles: ParticleId[] | undefined;
}

function register_particle_for_reload(particle: ParticleId) {
    if (!Game.IsInToolsMode()) {
        return;
    }

    const storage = $.GetContextPanel() as Temporary_Storage_Panel;

    let array: ParticleId[] | undefined = storage.temporary_particles;

    if (!array) {
        array = [];
        storage.temporary_particles = array;
    }

    array.push(particle);
}

function clean_up_particles_after_reload() {
    if (!Game.IsInToolsMode()) {
        return;
    }

    const storage = $.GetContextPanel() as Temporary_Storage_Panel;

    if (storage.temporary_particles) {
        for (const particle of storage.temporary_particles) {
            Particles.DestroyParticleEffect(particle, true);
            Particles.ReleaseParticleIndex(particle);
        }

        $.Msg(`Cleaned up ${storage.temporary_particles.length} temporary particles`);

        storage.temporary_particles = [];
    }
}

// scheduled();

GameEvents.Subscribe("log_message", event => {
    // $.Msg(event.message);
});

function hide_default_ui() {
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_TIMEOFDAY, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_HEROES, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_FLYOUT_SCOREBOARD, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ACTION_MINIMAP, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ACTION_PANEL, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_PANEL, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_SHOP, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_ITEMS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_QUICKBUY, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_COURIER, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_PROTECT, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_GOLD, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_SHOP_SUGGESTEDITEMS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_TEAMS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_GAME_NAME, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_CLOCK, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_BAR_BACKGROUND, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_MENU_BUTTONS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ENDGAME, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ENDGAME_CHAT, false);
}

clean_up_particles_after_reload();
hide_default_ui();

subscribe_to_net_table_key<Player_Net_Table>("main", "player", data => {
    $("#global_map_ui").style.visibility = data.state == Player_State.on_global_map ? "visible" : "collapse";
    $("#battle_ui").style.visibility = data.state == Player_State.in_battle ? "visible" : "collapse";

    if (data.state == Player_State.in_battle) {
        GameUI.SetCameraDistance(1400);
        GameUI.SetCameraYaw(0);
        GameUI.SetCameraPitchMin(60);
        GameUI.SetCameraPitchMax(60);
    } else {
        GameUI.SetCameraDistance(1300);
        GameUI.SetCameraYaw(0);
        GameUI.SetCameraPitchMin(60);
        GameUI.SetCameraPitchMax(60);
    }
});