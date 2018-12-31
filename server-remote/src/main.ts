import {start_server} from "./server";

console.log("Starting server");

const args = process.argv.slice(2);

start_server(args.length > 0 && args[0] == "with_test_player");
