const EventEmitter = require('events')
const Controller = require('./controller')
const StreamController = require('./stream-controller')

const getDefaultState = () => ({
    komi: null,
    boardsize: null,
    history: []
})

const normalizeVertex = vertex => vertex.trim().toUpperCase()
const commandEquals = (cmd1, cmd2) =>
    cmd1.name === cmd2.name
    && (
        cmd1.args.length === cmd2.args.length
        && cmd1.args.every((x, i) => x === cmd2.args[i])
    )

class ControllerStateTracker {
    constructor(controller) {
        this.controller = controller
        this.state = getDefaultState()
        this.syncing = false

        this._counter = 0
        this._commands = null
        this._syncFinishedEmitter = new EventEmitter()
        this._syncQueue = []

        controller.on('stopped', () => {
            this.state = getDefaultState()
        })

        controller.on('command-sent', async ({command, getResponse, subscribe}) => {
            // Track engine state

            let res = null
            let isGenmoveAnalyzeCommand = !!command.name.match(/^(\w+-)?genmove_analyze$/)

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
                    this.state.boardsize = +command.args[0]
                    this.state.history = null
                } else if (command.name === 'clear_board') {
                    this.state.history = []
                } else if (command.name === 'komi' && command.args.length >= 1) {
                    this.state.komi = +command.args[0]
                } else if (['fixed_handicap', 'place_free_handicap'].includes(command.name)) {
                    let vertices = res.content.trim().split(/\s+/).map(normalizeVertex)

                    this.state.history.push({name: 'set_free_handicap', args: vertices})
                } else if (command.name === 'set_free_handicap') {
                    let vertices = command.args.map(normalizeVertex)

                    this.state.history.push({name: 'set_free_handicap', args: vertices})
                } else if (command.name === 'play' && command.args.length >= 2) {
                    let color = command.args[0].trim()[0].toUpperCase() === 'W' ? 'W' : 'B'
                    let vertex = normalizeVertex(command.args[1])

                    this.state.history.push({name: 'play', args: [color, vertex]})
                } else if (
                    (command.name === 'genmove' || isGenmoveAnalyzeCommand)
                    && command.args.length >= 1
                ) {
                    let color = command.args[0].trim()[0].toUpperCase() === 'W' ? 'W' : 'B'
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

                    if (vertex != null) this.state.history.push({name: 'play', args: [color, vertex]})
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

    async _startProcessingSyncs() {
        if (this.syncing) return

        this.syncing = true

        while (this._syncQueue.length > 0) {
            let entry = this._syncQueue.shift()
            let eventName = `sync-finished-${entry.id}`

            try {
                await this._sync(entry.state)
                this._syncFinishedEmitter.emit(eventName, {id: entry.id})
            } catch (err) {
                this._syncFinishedEmitter.emit(eventName, {id: entry.id, error: err})
            }
        }

        this.syncing = false
    }

    async _sync(state) {
        let controller = this.controller

        // Update komi

        if (state.komi != null && state.komi !== this.state.komi) {
            let {error} = await controller.sendCommand({name: 'komi', args: [state.komi]})
            if (error) throw new Error('Komi is not supported by engine')
        }

        // Update boardsize

        if (state.boardsize != null && state.boardsize !== this.state.boardsize) {
            let {error} = await controller.sendCommand({name: 'boardsize', args: [state.boardsize]})
            if (error) throw new Error('Board size is not supported by engine')
        }

        // Update history

        if (state.history != null) {
            let commands = [...state.history]
            let maxSharedHistoryLength = Math.min((this.state.history || []).length, commands.length)
            let sharedHistoryLength = [...Array(maxSharedHistoryLength), null]
                .findIndex((_, i) =>
                    i === maxSharedHistoryLength
                    || !commandEquals(commands[i], this.state.history[i])
                )
            let undoLength = (this.state.history || []).length - sharedHistoryLength

            if (
                this.state.history != null
                && sharedHistoryLength > 0
                && undoLength < sharedHistoryLength
                && (undoLength === 0 || await this.knowsCommand('undo'))
            ) {
                // Undo until shared history is reached, then play out rest

                commands = [
                    ...[...Array(undoLength)].map(() => ({name: 'undo'})),
                    ...commands.slice(sharedHistoryLength)
                ]
            } else {
                // Replay from beginning

                commands.unshift({name: 'clear_board'})
            }

            let result = await Promise.all(
                commands.map(command =>
                    controller.sendCommand(command)
                    .then(res => !res.error)
                    .catch(_ => false)
                )
            )

            let success = result.every(x => x)
            if (!success) {
                throw new Error('History cannot be replayed on engine')
            }
        }
    }

    async sync(state) {
        let id = this._counter++

        this._syncQueue.push({id, state})
        this._startProcessingSyncs()

        await new Promise((resolve, reject) => {
            this._syncFinishedEmitter.once(`sync-finished-${id}`, evt => {
                return evt.error != null ? reject(evt.error) : resolve()
            })
        })
    }
}

ControllerStateTracker.fromController = (...args) => {
    return new ControllerStateTracker(new Controller(...args))
}

ControllerStateTracker.fromStreamController = (...args) => {
    return new ControllerStateTracker(new StreamController(...args))
}

module.exports = ControllerStateTracker
