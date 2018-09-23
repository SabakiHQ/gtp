const EventEmitter = require('events')
const readline = require('readline')
const {Command, Response} = require('./main')

module.exports = class Engine extends EventEmitter {
    constructor() {
        super()

        this._routes = {
            'protocol_version': '2',
            'name': '',
            'version': '',
            'list_commands': (_, {send}) => send(Object.keys(this._routes).join('\n')),
            'quit': (_, {end}) => (end(), process.exit())
        }

        this.commands = []
        this.busy = false
    }

    command(name, handler) {
        this._routes[name] = handler
    }

    async processCommands({output = process.stdout} = {}) {
        if (this.commands.length === 0 || this.busy) return

        let command = this.commands.shift()
        this.busy = true

        if (!(command.name in this._routes)) {
            output.write(Response.toString({
                id: command.id,
                error: true,
                content: 'unknown command'
            }))
            output.write('\n\n')

            return
        }

        let handler = this._routes[command.name]
        let response = {id: command.id, content: ''}

        if (typeof handler !== 'function') {
            let content = handler ? handler.toString() : ''
            handler = (_, {send}) => send(content)
        }

        let notWritten = true
        let write = await new Promise(resolve => handler(command, {
            write(content) {
                if (notWritten) {
                    output.write(Response.toString(response) + ' ')
                    notWritten = false
                }

                response.content += content
                output.write(content)
            },
            end() {
                if (notWritten) {
                    output.write(Response.toString(response) + ' ')
                    notWritten = false
                }

                output.write('\n\n')
                resolve(false)
            },
            err(content) {
                response.content = content
                response.error = true
                resolve(true)
            },
            send(content) {
                response.content = content
                resolve(true)
            }
        }))

        if (write) {
            output.write(Response.toString(response))
            output.write('\n\n')
        }

        this.busy = false
        await this.processCommands({output})
    }

    start({input = process.stdin, output = process.stdout} = {}) {
        let lineReader = readline.createInterface({input, output, prompt: ''})

        lineReader.on('line', line => {
            if (line === '') {
                output.write('\n')
                return
            }

            let command = Command.fromString(line)
            this.commands.push(command)

            this.emit('command-received', {command})
            this.processCommands({output})
        })

        lineReader.prompt()
    }
}
