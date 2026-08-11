const t = require('tap')
const {join} = require('path')
const {Controller} = require('..')

t.setTimeout(60000)

t.beforeEach(async t => {
  t.context.controller = new Controller('node', [
    join(__dirname, 'engines', 'testEngine.cli.js')
  ])
  t.context.controller.start()
})

t.afterEach(async t => {
  await t.context.controller.stop()
})

t.test('sendCommand', async t => {
  t.test('should be able to send a simple command', async t => {
    let response = await t.context.controller.sendCommand({id: 5, name: 'name'})

    t.same(response, {
      id: 5,
      content: 'Test Engine',
      error: false
    })
  })

  t.test('should be able to handle empty commands gracefully', async t => {
    let response = await t.context.controller.sendCommand({name: '   \t'})

    t.same(response, {
      id: null,
      content: '',
      error: false
    })
  })

  t.test('should be able to handle error responses', async t => {
    let response = await t.context.controller.sendCommand({name: 'erring'})

    t.same(response, {
      id: null,
      content: 'error!',
      error: true
    })
  })

  t.test('should be able to handle unexpected error responses', async t => {
    let response = await t.context.controller.sendCommand({name: 'throw'})

    t.same(response, {
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
      t.same(evt, expectedEvents[counter])
      counter++
    })
  })

  t.test('should be able to handle multiple commands in parallel', async t => {
    let responses = await Promise.all([
      t.context.controller.sendCommand({name: 'delay'}),
      t.context.controller.sendCommand({name: 'multiline'}),
      t.context.controller.sendCommand({name: 'version'})
    ])

    t.same(responses, [
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
      t.same(evt.command, {name: 'async', args: []})

      let response = await evt.getResponse()
      t.same(response, {
        id: null,
        content: 'look at me!\nasync and no end',
        error: false
      })

      t.equal(counter, 6)
      t.end()
    })

    t.context.controller.sendCommand({name: 'async'}, evt => counter++)
  })

  t.test('should emit response-receive event', t => {
    t.context.controller.once('response-received', evt => {
      t.same(evt, {
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
    t.ok(t.context.controller.busy)

    await t.context.controller.kill()
    t.equal(t.context.controller.process, null)
  })

  t.test('should ignore engine output lines outside responses', async t => {
    let response1 = await t.context.controller.sendCommand({
      name: 'invalid',
      args: ['before']
    })
    t.equal(response1.content, 'ok')

    let response2 = await t.context.controller.sendCommand({
      name: 'invalid',
      args: ['after']
    })
    t.equal(response2.content, 'ok')
  })

  t.test('should be able to send command after being stopped', async t => {
    let response = await t.context.controller.sendCommand({name: 'name'})

    t.same(response, {
      id: null,
      content: 'Test Engine',
      error: false
    })

    await t.context.controller.stop()

    response = await t.context.controller.sendCommand({name: 'name'})

    t.same(response, {
      id: null,
      content: 'Test Engine',
      error: false
    })
  })
})

t.test('spawn failures', async t => {
  // Regression coverage for SabakiHQ/Sabaki#1083: a path that can't be spawned
  // used to leave an unhandled 'error' event on the child process, which throws
  // and takes down the caller instead of reporting anything. A failed spawn
  // emits 'error' and 'close' but never 'exit', so it also left the controller
  // permanently wedged with a non-null process.
  let cases = [
    {
      what: 'a path that does not exist',
      path: join(__dirname, 'engines', 'doesNotExist'),
      codes: ['ENOENT']
    },
    {
      what: 'a path that is a directory',
      path: join(__dirname, 'engines'),
      codes: ['EACCES', 'EISDIR']
    },
    {
      what: 'a file that is not executable',
      path: join(__dirname, 'engines', 'testEngine.js'),
      codes: ['EACCES']
    }
  ]

  for (let {what, path, codes} of cases) {
    t.test(`should report ${what} instead of throwing`, async t => {
      let controller = new Controller(path)
      let stopped = new Promise(resolve => controller.once('stopped', resolve))
      let started = false

      controller.once('started', () => (started = true))
      controller.start()

      let evt = await stopped

      t.ok(codes.includes(evt.error.code), `should fail with ${evt.error.code}`)
      t.equal(evt.code, null)
      t.equal(evt.signal, null)
      t.notOk(started, 'should not claim the engine started')
      t.equal(controller.process, null, 'should release the process')
    })
  }

  t.test('should emit error when someone is listening', async t => {
    let controller = new Controller(join(__dirname, 'engines', 'doesNotExist'))
    let error = new Promise(resolve => controller.once('error', resolve))

    controller.start()

    t.equal((await error).code, 'ENOENT')
  })

  t.test('should be able to start again after a failed spawn', async t => {
    let controller = new Controller(join(__dirname, 'engines', 'doesNotExist'))
    let stopped = new Promise(resolve => controller.once('stopped', resolve))

    controller.start()
    await stopped

    controller.path = 'node'
    controller.args = [join(__dirname, 'engines', 'testEngine.cli.js')]

    let response = await controller.sendCommand({name: 'name'})
    t.equal(response.content, 'Test Engine')

    await controller.stop()
  })

  t.test('should report the exit code of an engine that quits', async t => {
    let controller = new Controller('node', ['-e', 'process.exit(3)'])
    let stopped = new Promise(resolve => controller.once('stopped', resolve))

    controller.start()
    let evt = await stopped

    t.equal(evt.code, 3)
    t.equal(evt.error, null)
  })
})
