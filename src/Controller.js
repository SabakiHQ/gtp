const EventEmitter = require('events')
const {spawn, exec} = require('./ponyfills/child_process')
const {StreamController} = require('./main')
const {lineSubscribe} = require('./helper')
const {prepareSpawn} = require('./spawn')

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

    let {command, args, options} = prepareSpawn(
      this.path,
      this.args,
      this.spawnOptions
    )
    let child = spawn(command, args, options)

    this.process = child

    this._unsubscribeStderr = lineSubscribe(child.stderr, line => {
      this.emit('stderr', {content: line})
    })

    let stopped = ({code = null, signal = null, error = null}) => {
      if (this.process !== child) return

      this._unsubscribeStderr()
      if (this._streamController != null) this._streamController.close()
      child.stdin.destroy()
      child.stdout.destroy()

      this._streamController = null
      this.process = null

      this.emit('stopped', {code, signal, error})
    }

    // A failed spawn emits 'error' and 'close' but never 'exit', so this is the
    // only chance to release the process and report why it never came up.
    child.once('error', error => {
      if (this.listenerCount('error') > 0) this.emit('error', error)
      stopped({error})
    })

    child.once('exit', (code, signal) => stopped({code, signal}))

    this._streamController = new StreamController(child.stdin, child.stdout)
    this._streamController.on('command-sent', evt =>
      this.emit('command-sent', evt)
    )
    this._streamController.on('response-received', evt =>
      this.emit('response-received', evt)
    )

    child.once('spawn', () => this.emit('started'))
  }

  async stop(timeout = 3000) {
    if (this.process == null) return

    return await new Promise(async resolve => {
      this.once('stopped', resolve)

      let timeoutId = setTimeout(() => this.kill(), timeout)

      try {
        let response = await this.sendCommand({name: 'quit'})
        if (response.error) throw new Error(response.content)
      } catch (err) {
        this.kill()
      }

      clearTimeout(timeoutId)
    })
  }

  async kill() {
    if (this.process == null) return

    return await new Promise(resolve => {
      this.once('stopped', resolve)

      this.process.kill()
    })
  }

  async sendCommand(command, subscriber = () => {}) {
    if (this.process == null) this.start()

    return await this._streamController.sendCommand(command, subscriber)
  }
}

module.exports = Controller
