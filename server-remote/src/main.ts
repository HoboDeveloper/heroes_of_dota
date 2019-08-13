import {start_server} from "./server";

console.log("Starting server");

const args = process.argv.slice(2);

let with_test_player = false;

if (args.length > 0) {
    for (const arg of args) {
        if (arg == "with_test_player") {
            with_test_player = true;
        }
    }
}

start_server(with_test_player);
