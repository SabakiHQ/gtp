const EventEmitter = require('events')
const {StreamController, Controller} = require('./main')
const {normalizeVertex} = require('./helper')

const commandEquals = (cmd1, cmd2) =>
  cmd1.name === cmd2.name &&
  cmd1.args.length === cmd2.args.length &&
  cmd1.args.every(
    (x, i) => normalizeVertex(x) === normalizeVertex(cmd2.args[i])
  )

const getDefaultState = () => ({
  komi: null,
  boardsize: null,
  timeSettings: null,
  history: []
})

class ControllerStateTracker {
  constructor(controller) {
    this.controller = controller
    this.state = getDefaultState()
    this.syncing = false

    this._counter = 0
    this._commands = null
    this._queueItemFinishedEmitter = new EventEmitter()
    this._queue = []

    controller.on('stopped', () => {
      this.state = getDefaultState()
    })

    controller.on('command-sent', async ({command, getResponse, subscribe}) => {
      // Track engine state

      let res = null
      let isGenmoveAnalyzeCommand = !!command.name.match(
        /^(\w+-)?genmove_analyze$/
      )

      if (!isGenmoveAnalyzeCommand) {
        try {
          res = await getResponse()
          if (res.error) return
        } catch (err) {
          return
        }
      }

      try {
        if (command.name === 'list_commands') {
          this._commands = res.content.split('\n').map(x => x.trim())
        } else if (command.name === 'boardsize' && command.args.length >= 1) {
          this.state.boardsize = Array(2).fill(+command.args[0])
          this.state.history = null
        } else if (
          command.name === 'rectangular_boardsize' &&
          command.args.length >= 2
        ) {
          this.state.boardsize = command.args.slice(0, 2).map(x => +x)
          this.state.history = null
        } else if (command.name === 'clear_board') {
          this.state.history = []
        } else if (command.name === 'komi' && command.args.length >= 1) {
          this.state.komi = +command.args[0]
        } else if (
          command.name === 'time_settings' &&
          command.args.length >= 3
        ) {
          this.state.timeSettings = {
            mainTime: +command.args[0],
            byoyomiTime: +command.args[1],
            byoyomiStones: +command.args[2]
          }
        } else if (
          ['fixed_handicap', 'place_free_handicap'].includes(command.name)
        ) {
          let vertices = res.content
            .trim()
            .split(/\s+/)
            .map(normalizeVertex)

          this.state.history.push({name: 'set_free_handicap', args: vertices})
        } else if (command.name === 'set_free_handicap') {
          let vertices = command.args.map(normalizeVertex)

          this.state.history.push({name: 'set_free_handicap', args: vertices})
        } else if (command.name === 'play' && command.args.length >= 2) {
          let color =
            command.args[0].trim()[0].toUpperCase() === 'W' ? 'W' : 'B'
          let vertex = normalizeVertex(command.args[1])

          this.state.history.push({name: 'play', args: [color, vertex]})
        } else if (
          (command.name === 'genmove' || isGenmoveAnalyzeCommand) &&
          command.args.length >= 1
        ) {
          let color =
            command.args[0].trim()[0].toUpperCase() === 'W' ? 'W' : 'B'
          let vertex = !isGenmoveAnalyzeCommand
            ? normalizeVertex(res.content)
            : await new Promise(resolve => {
                getResponse()
                  .then(() => resolve(null))
                  .catch(() => resolve(null))

                subscribe(({line}) => {
                  let match = line.trim().match(/^play\s+(.*)$/)
                  if (match) resolve(normalizeVertex(match[1]))
                })
              })

          if (vertex !== 'RESIGN') {
            this.state.history.push({name: 'play', args: [color, vertex]})
          }
        } else if (command.name === 'undo') {
          this.state.history.length--
        } else if (command.name === 'loadsgf') {
          this.state.komi = null
          this.state.boardsize = null
          this.state.history = null
        }
      } catch (err) {
        // Silently ignore
      }
    })
  }

  async knowsCommand(commandName) {
    if (this._commands == null) {
      await this.controller.sendCommand({name: 'list_commands'})
    }

    return this._commands.includes(commandName)
  }

  async _addToQueue(item) {
    let id = this._counter++

    return await new Promise((resolve, reject) => {
      this._queueItemFinishedEmitter.once(`item-finished-${id}`, evt => {
        return evt.error != null ? reject(evt.error) : resolve(evt.result)
      })

      this._queue.push({...item, id})
      this._startProcessingQueue()
    })
  }

  async _startProcessingQueue() {
    if (this.syncing) return
    this.syncing = true

    while (this._queue.length > 0) {
      let {type, id, args} = this._queue.shift()
      let eventName = `item-finished-${id}`

      try {
        let result

        if (type === 'sync') {
          result = await this._sync(...args)
        } else if (type === 'command') {
          result = await this.controller.sendCommand(...args)
        }

        this._queueItemFinishedEmitter.emit(eventName, {id, result})
      } catch (err) {
        this._queueItemFinishedEmitter.emit(eventName, {id, error: err})
      }
    }

    this.syncing = false
  }

  async queueCommand(...args) {
    return await this._addToQueue({type: 'command', args})
  }

  async _sync(state) {
    let controller = this.controller

    // Update komi

    if (state.komi != null && state.komi !== this.state.komi) {
      let {error} = await controller.sendCommand({
        name: 'komi',
        args: [`${state.komi}`]
      })
      if (error) throw new Error('Komi is not supported by engine')
    }

    // Update boardsize

    if (
      state.boardsize != null &&
      (this.state.boardsize == null ||
        state.boardsize[0] !== this.state.boardsize[0] ||
        state.boardsize[1] !== this.state.boardsize[1])
    ) {
      let response = await controller.sendCommand(
        state.boardsize[0] === state.boardsize[1]
          ? {
              name: 'boardsize',
              args: [`${state.boardsize[0]}`]
            }
          : {
              name: 'rectangular_boardsize',
              args: state.boardsize.map(x => `${x}`)
            }
      )

      if (response.error)
        throw new Error('Board size is not supported by engine')
    }

    // Update timeSettings

    if (
      state.timeSettings != null &&
      (this.state.timeSettings == null ||
        state.timeSettings.mainTime !== this.state.timeSettings.mainTime ||
        state.timeSettings.byoyomiTime !==
          this.state.timeSettings.byoyomiTime ||
        state.timeSettings.byoyomiStones !==
          this.state.timeSettings.byoyomiStones)
    ) {
      let {error} = await controller.sendCommand({
        name: 'time_settings',
        args: [
          `${state.timeSettings.mainTime}`,
          `${state.timeSettings.byoyomiTime}`,
          `${state.timeSettings.byoyomiStones}`
        ]
      })
      if (error) throw new Error('Time settings are not supported by engine')
    }

    // Update history

    if (state.history != null) {
      let commands = [...state.history]
      let maxSharedHistoryLength = Math.min(
        (this.state.history || []).length,
        commands.length
      )
      let sharedHistoryLength = Array(maxSharedHistoryLength + 1).findIndex(
        (_, i) =>
          i === maxSharedHistoryLength ||
          !commandEquals(commands[i], this.state.history[i])
      )
      let undoLength = (this.state.history || []).length - sharedHistoryLength
      let commandSuccessful = command =>
        controller
          .sendCommand(command)
          .then(res => !res.error)
          .catch(_ => false)

      if (
        this.state.history != null &&
        sharedHistoryLength > 0 &&
        undoLength < sharedHistoryLength &&
        (undoLength === 0 || (await this.knowsCommand('undo')))
      ) {
        // Undo until shared history is reached, then play out rest

        let undoCommands = [
          ...Array(undoLength).fill({name: 'undo'}),
          ...commands.slice(sharedHistoryLength)
        ]

        let result = await Promise.all(undoCommands.map(commandSuccessful))

        let success = result.every(x => x)
        if (success) return
      }

      // Replay from beginning

      commands.unshift({name: 'clear_board'})

      let result = await Promise.all(commands.map(commandSuccessful))

      let success = result.every(x => x)
      if (!success) {
        throw new Error('History cannot be replayed on engine')
      }
    }
  }

  async sync(state) {
    return await this._addToQueue({type: 'sync', args: [state]})
  }
}

ControllerStateTracker.fromController = (...args) => {
  return new ControllerStateTracker(new Controller(...args))
}

ControllerStateTracker.fromStreamController = (...args) => {
  return new ControllerStateTracker(new StreamController(...args))
}

module.exports = ControllerStateTracker
