copy /Y common\unit_defs.ts client-local\src\unit_defs.ts
copy /Y common\unit_defs.ts server-local\src\unit_defs.ts

echo export> server-remote\src\unit_defs.ts
type common\unit_defs.ts >> server-remote\src\unit_defs.ts