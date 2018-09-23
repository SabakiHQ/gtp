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
            'list_commands': Object.keys(this._routes).join('\n'),
            'quit': () => process.exit()
        }
    }

    command(name, handler) {
        this._routes[name] = handler
    }

    start({input = process.stdin, output = process.stdout} = {}) {
        let lineReader = readline.createInterface({input, output, prompt: ''})

        lineReader.on('line', async line => {
            if (line === '') {
                output.write('\n')
                return
            }

            let command = Command.fromString(line)
            this.emit('command-received', {command})

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
                let content = handler.toString()
                handler = (_, {send}) => send(content)
            }

            await new Promise(resolve =>
                handler(command, {
                    write(content) {
                        response.content += content
                    },
                    end() {
                        resolve()
                    },
                    err(content) {
                        response.content = content
                        response.error = true
                        resolve()
                    },
                    send(content) {
                        response.content = content
                        resolve()
                    }
                })
            )

            output.write(Response.toString(response))
            output.write('\n\n')
        })

        lineReader.prompt()
    }
}
