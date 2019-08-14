require("game_loop");
require("global_map");
require("battle_visualiser");
require("scheduler");
require("requests");
require("calls");
require("unit_defs");
require("particles");
require("modifier_logic");
require("hero_sounds");

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

    const hero_types = enum_values<Hero_Type>();

    for (const hero_type of hero_types) {
        PrecacheUnitByNameSync(hero_type_to_dota_unit_name(hero_type), context);
        PrecacheResource("soundfile", hero_sounds_by_hero_type(hero_type).file, context);

        print("Precaching", hero_type_to_dota_unit_name(hero_type));
    }

    PrecacheUnitByNameSync(creep_to_dota_unit_name(), context);

    PrecacheResource("soundfile", "soundevents/custom_game/game_sounds.vsndevts", context);
    PrecacheResource("soundfile", "soundevents/game_sounds_ui_imported.vsndevts", context);
}