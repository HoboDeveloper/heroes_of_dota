import {start_server} from "./server";

console.log("Starting server");

const args = process.argv.slice(2);

let dev = false;

if (args.length > 0) {
    for (const arg of args) {
        if (arg == "dev") {
            dev = true;
        }
    }
}

start_server(dev);
