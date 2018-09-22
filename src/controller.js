const {spawn} = require('child_process')
const EventEmitter = require('events')
const {Command, Response} = require('./main')
const lineSubscribe = require('./lineSubscribe')

class Controller extends EventEmitter {
    constructor(path, args = [], spawnOptions = {}) {
        super()

        this.path = path
        this.args = args
        this.spawnOptions = spawnOptions

        this._counter = 0

        this.commands = []
        this.process = null
    }

    start() {
        if (this.process != null) return

        this.process = spawn(this.path, this.args, this.spawnOptions)

        this.process.on('exit', signal => {
            this._counter = 0
            this._outBuffer = ''
            this._errBuffer = ''

            this.commands = []
            this.process = null

            this.emit('stopped', {signal})
        })

        lineSubscribe(this.process.stdout, line => {
            if (this.commands.length > 0) {
                let end = line === ''
                let {_internalId} = !end ? this.commands[0] : this.commands.shift()

                this.emit(`response-${_internalId}`, {line, end})
            }
        })

        lineSubscribe(this.process.stderr, line => {
            this.emit('stderr', {content: line.trim()})
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
            if (commandString.trim() === '') {
                return resolve(Response.fromString(''))
            }

            let eventName = `response-${_internalId}`
            let content = ''

            this.on(eventName, ({line, end}) => {
                content += line + '\n'

                let response = Response.fromString(content)
                subscriber({line, end, command, response})

                if (!end) return

                content = ''
                this.removeAllListeners(eventName)

                resolve(response)
            })

            try {
                this.commands.push(Object.assign({_internalId}, command))
                this.process.stdin.write(commandString + '\n')
            } catch (err) {
                this.removeAllListeners(eventName)
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
