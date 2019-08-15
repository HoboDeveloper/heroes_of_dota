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
    const hero_types = enum_values<Hero_Type>();

    for (const hero_type of hero_types) {
        const hero_name = get_hero_dota_name(hero_type);
        const unit_name = hero_type_to_dota_unit_name(hero_type);

        PrecacheUnitByNameSync(unit_name, context);
        PrecacheResource("soundfile", hero_sounds_by_hero_type(hero_type).file, context);
        PrecacheResource("soundfile", `soundevents/game_sounds_heroes/game_sounds_${hero_name}.vsndevts`, context);

        print("Precaching", unit_name);
    }

    PrecacheUnitByNameSync(creep_to_dota_unit_name(), context);

    PrecacheResource("soundfile", "soundevents/custom_game/game_sounds.vsndevts", context);
    PrecacheResource("soundfile", "soundevents/game_sounds_ui_imported.vsndevts", context);
}