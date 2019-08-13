#!/usr/bin/env bash
git pull
git submodule update
git submodule foreach git checkout master
git submodule foreach git pull origin master

pushd server-remote
npm install
popd

pushd codegen
npm install
npx ttsc -p ../battle-sim/tsconfig.json
npx ttsc -p ../client-web/tsconfig.json
npx ttsc -p ../server-remote/tsconfig.json
popd

cp client-web/dist/game.html server-remote/dist/game.html
cp client-web/dist/web_main.js server-remote/dist/web_main.js
cp battle-sim/dist/battle_sim.js server-remote/dist/battle_sim.js

pushd server-remote
kill -9 $(cat run.pid)
node dist/main.js > server-log.txt&
echo $! > run.pid
popd
