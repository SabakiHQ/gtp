const {Engine} = require('..')

let testEngine = new Engine()

testEngine.command('name', 'Test Engine')
testEngine.command('version', '0.1')

testEngine.command('delay', (_, {send}) => {
    setTimeout(() => send('ok'), 500)
})

testEngine.command('multiline', (_, {write, end}) => {
    setTimeout(() => write('multi\n'), 500)
    setTimeout(() => (write('line'), end()), 1000)
})

testEngine.command('erring', (_, {err}) => {
    err('error!')
})

testEngine.start()
