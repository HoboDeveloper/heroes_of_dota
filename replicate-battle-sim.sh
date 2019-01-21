pushd codegen
npx ttsc -p ../battle-sim/tsconfig.json
popd

cp battle-sim/dist/battle_sim.js server-remote/dist/battle_sim.js
cp battle-sim/dist/battle_sim.js dist/content/panorama/scripts/custom_game/battle_sim.js
cp battle-sim/src/unit_defs.ts server-local/src/unit_defs.ts
