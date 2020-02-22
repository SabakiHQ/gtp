const t = require('tap')
const {PassThrough} = require('stream')
const testEngine = require('./engines/testEngine')
const {ControllerStateTracker} = require('..')

t.beforeEach(async (_, t) => {
  let input = new PassThrough().on('data', chunk => (t.context.input += chunk))
  let output = new PassThrough().on(
    'data',
    chunk => (t.context.output += chunk)
  )

  t.context.input = ''
  t.context.output = ''
  testEngine.start({input, output})
  t.context.stateTracker = ControllerStateTracker.fromStreamController(
    input,
    output
  )
})

t.afterEach(async (_, t) => {
  t.context.stateTracker.controller.close()
})

t.test('knowsCommand', async t => {
  let {stateTracker} = t.context

  t.equals(await stateTracker.knowsCommand('sdlfkj'), false)
  t.equals(await stateTracker.knowsCommand('list_commands'), true)
  t.equals(await stateTracker.knowsCommand('version'), true)
})

t.test('handle parallel syncing sequentially', async t => {
  let {stateTracker} = t.context

  await Promise.all([
    stateTracker.sync({komi: 8}),
    stateTracker.sync({boardsize: [18, 18], history: []})
  ])

  t.strictDeepEquals(stateTracker.state, {
    komi: 8,
    boardsize: [18, 18],
    timeSettings: null,
    history: []
  })
})

t.test('failing sync', async t => {
  let {stateTracker} = t.context

  await t.rejects(
    stateTracker.sync({
      komi: 8,
      history: [{name: 'play'}]
    })
  )
})

t.test('sync komi state', async t => {
  let {stateTracker} = t.context
  t.equals(stateTracker.state.komi, null)

  await stateTracker.sync({komi: 8})
  t.equals(stateTracker.state.komi, 8)

  await stateTracker.controller.sendCommand({name: 'komi', args: ['8.5']})
  t.equals(stateTracker.state.komi, 8.5)
})

t.test('sync boardsize state', async t => {
  let {stateTracker} = t.context

  await stateTracker.controller.sendCommand({name: 'play', args: ['B', 'D4']})

  t.equals(stateTracker.state.boardsize, null)
  t.notEquals(stateTracker.state.history, null)

  await stateTracker.sync({boardsize: [13, 13]})

  t.strictDeepEquals(stateTracker.state.boardsize, [13, 13])
  t.equals(stateTracker.state.history, null)

  await stateTracker.controller.sendCommand({name: 'boardsize', args: ['21']})

  t.strictDeepEquals(stateTracker.state.boardsize, [21, 21])
  t.equals(stateTracker.state.history, null)
})

t.test('sync rectangular boardsize state', async t => {
  let {stateTracker} = t.context

  await stateTracker.controller.sendCommand({name: 'play', args: ['B', 'D4']})

  t.equals(stateTracker.state.boardsize, null)
  t.notEquals(stateTracker.state.history, null)

  await stateTracker.sync({boardsize: [13, 15]})

  t.strictDeepEquals(stateTracker.state.boardsize, [13, 15])
  t.equals(stateTracker.state.history, null)

  await stateTracker.controller.sendCommand({
    name: 'rectangular_boardsize',
    args: ['21', '10']
  })

  t.strictDeepEquals(stateTracker.state.boardsize, [21, 10])
  t.equals(stateTracker.state.history, null)
})

t.test('sync time settings', async t => {
  let {stateTracker} = t.context

  t.equals(stateTracker.state.timeSettings, null)

  let timeSettings = {mainTime: 30, byoyomiTime: 10, byoyomiStones: 20}
  await stateTracker.sync({timeSettings})

  t.strictDeepEquals(stateTracker.state.timeSettings, timeSettings)

  await stateTracker.controller.sendCommand({
    name: 'time_settings',
    args: ['15', '1', '10']
  })

  t.strictDeepEquals(stateTracker.state.timeSettings, {
    mainTime: 15,
    byoyomiTime: 1,
    byoyomiStones: 10
  })
})

t.test('sync history state', async t => {
  t.test('sync playing commands', async t => {
    let {stateTracker} = t.context
    let commands = [
      {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
      {name: 'play', args: ['B', 'D4']},
      {name: 'play', args: ['W', 'E4']}
    ]

    await Promise.all(
      commands.map(command => stateTracker.controller.sendCommand(command))
    )
    t.strictDeepEquals(stateTracker.state.history, commands)

    await stateTracker.controller.sendCommand({name: 'clear_board'})
    t.strictDeepEquals(stateTracker.state.history, [])

    await stateTracker.sync({history: commands})
    t.strictDeepEquals(stateTracker.state.history, commands)
  })

  t.test('sync genmove commands', async t => {
    let {stateTracker} = t.context
    let history = []

    let response = await stateTracker.controller.sendCommand({
      name: 'fixed_handicap',
      args: ['3']
    })
    history.push({name: 'set_free_handicap', args: response.content.split(' ')})

    response = await stateTracker.controller.sendCommand({
      name: 'genmove',
      args: ['B']
    })
    history.push({name: 'play', args: ['B', response.content]})

    response = await stateTracker.controller.sendCommand({
      name: 'genmove',
      args: ['W']
    })
    history.push({name: 'play', args: ['W', response.content]})

    response = await stateTracker.controller.sendCommand({
      name: 'genmove_analyze',
      args: ['B', 100]
    })
    history.push({
      name: 'play',
      args: [
        'B',
        response.content
          .split('\n')
          .slice(-1)[0]
          .split(' ')[1]
      ]
    })

    t.strictDeepEquals(stateTracker.state.history, history)
  })

  t.test('push history', async t => {
    let {stateTracker} = t.context
    let commands = [
      {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
      {name: 'play', args: ['B', 'D4']},
      {name: 'play', args: ['W', 'E4']}
    ]

    await stateTracker.sync({history: commands})
    t.strictDeepEquals(stateTracker.state.history, commands)

    let newCommands = [
      ...commands,
      {name: 'play', args: ['B', 'A4']},
      {name: 'play', args: ['W', 'B4']}
    ]

    await stateTracker.sync({history: newCommands})
    t.strictDeepEquals(stateTracker.state.history, newCommands)
  })

  t.test('history changing sync without undo', async t => {
    let {stateTracker} = t.context
    let commands = [
      {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
      {name: 'play', args: ['B', 'D4']},
      {name: 'play', args: ['W', 'E4']}
    ]

    await stateTracker.sync({history: commands})
    t.strictDeepEquals(stateTracker.state.history, commands)

    let newCommands = [
      ...commands.slice(0, -1),
      {name: 'play', args: ['W', 'B4']},
      {name: 'play', args: ['B', 'A4']}
    ]

    await stateTracker.sync({history: newCommands})
    t.strictDeepEquals(stateTracker.state.history, newCommands)
  })

  t.test('history changing sync with failing undo', async t => {
    let {stateTracker} = t.context
    await stateTracker.controller.sendCommand({
      name: 'enableundo',
      args: ['error']
    })

    let commands = [
      {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
      {name: 'play', args: ['B', 'D4']},
      {name: 'play', args: ['W', 'E4']}
    ]

    await stateTracker.sync({history: commands})
    t.strictDeepEquals(stateTracker.state.history, commands)

    let newCommands = [
      ...commands.slice(0, -1),
      {name: 'play', args: ['W', 'B4']},
      {name: 'play', args: ['B', 'A4']}
    ]

    await stateTracker.sync({history: newCommands})
    t.strictDeepEquals(stateTracker.state.history, newCommands)
  })

  t.test('history changing sync with undo', async t => {
    let {stateTracker} = t.context
    await stateTracker.controller.sendCommand({name: 'enableundo'})

    let commands = [
      {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
      {name: 'play', args: ['B', 'D4']},
      {name: 'play', args: ['W', 'E4']}
    ]

    await stateTracker.sync({history: commands})
    t.strictDeepEquals(stateTracker.state.history, commands)

    let newCommands = [
      ...commands.slice(0, -1),
      {name: 'play', args: ['W', 'B4']},
      {name: 'play', args: ['B', 'A4']}
    ]

    await stateTracker.sync({history: newCommands})
    t.strictDeepEquals(stateTracker.state.history, newCommands)
    t.assert(t.context.input.includes('undo\n'))
  })

  t.test('history sync after unknown history state', async t => {
    let {stateTracker} = t.context
    let commands = [
      {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
      {name: 'play', args: ['B', 'D4']},
      {name: 'play', args: ['W', 'E4']}
    ]

    await stateTracker.sync({history: commands})
    t.strictDeepEquals(stateTracker.state.history, commands)

    await stateTracker.controller.sendCommand({name: 'loadsgf'})
    t.equals(stateTracker.state.history, null)

    await stateTracker.sync({history: commands})
    t.strictDeepEquals(stateTracker.state.history, commands)
  })
})

t.test('queueCommand will send command after syncs are done', async t => {
  let {stateTracker} = t.context
  let commands = [
    {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
    {name: 'play', args: ['B', 'D4']},
    {name: 'play', args: ['W', 'E4']}
  ]

  let sentCommands = []

  stateTracker.controller.on('command-sent', ({command}) => {
    sentCommands.push(command)
  })

  let responses = await Promise.all([
    stateTracker.sync({history: commands}),
    stateTracker.queueCommand({name: 'genmove', args: ['B']}),
    stateTracker.sync({history: commands})
  ])

  t.assert(responses[1] != null)
  t.matchSnapshot(sentCommands)
})
