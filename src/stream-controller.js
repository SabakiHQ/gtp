const EventEmitter = require('events')
const {Command, Response} = require('./main')

function lineSubscribe(readable, subscriber) {
    let buffer = ''

    readable.on('data', data => {
        buffer += data.toString().replace(/\r/g, '')

        let newlineIndex = buffer.lastIndexOf('\n')

        if (newlineIndex >= 0) {
            let lines = buffer.slice(0, newlineIndex).split('\n')

            for (let line of lines) {
                subscriber(line)
            }

            buffer = buffer.slice(newlineIndex + 1)
        }
    })

    return readable
}

class StreamController extends EventEmitter {
    constructor(input, output) {
        super()

        this._counter = 0
        this._responseLineEmitter = new EventEmitter()
        this.commands = []

        this.input = input
        this.output = lineSubscribe(output, line => {
            if (this.commands.length > 0) {
                let end = line === ''
                let {_internalId} = !end ? this.commands[0] : this.commands.shift()

                this._responseLineEmitter.emit(`response-${_internalId}`, {line, end})
            }
        })
    }

    async sendCommand(command, subscriber = () => {}) {
        let promise = new Promise((resolve, reject) => {
            let commandString = Command.toString(command)
            if (commandString.trim() === '') {
                let response = Response.fromString('')

                subscriber({line: '\n', end: true, command, response})
                resolve(response)

                return
            }

            let _internalId = ++this._counter
            let eventName = `response-${_internalId}`
            let content = ''
            let firstLine = true

            let handleClose = () => reject(new Error('GTP engine output has stopped'))
            let cleanUp = () => {
                this._responseLineEmitter.removeAllListeners(eventName)
                this.output.removeListener('close', handleClose)
            }

            this.output.once('close', handleClose)

            this._responseLineEmitter.on(eventName, ({line, end}) => {
                if (firstLine && (line.length === 0 || !'=?'.includes(line[0]))) {
                    // Ignore invalid line
                    return
                }

                firstLine = false
                content += line + '\n'

                let response = Response.fromString(content)
                subscriber({line, end, command, response})

                if (!end) return

                content = ''

                cleanUp()
                resolve(response)
            })

            try {
                this.commands.push(Object.assign({_internalId}, command))
                this.input.write(commandString + '\n')
            } catch (err) {
                cleanUp()
                reject(new Error('GTP engine connection error'))
            }
        })

        this.emit('command-sent', {
            command,
            subscribe: f => {
                let g = subscriber
                subscriber = x => (f(x), g(x))
            },
            getResponse: () => promise
        })

        return promise
    }
}

module.exports = StreamController
