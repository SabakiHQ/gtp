const EventEmitter = require('events')
const {spawn, exec} = require('./ponyfills/child_process')
const {StreamController} = require('./main')
const {lineSubscribe} = require('./helper')

// System paths are not inherited in macOS
// This is a quick & dirty fix

/* istanbul ignore if */
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
    }

    get busy() {
        return this._streamController != null && this._streamController.busy
    }

    get commands() {
        return this._streamController == null ? [] : this._streamController.commands
    }

    start() {
        if (this.process != null) return

        this.process = spawn(this.path, this.args, this.spawnOptions)

        this._unsubscribeStderr = lineSubscribe(this.process.stderr, line => {
            this.emit('stderr', {content: line})
        })

        this.process.once('exit', signal => {
            this._unsubscribeStderr()
            this._streamController.close()
            this.process.stdin.destroy()
            this.process.stdout.destroy()

            this._streamController = null
            this.process = null

            this.emit('stopped', {signal})
        })

        this._streamController = new StreamController(this.process.stdin, this.process.stdout)
        this._streamController.on('command-sent', evt => this.emit('command-sent', evt))
        this._streamController.on('response-received', evt => this.emit('response-received', evt))

        this.emit('started')
    }

    async stop(timeout = 3000) {
        if (this.process == null) return

        let timeoutId = setTimeout(() => this.kill(), timeout)

        try {
            let response = await this.sendCommand({name: 'quit'})
            if (response.error) throw new Error(response.content)
        } catch (err) {
            this.kill()
        }

        clearTimeout(timeoutId)
        await new Promise(resolve => this.once('stopped', resolve))
    }

    async kill() {
        if (this.process == null) return

        this.process.kill()
        await new Promise(resolve => this.once('stopped', resolve))
    }

    async sendCommand(command, subscriber = () => {}) {
        if (this.process == null) this.start()

        return await this._streamController.sendCommand(command, subscriber)
    }
}

module.exports = Controller
