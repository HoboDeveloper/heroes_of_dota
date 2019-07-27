const { compile, copy_sim, copy_unit_defs, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    copy_unit_defs();

    await compile("battle-sim", "client-local", "server-remote", "server-local");

    copy_sim("server-remote/dist/battle_sim.js");
    copy_sim(`${panorama_scripts_dir}/battle_sim.js`);

    console.timeEnd("Compile");
})();
