#! /bin/bash
git pull

pushd codegen
npm install
npx ttsc -p ../battle-sim/tsconfig.json
npx ttsc -p ../server-remote/tsconfig.json
popd

cp battle-sim/dist/battle_sim.js server-remote/dist/battle_sim.js

pushd server-remote
kill -9 $(cat run.pid)
node dist/main.js > server-log.txt&
echo $! > run.pid
popd