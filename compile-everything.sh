chmod +x replicate-battle-sim.sh

pushd server-remote
npm install
popd

pushd codegen
npm install
popd

./replicate-battle-sim.sh

pushd codegen
npx ttsc -p ../client-local/tsconfig.json
npx ttsc -p ../server-remote/tsconfig.json
npx ttsc -p ../server-local/tsconfig.json
popd
