const exec = require("child_process").execSync;

const base = { stdio: "inherit" };

exec("git submodule update", base);
exec("git submodule foreach git checkout master", base);
exec("git submodule foreach git pull origin master", base);

exec("npm install", { cwd: "server-remote", ...base });
exec("npm install", { cwd: "codegen", ...base });