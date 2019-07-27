const { compile, copy_sim } = require("./compiler");

(async () => {
    console.time("Compile");

    await compile("battle-sim", "client-web", "server-remote");

    copy_sim("client-web/dist/battle_sim.js");
    copy_sim("server-remote/dist/battle_sim.js");

    console.timeEnd("Compile");
})();
