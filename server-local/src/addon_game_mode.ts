require("game_loop");
require("global_map");
require("battle_visualiser");
require("scheduler");
require("requests");
require("calls");
require("unit_defs");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    PrecacheResource("soundfile", "soundevents/custom_game/game_sounds.vsndevts", context);
}