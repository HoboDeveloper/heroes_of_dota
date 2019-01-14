call replicate-battle-sim

pushd client-local
call tsc -p tsconfig.json
popd

pushd server-local
call tstl -p tsconfig.json
popd

pushd server-remote
call tsc -p tsconfig.json
popd

echo "Done"