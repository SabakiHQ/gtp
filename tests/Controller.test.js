const t = require('tap')
const {join} = require('path')
const {Controller} = require('..')

t.setTimeout(60000)

t.beforeEach(async (_, t) => {
  t.context.controller = new Controller('node', [
    join(__dirname, 'engines', 'testEngine.cli.js')
  ])
  t.context.controller.start()
})

t.afterEach(async (_, t) => {
  await t.context.controller.stop()
})

t.test('sendCommand', async t => {
  t.test('should be able to send a simple command', async t => {
    let response = await t.context.controller.sendCommand({id: 5, name: 'name'})

    t.deepEquals(response, {
      id: 5,
      content: 'Test Engine',
      error: false
    })
  })

  t.test('should be able to handle empty commands gracefully', async t => {
    let response = await t.context.controller.sendCommand({name: '   \t'})

    t.deepEquals(response, {
      id: null,
      content: '',
      error: false
    })
  })

  t.test('should be able to handle error responses', async t => {
    let response = await t.context.controller.sendCommand({name: 'erring'})

    t.deepEquals(response, {
      id: null,
      content: 'error!',
      error: true
    })
  })

  t.test('should be able to handle unexpected error responses', async t => {
    let response = await t.context.controller.sendCommand({name: 'throw'})

    t.deepEquals(response, {
      id: null,
      content: 'internal error',
      error: true
    })
  })

  t.test('should be able to subscribe to lines', async t => {
    let counter = 0
    let command = {name: 'async', args: []}

    let expectedEvents = [
      {
        line: '= look at me!',
        end: false,
        command,
        response: {id: null, content: 'look at me!', error: false}
      },
      {
        line: 'async and no end',
        end: false,
        command,
        response: {
          id: null,
          content: 'look at me!\nasync and no end',
          error: false
        }
      },
      {
        line: '',
        end: true,
        command,
        response: {
          id: null,
          content: 'look at me!\nasync and no end',
          error: false
        }
      }
    ]

    await t.context.controller.sendCommand({name: 'async'}, evt => {
      t.deepEquals(evt, expectedEvents[counter])
      counter++
    })
  })

  t.test('should be able to handle multiple commands in parallel', async t => {
    let responses = await Promise.all([
      t.context.controller.sendCommand({name: 'delay'}),
      t.context.controller.sendCommand({name: 'multiline'}),
      t.context.controller.sendCommand({name: 'version'})
    ])

    t.deepEquals(responses, [
      {
        id: null,
        content: 'ok',
        error: false
      },
      {
        id: null,
        content: 'multi\nline',
        error: false
      },
      {
        id: null,
        content: '0.1',
        error: false
      }
    ])
  })

  t.test('should emit command-sent event', t => {
    let counter = 0

    t.context.controller.once('command-sent', async evt => {
      evt.subscribe(evt => counter++)
      t.deepEquals(evt.command, {name: 'async', args: []})

      let response = await evt.getResponse()
      t.deepEquals(response, {
        id: null,
        content: 'look at me!\nasync and no end',
        error: false
      })

      t.equals(counter, 6)
      t.end()
    })

    t.context.controller.sendCommand({name: 'async'}, evt => counter++)
  })

  t.test('should emit response-receive event', t => {
    t.context.controller.once('response-received', evt => {
      t.deepEquals(evt, {
        command: {name: 'async', args: []},
        response: {
          id: null,
          content: 'look at me!\nasync and no end',
          error: false
        }
      })
      t.end()
    })

    t.context.controller.sendCommand({name: 'async'})
  })

  t.test('should kill engine when it is not responding on stop', async t => {
    t.rejects(t.context.controller.sendCommand({name: 'delay'}))
    t.assert(t.context.controller.busy)

    await t.context.controller.kill()
    t.equals(t.context.controller.process, null)
  })

  t.test('should ignore engine output lines outside responses', async t => {
    let response1 = await t.context.controller.sendCommand({
      name: 'invalid',
      args: ['before']
    })
    t.equals(response1.content, 'ok')

    let response2 = await t.context.controller.sendCommand({
      name: 'invalid',
      args: ['after']
    })
    t.equals(response2.content, 'ok')
  })

  t.test('should be able to send command after being stopped', async t => {
    let response = await t.context.controller.sendCommand({name: 'name'})

    t.deepEquals(response, {
      id: null,
      content: 'Test Engine',
      error: false
    })

    await t.context.controller.stop()

    response = await t.context.controller.sendCommand({name: 'name'})

    t.deepEquals(response, {
      id: null,
      content: 'Test Engine',
      error: false
    })
  })
})
