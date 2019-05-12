const {Engine} = require('..')

let testEngine = new Engine('Test Engine', '0.1')

testEngine.command('text', 'Hello World!')

testEngine.command('delay', (_, out) => {
    setTimeout(() => out.send('ok'), 5000)
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

testEngine.command('throw', (_, out) => {
    throw new Error('Some internal error!')
})

testEngine.command('writethrow', (_, out) => {
    out.write('hi, my name is')
    throw new Error('Some internal error!')
})

testEngine.command('wrong', (_, out) => {
    console.log('wrong')
    out.send('response')
})

testEngine.command('async', async (_, out) => {
    out.write('look at me!\n')
    await new Promise(resolve => setTimeout(resolve, 1000))
    out.write('async and no end')
})

testEngine.start()
