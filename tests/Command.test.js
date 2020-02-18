const t = require('tap')
const {Command} = require('..')

t.test('should parse a simple command', t => {
  t.deepEqual(Command.fromString('quit'), {
    id: null,
    name: 'quit',
    args: []
  })

  t.end()
})

t.test('should parse a command with an id', t => {
  t.deepEqual(Command.fromString('43 list_commands'), {
    id: 43,
    name: 'list_commands',
    args: []
  })

  t.end()
})

t.test('should not parse float as id', t => {
  t.deepEqual(Command.fromString('43.3 list_commands'), {
    id: null,
    name: '43.3',
    args: ['list_commands']
  })

  t.end()
})

t.test('should parse a command with some arguments', t => {
  t.deepEqual(Command.fromString('play B    d4 "a comment"'), {
    id: null,
    name: 'play',
    args: ['B', 'd4', '"a', 'comment"']
  })

  t.end()
})

t.test('should generate command with id and arguments', t => {
  t.equal(
    Command.toString({id: 54, name: 'genmove', args: ['B', 'white']}),
    '54 genmove B white'
  )
  t.end()
})
