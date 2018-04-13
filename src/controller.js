const {spawn} = require('child_process')
const EventEmitter = require('events')
const {Command, Response} = require('./main')

class Controller extends EventEmitter {
    constructor(path, args = [], spawnOptions = {}) {
        super()

        this.path = path
        this.args = args
        this.spawnOptions = spawnOptions

        this._counter = 0
        this._outBuffer = ''
        this._errBuffer = ''

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

        this.process.stdout.on('data', data => {
            this._outBuffer += (data + '').replace(/\r/g, '').replace(/\t/g, ' ')

            let start = this._outBuffer.indexOf('\n\n')

            while (start !== -1) {
                let response = Response.fromString(this._outBuffer.slice(0, start))
                this._outBuffer = this._outBuffer.slice(start + 2)

                if (this.commands.length > 0) {
                    let {_internalId} = this.commands.shift()
                    this.emit(`response-${_internalId}`, response)
                }

                start = this._outBuffer.indexOf('\n\n')
            }
        })

        this.process.stderr.on('data', data => {
            this._errBuffer += (data + '').replace(/\r/g, '').replace(/\t/g, ' ')

            let start = this._errBuffer.indexOf('\n')

            while (start !== -1) {
                this.emit('stderr', {content: this._errBuffer.slice(0, start)})
                this._errBuffer = this._errBuffer.slice(start + 1)

                start = this._errBuffer.indexOf('\n')
            }
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
            .catch(err => this.kill())
            .then(resolve)
        })
    }

    kill() {
        if (!this.process) return

        this.process.kill()
    }

    async sendCommand(command) {
        let _internalId = ++this._counter

        let promise = new Promise((resolve, reject) => {
            if (this.process == null) this.start()

            let eventName = `response-${_internalId}`
            this.once(eventName, resolve)

            try {
                this.commands.push(Object.assign({_internalId}, command))
                this.process.stdin.write(Command.toString(command) + '\n')
            } catch (err) {
                this.removeListener(eventName, resolve)
                reject(new Error('GTP engine connection error'))
            }
        })

        this.emit('command-sent', {
            command,
            getResponse: () => promise
        })

        return promise
    }
}

module.exports = Controller
