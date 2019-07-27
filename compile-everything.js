const { compile, copy_sim, copy_unit_defs } = require("./compiler");

(async () => {
    console.time("Compile");

    await compile("battle-sim", "client-web", "client-local", "server-remote", "server-local");

    copy_sim("client-web/dist/battle_sim.js");
    copy_sim("server-remote/dist/battle_sim.js");
    copy_sim("dist/content/panorama/scripts/custom_game/battle_sim.js");

    copy_unit_defs();

    console.timeEnd("Compile");
})();
