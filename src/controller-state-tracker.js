const getDefaultState = () => ({
    dirty: true,
    komi: null,
    boardsize: null,
    moves: []
})

const normalizeVertex = vertex => vertex.trim().toLowerCase()
const moveEquals = (move1, move2) =>
    move1.color === move2.color
    && move1.vertex === move2.vertex
    && (move1.vertices == null) === (move2.vertices == null)
    && (
        move1.vertices == null
        || move1.vertices.length === move2.vertices.length
        && move1.vertices.every((x, i) => x === move2.vertices[i])
    )

class ControllerStateTracker {
    constructor(controller) {
        this.metaInfo = {
            name: null,
            version: null,
            protocolVersion: null,
            commands: []
        }

        this.state = getDefaultState()
        this.controller = controller

        controller.on('started', () => {
            Promise.all([
                controller.sendCommand({name: 'name'})
                    .then(response => this.metaInfo.name = response.content),
                controller.sendCommand({name: 'version'})
                    .then(response => this.metaInfo.version = response.content),
                controller.sendCommand({name: 'protocol_version'})
                    .then(response => this.metaInfo.protocolVersion = response.content),
                controller.sendCommand({name: 'list_commands'})
                    .then(response => {
                        this.metaInfo.commands = response.content.split('\n')
                    })
            ]).catch(err => {})
        })

        controller.on('stopped', () => {
            this.state = getDefaultState()
        })

        controller.on('command-sent', async ({command, getResponse, subscribe}) => {
            // Track engine state

            let res = null
            let isGenmoveAnalyzeCommand = command.name.match(/^(\w+-)?genmove_analyze$/)

            if (!isGenmoveAnalyzeCommand) {
                try {
                    res = await getResponse()
                    if (res.error) return
                } catch (err) {
                    return
                }
            }

            if (command.name === 'boardsize' && command.args.length >= 1) {
                this.state.boardsize = +command.args[0]
                this.state.dirty = true
            } else if (command.name === 'clear_board') {
                this.state.moves = []
                this.state.dirty = false
            } else if (command.name === 'komi' && command.args.length >= 1) {
                this.state.komi = +command.args[0]
            } else if (['fixed_handicap', 'place_free_handicap'].includes(command.name)) {
                let vertices = res.content.trim().split(/\s+/).map(normalizeVertex)

                this.state.moves.push({color: 'B', vertices})
            } else if (command.name === 'set_free_handicap') {
                let vertices = command.args.map(normalizeVertex)

                this.state.moves.push({color: 'B', vertices})
            } else if (command.name === 'play' && command.args.length >= 2) {
                let color = command.args[0].trim()[0].toUpperCase() === 'W' ? 'W' : 'B'
                let vertex = normalizeVertex(command.args[1])

                this.state.moves.push({color, vertex})
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

                if (vertex != null) this.state.moves.push({color, vertex})
            } else if (command.name === 'undo') {
                this.state.moves.length--
            } else if (command.name === 'loadsgf') {
                this.state.dirty = true
            }
        })
    }

    async sync(state) {
        let controller = this.controller

        // Update komi

        if (state.komi != null && state.komi !== this.state.komi) {
            let {error} = await controller.sendCommand({name: 'komi', args: [komi]})
            if (error) throw new Error('Komi is not supported by engine')
        }

        // Update boardsize

        if (this.state.dirty || state.boardsize != null && state.boardsize !== this.state.boardsize) {
            let {error} = await controller.sendCommand({name: 'boardsize', args: [state.boardsize]})
            if (error) throw new Error('Board size is not supported by engine')

            this.state.dirty = true
        }

        // Update moves

        let moves = state.moves != null ? state.moves : this.state.moves
        let promises = state.moves.map(({color, vertex, vertices}, i) => {
            if (i === 0 && color === 'B' && vertices != null && vertices.length > 0) {
                return () => controller.sendCommand({name: 'set_free_handicap', args: vertices})
            } else if (vertex != null) {
                return () => controller.sendCommand({name: 'play', args: [color, vertex]})
            }
        }).filter(x => !!x)

        let sharedHistoryLength = [...Array(Math.min(this.state.moves.length, moves.length))]
            .findIndex((_, i) => !moveEquals(moves[i], this.state.moves[i]))
        if (sharedHistoryLength < 0) sharedHistoryLength = Math.min(this.state.moves.length, moves.length)
        let undoLength = this.state.moves.length - sharedHistoryLength

        if (
            !this.state.dirty
            && sharedHistoryLength > 0
            && undoLength < sharedHistoryLength
            && (this.metaInfo.commands.includes('undo') || undoLength === 0)
        ) {
            // Undo until shared history is reached, then play out rest

            promises = [
                ...[...Array(undoLength)].map(() =>
                    () => controller.sendCommand({name: 'undo'})
                ),
                ...promises.slice(sharedHistoryLength)
            ]
        } else {
            // Replay from beginning

            promises.unshift(() => controller.sendCommand({name: 'clear_board'}))
        }

        let result = await Promise.all(
            promises.map(x => x().then(res => !res.error).catch(_ => false))
        )

        let success = result.every(x => x)
        if (!success) {
            throw new Error('Moves cannot be replayed on engine')
        }
    }
}

module.exports = ControllerStateTracker
