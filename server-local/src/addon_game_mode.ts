require("server_local")
require("scheduler");
require("requests");
require("calls");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    PrecacheResource("", "", context);
}