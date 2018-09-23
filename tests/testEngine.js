const {Engine} = require('..')

let testEngine = new Engine('Test Engine', '0.1')

testEngine.command('text', 'Hello World!')

testEngine.command('delay', (_, out) => {
    setTimeout(() => out.send('ok'), 500)
})

testEngine.command('play', (command, out) => {
    if (command.args.length === 0) return out.err('player not specified')
    out.send('playing for ' + command.args[0])
})

testEngine.command('multiline', (_, out) => {
    setTimeout(() => out.write('multi\n'), 500)
    setTimeout(() => (out.write('line'), out.end()), 1000)
})

testEngine.command('erring', (_, out) => {
    out.err('error!')
})

testEngine.start()
