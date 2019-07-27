const exec = require("child_process").exec;
const copy = require("fs").copyFileSync;
const performance = require('perf_hooks').performance;

function compile_file(module) {
    return new Promise(resolve => {
        console.log("Compiling", module);

        const start_time = performance.now();
        const no_npm_update = Object.assign({ "NO_UPDATE_NOTIFIER": "1" }, process.env);
        const emitter = exec(`npx ttsc -p ../${module}/tsconfig.json --pretty`, { cwd: "codegen", env: no_npm_update });

        emitter.stdout.on("data", function (data) {
            process.stdout.write(data.toString());
        });

        emitter.stderr.on("data", function (data) {
            process.stdout.write(data.toString());
        });

        emitter.on("exit", function (code) {
            resolve(`${module}: ${Number((performance.now() - start_time) / 1000).toFixed(2)}s`);

            if (code !== 0) {
                console.error(`\x1b[1m\x1b[31m${"Error"}\x1b[0m when compiling module \x1b[1m\x1b[33m${module}\x1b[0m`);
            }
        });
    });
}

exports.compile = function(...modules) {
    return Promise.all(modules.map(compile_file)).then(values => {
        values.forEach(value => console.log(value));
    })
};

exports.copy_sim = function(to) {
    copy("battle-sim/dist/battle_sim.js", to);
};

exports.copy_unit_defs = function() {
    copy("battle-sim/src/unit_defs.ts", "server-local/src/unit_defs.ts");
};