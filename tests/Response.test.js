const t = require('tap')
const {Response} = require('..')

t.test('should parse a simple response', t => {
  t.deepEqual(Response.fromString('='), {
    id: null,
    content: '',
    error: false
  })

  t.end()
})

t.test('should parse a response with an id', t => {
  t.deepEqual(Response.fromString('=43 ok'), {
    id: 43,
    content: 'ok',
    error: false
  })

  t.end()
})

t.test('should parse multiline response', t => {
  t.deepEqual(Response.fromString('= ok\nwhatever'), {
    id: null,
    content: 'ok\nwhatever',
    error: false
  })

  t.end()
})

t.test('should parse an error', t => {
  t.deepEqual(Response.fromString('?4 connection lost'), {
    id: 4,
    content: 'connection lost',
    error: true
  })

  t.end()
})

t.test('should generate response with id', t => {
  t.equal(
    Response.toString({id: 54, content: '+--+\n|xo|\n|ox|\n+--+'}),
    '=54 +--+\n|xo|\n|ox|\n+--+'
  )
  t.end()
})

t.test('should generate error response', t => {
  t.equal(
    Response.toString({content: 'invalid sgf', error: true}),
    '? invalid sgf'
  )
  t.end()
})
