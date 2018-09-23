const {spawn} = require('child_process')
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
}

class Controller extends EventEmitter {
    constructor(path, args = [], spawnOptions = {}) {
        super()

        this.path = path
        this.args = args
        this.spawnOptions = spawnOptions

        this._counter = 0
        this._responseLineEmitter = new EventEmitter()

        this.commands = []
        this.process = null
    }

    start() {
        if (this.process != null) return

        this.process = spawn(this.path, this.args, this.spawnOptions)

        this.process.on('exit', signal => {
            this._counter = 0
            this._responseLineEmitter.removeAllListeners()

            this.commands = []
            this.process = null

            this.emit('stopped', {signal})
        })

        lineSubscribe(this.process.stdout, line => {
            if (this.commands.length > 0) {
                let end = line === ''
                let {_internalId} = !end ? this.commands[0] : this.commands.shift()

                this._responseLineEmitter.emit(`response-${_internalId}`, {line, end})
            }
        })

        lineSubscribe(this.process.stderr, line => {
            this.emit('stderr', {content: line})
        })

        this.emit('started')
    }

    async stop(timeout = 3000) {
        if (this.process == null) return

        return new Promise(resolve => {
            let timeoutId = setTimeout(() => {
                this.kill()
                resolve()
            }, timeout)

            this.sendCommand(Command.fromString('quit'))
            .then(response => response.error ? Promise.reject(new Error(response.content)) : response)
            .then(() => clearTimeout(timeoutId))
            .catch(_ => this.kill())
            .then(resolve)
        })
    }

    kill() {
        if (!this.process) return

        this.process.kill()
    }

    async sendCommand(command, subscriber = () => {}) {
        let _internalId = ++this._counter

        let promise = new Promise((resolve, reject) => {
            if (this.process == null) this.start()

            let commandString = Command.toString(command)

            if (commandString === '') {
                let response = Response.fromString('')

                subscriber({line: '\n', end: true, command, response})
                resolve(response)

                return
            }

            let eventName = `response-${_internalId}`
            let content = ''

            this._responseLineEmitter.on(eventName, ({line, end}) => {
                content += line + '\n'

                let response = Response.fromString(content)
                subscriber({line, end, command, response})

                if (!end) return

                content = ''
                this._responseLineEmitter.removeAllListeners(eventName)

                resolve(response)
            })

            try {
                this.commands.push(Object.assign({_internalId}, command))
                this.process.stdin.write(commandString + '\n')
            } catch (err) {
                this._responseLineEmitter.removeAllListeners(eventName)
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

module.exports = Controller
