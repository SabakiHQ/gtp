const EventEmitter = require('events')
const {Command, Response} = require('./main')
const {lineSubscribe} = require('./helper')

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

    get busy() {
        return this.commands.length > 0
    }

    async sendCommand(command, subscriber = () => {}) {
        let promise = new Promise((resolve, reject) => {
            let commandString = Command.toString(command)
            if (commandString.trim() === '') {
                let response = Response.fromString('')

                subscriber({line: '\n', end: true, command, response})
                resolve(response)

                this.emit('response-received', {
                    command,
                    response
                })

                return
            }

            let _internalId = ++this._counter
            let eventName = `response-${_internalId}`
            let content = ''
            let firstLine = true

            let handleClose = () => {
                cleanUp()
                reject(new Error('GTP engine output has stopped'))
            }

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

                if (end) {
                    content = ''

                    cleanUp()
                    resolve(response)
                }
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
