const t = require('tap')
const {PassThrough} = require('stream')
const testEngine = require('./engines/testEngine')
const {ControllerStateTracker} = require('..')

t.beforeEach(async (_, t) => {
    let input = new PassThrough()
    let output = new PassThrough()

    testEngine.start({input, output})
    t.context.stateTracker = ControllerStateTracker.fromStreamController(input, output)
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

    await stateTracker.sync({boardsize: 13})

    t.equals(stateTracker.state.boardsize, 13)
    t.equals(stateTracker.state.history, null)

    await stateTracker.controller.sendCommand({name: 'boardsize', args: ['21']})

    t.equals(stateTracker.state.boardsize, 21)
    t.equals(stateTracker.state.history, null)
})

t.test('sync history state', async t => {
    t.test('sync playing commands', async t => {
        let {stateTracker} = t.context
        let commands = [
            {name: 'set_free_handicap', args: ['F4', 'G4', 'H4']},
            {name: 'play', args: ['B', 'D4']},
            {name: 'play', args: ['W', 'E4']}
        ]

        await Promise.all(commands.map(command => stateTracker.controller.sendCommand(command)))
        t.deepEquals(stateTracker.state.history, commands)

        await stateTracker.controller.sendCommand({name: 'clear_board'})
        t.deepEquals(stateTracker.state.history, [])

        await stateTracker.sync({history: commands})
        t.deepEquals(stateTracker.state.history, commands)
    })

    t.test('sync genmove commands', async t => {
        let {stateTracker} = t.context
        let history = []

        let response = await stateTracker.controller.sendCommand({name: 'fixed_handicap', args: ['3']})
        history.push({name: 'set_free_handicap', args: response.content.split(' ')})

        response = await stateTracker.controller.sendCommand({name: 'genmove', args: ['B']})
        history.push({name: 'play', args: ['B', response.content]})

        response = await stateTracker.controller.sendCommand({name: 'genmove', args: ['W']})
        history.push({name: 'play', args: ['W', response.content]})

        response = await stateTracker.controller.sendCommand({name: 'genmove_analyze', args: ['B', 100]})
        history.push({name: 'play', args: ['B', response.content.split('\n').slice(-1)[0].split(' ')[1]]})

        t.deepEquals(stateTracker.state.history, history)
    })
})
