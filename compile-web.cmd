pushd codegen
call npx ttsc -p ../battle-sim/tsconfig.json
call npx ttsc -p ../client-web/tsconfig.json
call npx ttsc -p ../server-remote/tsconfig.json
popd

copy /Y battle-sim\dist\battle_sim.js client-web\dist\battle_sim.js
copy /Y battle-sim\dist\battle_sim.js server-remote\dist\battle_sim.js

echo "Done"