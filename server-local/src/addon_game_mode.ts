require("game_loop");
require("global_map");
require("battle_visualiser");
require("scheduler");
require("requests");
require("calls");
require("unit_defs");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    const hero_sounds: string[] = [
        "pudge",
        "luna",
        "tidehunter",
        "ursa",
        "sniper"
    ];

    for (const hero_name of hero_sounds) {
        const path = `soundevents/game_sounds_heroes/game_sounds_${hero_name}.vsndevts`;

        PrecacheResource("soundfile", path, context);

        print("Precaching", path);
    }

    PrecacheResource("soundfile", "soundevents/custom_game/game_sounds.vsndevts", context);
}