require("game_loop");
require("global_map");
require("battle_visualiser");
require("scheduler");
require("requests");
require("calls");
require("unit_defs");
require("particles");
require("modifier_logic");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    const heroes: string[] = [
        "pudge",
        "luna",
        "tidehunter",
        "ursa",
        "sniper",
        "skywrath_mage",
        "dragon_knight",
        "lion"
    ];

    for (const hero_name of heroes) {
        const path = `soundevents/game_sounds_heroes/game_sounds_${hero_name}.vsndevts`;

        PrecacheResource("soundfile", path, context);

        print("Precaching", path);
    }

    for (const hero_name of heroes) {
        const full_name = `npc_dota_hero_${hero_name}`;

        PrecacheUnitByNameSync(full_name, context);

        print("Precaching", full_name);
    }

    PrecacheResource("soundfile", "soundevents/custom_game/game_sounds.vsndevts", context);
    PrecacheResource("soundfile", "soundevents/game_sounds_ui_imported.vsndevts", context);
}