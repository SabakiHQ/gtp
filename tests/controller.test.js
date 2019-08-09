const t = require('tap')
const {join} = require('path')
const {Controller} = require('..')

t.beforeEach(async (_, t) => {
    t.context.controller = new Controller('node', [join(__dirname, 'testEngine.js')])
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
        let command = {name: 'async'}

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
                response: {id: null, content: 'look at me!\nasync and no end', error: false}
            },
            {
                line: '',
                end: true,
                command,
                response: {id: null, content: 'look at me!\nasync and no end', error: false}
            }
        ]

        await t.context.controller.sendCommand(command, evt => {
            t.deepEquals(evt, expectedEvents[counter])
            counter++
        })
    })

    t.test('should be able to handle multiple commands in parallel', async t => {
        let responses = await Promise.all([
            t.context.controller.sendCommand({name: 'name'}),
            t.context.controller.sendCommand({name: 'multiline'}),
            t.context.controller.sendCommand({name: 'version'})
        ])

        t.deepEquals(responses, [
            {
                id: null,
                content: 'Test Engine',
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
})
