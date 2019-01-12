#! /bin/bash

pushd battle-sim
tsc -p tsconfig.json
popd

cp battle-sim/dist/battle_sim.js server-remote/dist/battle_sim.js