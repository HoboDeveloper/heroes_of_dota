const code = `

`;

const lines = code.split(/\r?\n/);

let result = "";
let index = 0;

for (const line of lines) {
    const pieces = line.split(/\s+/);

    if (pieces.length === 4) {
        result += `    ${pieces[1]} = ${index},\n`;
        index++;
    } else {
        result += "\n";
    }
}

console.log(result);