const {spawn} = require('child_process')
const {dirname} = require('path')
const EventEmitter = require('events')
const {Command, Response} = require('./main')

class Controller extends EventEmitter {
    constructor(path, args = []) {
        super()

        this._counter = 0
        this._outBuffer = ''
        this._errBuffer = ''

        this.commands = []
        this.process = null
        this.path = path
        this.args = args
    }

    start() {
        if (this.process != null) return

        let {path, args} = this.engine

        this.process = spawn(path, args, {cwd: dirname(path)})

        this.process.on('exit', signal => {
            this.emit('quit', {signal})
        })

        this.process.stdout.on('data', data => {
            this._outBuffer += (data + '').replace(/\r/g, '').replace(/\t/g, ' ')

            let start = this._outBuffer.indexOf('\n\n')

            while (start !== -1) {
                let response = Response.fromString(this._outBuffer.slice(0, start))
                this._outBuffer = this._outBuffer.slice(start + 2)

                if (this.commands.length > 0) {
                    let command = this.commands.shift()
                    this.emit(`response-${command._internalId}`, response)
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

    stop(timeout = 3000) {
        return new Promise(resolve => {
            setTimeout(() => {
                this.kill()
                resolve()
            }, timeout)

            this.sendCommand(Command.fromString('quit'))
            .then(response => response.error ? Promise.reject(new Error(response.content)) : response)
            .then(() => this.process = null)
            .catch(err => this.kill())
            .then(resolve)
        }).then(() =>
            this.emit('stopped')
        )
    }

    kill() {
        if (!this.process) return

        this.process.kill()
        this.process = null

        this.emit('killed')
    }

    sendCommand(command) {
        let _internalId = ++this._counter

        let promise = new Promise(resolve => {
            if (this.process == null) this.start()

            let eventName = `response-${_internalId}`
            this.once(eventName, resolve)

            try {
                this.process.stdin.write(Command.toString(command) + '\n')
                this.commands.push(Object.assign({_internalId}, command))
            } catch (err) {
                this.removeListener(eventName, resolve)
                reject(new Error('GTP engine connection error'))
            }
        })

        this.emit('command-sent', {
            controller: this,
            command,
            getResponse: () => promise
        })

        return promise
    }
}

module.exports = Controller
