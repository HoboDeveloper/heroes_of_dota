#! /bin/bash
git pull
./replicate-unit-defs.sh
pushd server-remote
tsc -p tsconfig.json
kill -9 $(cat run.pid)
node dist/main.js > server-log.txt&
echo $! > run.pid
popd