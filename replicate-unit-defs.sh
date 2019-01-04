#! /bin/bash

cp common/unit_defs.ts client-local/src/unit_defs.ts
cp common/unit_defs.ts server-local/src/unit_defs.ts

echo "export
$(cat common/unit_defs.ts)" > server-remote/src/unit_defs.ts