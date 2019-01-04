require("server_local");
require("scheduler");
require("requests");
require("calls");
require("unit_defs");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    PrecacheResource("", "", context);
}