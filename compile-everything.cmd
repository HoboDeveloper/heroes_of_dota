call replicate-battle-sim

pushd codegen
call npx ttsc -p ../client-web/tsconfig.json
call npx ttsc -p ../client-local/tsconfig.json
call npx ttsc -p ../server-remote/tsconfig.json
call npx ttsc -p ../server-local/tsconfig.json
popd

echo "Done"