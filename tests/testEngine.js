const readline = require('readline')

let lineReader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ''
})

async function handleInput(input) {
    await new Promise(resolve => setTimeout(resolve, 300))
    return '= ok\n\n'
}

lineReader.on('line', async input => {
    process.stdout.write(await handleInput(input))
    if (input === 'quit') process.exit()
})

lineReader.prompt()
