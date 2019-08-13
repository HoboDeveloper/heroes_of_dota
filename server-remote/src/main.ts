import {start_server} from "./server";

console.log("Starting server");

const args = process.argv.slice(2);

let host = "127.0.0.1";
let with_test_player = false;

if (args.length > 0) {
    args.shift();

    for (const arg of args) {
        if (arg == "with_test_player") {
            with_test_player = true;
        } else if (arg.startsWith("host:")) {
            host = arg.substring("host:".length);
        }
    }
}

start_server(host, with_test_player);
