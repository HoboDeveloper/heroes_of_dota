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

function get_access_token() {
    return get_net_table<Player_Net_Table>("main", "player").token;
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

hide_default_ui();

subscribe_to_net_table_key<Player_Net_Table>("main", "player", data => {
    $("#global_map_ui").style.visibility = data.state == Player_State.on_global_map ? "visible" : "collapse";
    $("#battle_ui").style.visibility = data.state == Player_State.in_battle ? "visible" : "collapse";

    if (data.state == Player_State.in_battle) {
        GameUI.SetCameraDistance(1600);
    } else {
        GameUI.SetCameraDistance(1300);
    }
});