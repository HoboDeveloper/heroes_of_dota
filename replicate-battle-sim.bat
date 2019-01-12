pushd battle-sim
call tsc -p tsconfig.json
popd

copy /Y battle-sim\dist\battle_sim.js server-remote\dist\battle_sim.js
copy /Y battle-sim\dist\battle_sim.js dist\content\panorama\scripts\custom_game\battle_sim.js