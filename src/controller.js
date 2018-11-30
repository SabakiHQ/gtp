const {spawn} = require('child_process')
const EventEmitter = require('events')
const {StreamController} = require('./main')

class Controller extends EventEmitter {
    constructor(path, args = [], spawnOptions = {}) {
        super()

        this._streamController = null

        this.path = path
        this.args = args
        this.spawnOptions = spawnOptions
        this.process = null
    }

    start() {
        if (this.process != null) return

        this.process = spawn(this.path, this.args, this.spawnOptions)

        this.process.on('exit', signal => {
            this._streamController = null
            this.emit('stopped', {signal})
        })

        lineSubscribe(this.process.stderr, line => {
            this.emit('stderr', {content: line})
        })

        this._streamController = new StreamController(this.process.stdin, this.process.stdout)
        this.emit('started')
    }

    async stop(timeout = 3000) {
        if (this.process == null) return

        return new Promise(resolve => {
            let timeoutId = setTimeout(() => {
                this.kill()
                resolve()
            }, timeout)

            this.sendCommand({name: 'quit'})
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
        if (this.process == null) this.start()

        return await this._streamController.sendCommand(command, subscriber)
    }
}

module.exports = Controller
