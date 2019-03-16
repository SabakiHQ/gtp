const {spawn, exec} = require('child_process')
const EventEmitter = require('events')
const {StreamController} = require('./main')
const {lineSubscribe} = require('./helper')

// System paths are not inherited in macOS
// This is a quick & dirty fix

if (process.platform === 'darwin') {
    exec('/bin/bash -ilc "env; exit"', (err, result) => {
        if (err) return

        let [_, path] = result.trim().split('\n')
            .map(x => x.split('='))
            .find(x => x[0] === 'PATH') || []

        if (path != null) process.env.PATH = path
    })
}

class Controller extends EventEmitter {
    constructor(path, args = [], spawnOptions = {}) {
        super()

        this.path = path
        this.args = args
        this.spawnOptions = spawnOptions

        this._streamController = null
        this.process = null
        this.commands = []
    }

    get busy() {
        return this._streamController != null && this._streamController.busy
    }

    start() {
        if (this.process != null) return

        this.process = spawn(this.path, this.args, this.spawnOptions)

        this.process.on('exit', signal => {
            this._streamController = null
            this.process = null
            this.commands = []

            this.emit('stopped', {signal})
        })

        lineSubscribe(this.process.stderr, line => {
            this.emit('stderr', {content: line})
        })

        if (this._streamController != null) {
            this._streamController.removeAllListeners()
        }

        this._streamController = new StreamController(this.process.stdin, this.process.stdout)
        this._streamController.on('command-sent', evt => this.emit('command-sent', evt))
        this._streamController.on('response-received', evt => this.emit('response-received', evt))

        this.commands = this._streamController.commands

        this.emit('started')
    }

    async stop(timeout = 3000) {
        if (this.process == null) return

        return new Promise(async resolve => {
            let timeoutId = setTimeout(() => {
                this.kill()
                resolve()
            }, timeout)

            try {
                let response = await this.sendCommand({name: 'quit'})
                if (response.error) throw new Error(response.content)
            } catch (err) {
                this.kill()
            }

            clearTimeout(timeoutId)
            resolve()
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
