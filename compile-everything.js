const { compile, copy_sim, copy_code_shared_with_lua, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    copy_code_shared_with_lua();

    await compile("battle-sim", "client-web", "client-local", "server-remote", "server-local");

    copy_sim("client-web/dist/battle_sim.js");
    copy_sim("server-remote/dist/battle_sim.js");
    copy_sim(`${panorama_scripts_dir}/battle_sim.js`);

    console.timeEnd("Compile");
})();
