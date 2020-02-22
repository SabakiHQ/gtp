const {Engine} = require('../..')

function getRandomVertex() {
  let alpha = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'
  let x = alpha[Math.floor(Math.random() * 19)]
  let y = Math.floor(Math.random() * 19) + 1

  return `${x}${y}`
}

let testEngine = new Engine('Test Engine', '0.1')

testEngine.command('text', 'Hello World!')

testEngine.command('delay', (_, out) => {
  setTimeout(() => out.send('ok'), 5000)
})

for (let commandName of [
  'clear_board',
  'boardsize',
  'rectangular_boardsize',
  'komi',
  'time_settings',
  'set_free_handicap',
  'loadsgf'
]) {
  if (commandName == null) continue
  testEngine.command(commandName, (_, out) => out.send())
}

testEngine.command('enableundo', (command, out) => {
  testEngine.command('undo', (_, out) =>
    command.args[0] === 'error' ? out.err('cannot undo') : out.send()
  )

  out.send('undo command enabled')
})

testEngine.command('play', (command, out) => {
  if (command.args.length < 2) return out.err('not enough arguments')
  out.send('playing for ' + command.args[0])
})

testEngine.command('genmove', (command, out) => {
  if (command.args.length === 0) return out.err('player not specified')
  out.send(getRandomVertex())
})

for (let commandName of ['genmove_analyze', 'test-genmove_analyze']) {
  testEngine.command(commandName, async (command, out) => {
    if (command.args.length !== 2) return out.err('not enough arguments')

    for (let i = 0; i < 3; i++) {
      out.write('info move\n')
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    out.send(`play ${getRandomVertex()}`)
  })
}

for (let commandName of ['fixed_handicap', 'place_free_handicap']) {
  testEngine.command(commandName, async (command, out) => {
    if (command.args.length === 0) return out.err('not enough arguments')

    out.send([...Array(+command.args[0])].map(_ => getRandomVertex()).join(' '))
  })
}

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

testEngine.command('async', async (_, out) => {
  out.write('look at me!\n')
  await new Promise(resolve => setTimeout(resolve, 1000))
  out.write('async and no end')
})

testEngine.command('asyncthrow', async (_, out) => {
  throw new Error('Some internal error!')
})

testEngine.command('invalid', (command, out) => {
  if (command.args[0] === 'before') process.stdout.write('invalid line\n')
  out.send('ok')
  if (command.args[0] === 'after') process.stdout.write('invalid line\n')
})

module.exports = testEngine
