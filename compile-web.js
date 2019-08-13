const { compile, copy_sim, deploy_web_version } = require("./compiler");

(async () => {
    console.time("Compile");

    await compile("battle-sim", "client-web", "server-remote");

    copy_sim("client-web/dist/battle_sim.js");
    copy_sim("server-remote/dist/battle_sim.js");

    deploy_web_version();

    console.timeEnd("Compile");
})();
