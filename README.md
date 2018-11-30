# @sabaki/gtp [![Build Status](https://travis-ci.org/SabakiHQ/gtp.svg?branch=master)](https://travis-ci.org/SabakiHQ/gtp)

A Node.js module for handling GTP engines.

## Installation

Use npm to install:

~~~
$ npm install @sabaki/gtp
~~~

## Usage
### Controller Usage

Use the [`Controller`](#controller) class to interact with an engine:

~~~js
const {StreamController, Controller, Command, Response} = require('@sabaki/gtp')

async function main() {
    let leela = new Controller('./path/to/leela', ['--gtp', '--noponder'])
    leela.start()

    let response = null

    try {
        response = await leela.sendCommand({name: 'genmove', args: ['B']})
    } catch (err) {
        throw new Error('Failed to send command!')
    }

    if (response.error) {
        throw new Error('Command not understood by Leela!')
    }

    console.log(response.content)
    await leela.stop()
}

main().catch(err => console.log(`Error: ${err}`))
~~~

### Engine Usage

Use the [`Engine`](#engine) class to create an engine:

~~~js
const {Engine} = require('@sabaki/gtp')

let testEngine = new Engine('Test Engine', '0.1')

testEngine.command('play', (command, out) => {
    if (command.args.length === 0) return out.err('player not specified')
    out.send('playing for ' + command.args[0])
})

testEngine.start()
~~~

## API
### Command

A GTP command is represented by an object of the following form:

~~~js
{
    id?: <Integer> | null,
    name: <String>,
    args?: <String[]>
}
~~~

#### `Command.fromString(input)`

- `input` `<String>` - The GTP command as string, e.g. `1 genmove B`

Returns a `Command` object, representing `input`.

#### `Command.toString(command)`

- `command` [`<Command>`](#command)

Returns a GTP command string represented by `command` to be sent to an engine.

---

### Response

A response from a GTP engine is represented by an object of the following form:

~~~js
{
    id?: <Integer> | null,
    content: <String>,
    error?: <Boolean>
}
~~~

#### `Response.fromString(input)`

- `input` `<String>` - The GTP response as string, e.g. `=1 ok`

Returns a `Response` object, representing `input`.

#### `Response.toString(response)`

- `response` [`<Response>`](#response)

Returns a GTP response string represented by `response`, something that an engine might send.

---

### StreamController

`SteamController` extends [`EventEmitter`](https://nodejs.org/api/events.html). Use this class to control GTP engines on arbitrary communication channels. To spawn engine processes automatically, use [`Controller`](#controller).

#### `new StreamController(input, output)`

- `input` [`<Writable>`](https://nodejs.org/api/stream.html#stream_class_stream_writable)
- `output` [`<Readable>`](https://nodejs.org/api/stream.html#stream_class_stream_readable)

#### Event: `command-sent`

- `evt` `<Object>`
    - `command` [`<Command>`](#command)
    - `subscribe(subscriber)`
    - `async getResponse()` [`<Response>`](#response)

This event is emitted when a command is sent to the engine. Using the `subscribe` function you can get updates every time the engine responds with a new line, see [streamController.sendCommand()](#async-streamcontrollersendcommandcommand-subscriber).

#### `streamController.input`

[`<Writable>`](https://nodejs.org/api/stream.html#stream_class_stream_writable) - The input stream of the GTP engine.

#### `streamController.output`

[`<Readable>`](https://nodejs.org/api/stream.html#stream_class_stream_readable) - The output stream of the GTP engine.

#### `streamController.commands`

[`<Command[]>`](#command) - The command queue.

#### `async streamController.sendCommand(command[, subscriber])`

- `command` [`<Command>`](#command)
- `subscriber` `<Function>` *(optional)*
    - `evt` `<Object>`

Sends a command to the engine and returns a [response object](#response). You can pass a `subscriber` function to get updates every time the engine responds with a new line. `subscriber` is called with an object `evt` with the following properties:

- `line` `<String>` - The contents of the incoming line.
- `end` `<Boolean>` - `true` if incoming line is the last line of response.
- `command` [`<Command>`](#command) - The command to which the response belongs.
- `response` [`<Response>`](#response) - The partial response until the incoming line with all the previous lines.

---

### Controller

`Controller` extends [`EventEmitter`](https://nodejs.org/api/events.html). Use this class to spawn GTP engine processes and control them over `stdin` and `stdout`.

#### `new Controller(path[, args[, spawnOptions]])`

- `path` `<String>`
- `args` `<String[]>` *(optional)*
- `spawnOptions` `<Object>` *(optional)* - See [Node.js documentation](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options).

#### Event: `started`

This event is emitted when the engine process starts.

#### Event: `stopped`

- `evt` `<Object>`
    - `signal` `<String>` - The signal by which the engine process was terminated.

This event is emitted after the engine process ends.

#### Event: `stderr`

- `evt` `<Object>`
    - `content` `<String>`

This event is emitted when the engine process finishes printing a line on stderr.

#### Event: `command-sent`

See [corresponding event in `StreamController`](#event-command-sent).

#### `controller.path`

`<String>` - The path to an executable file, the GTP engine.

#### `controller.args`

`<String[]>` - Additional arguments that are passed to the engine when started.

#### `controller.spawnOptions`

`<Object>` - See [Node.js documentation](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options).

#### `controller.process`

[`<ChildProcess>`](https://nodejs.org/api/child_process.html) | `null` - The GTP engine process.

#### `controller.commands`

[`<Command[]>`](#command) - The command queue.

#### `controller.start()`

Spawns a process of the engine if necessary.

#### `async controller.stop([timeout])`

- `timeout` `<Number>` *(optional)* - Default: `3000`

Sends a `quit` command to the engine. If engine doesn't respond, it will be killed after `timeout` ms.

#### `controller.kill()`

Kills the engine process.

#### `async controller.sendCommand(command[, subscriber])`

See [corresponding function in `StreamController`](#async-streamcontrollersendcommandcommand-subscriber).

---

### Engine

`Engine` extends [`EventEmitter`](https://nodejs.org/api/events.html). Use this class to create a GTP engine using the communication channels of your choice.

#### `new Engine([name[, version]])`

- `name` `<String>` *(optional)*
- `version` `<String>` *(optional)*

The following GTP commands have a default implementation:

- `protocol_version`
- `name`
- `version`
- `list_commands`
- `quit`

#### Event: `command-received`

- `evt` `<Object>`
    - `command` [`<Command>`](#command)

This event is emitted after a command has been received.

#### Event: `command-processing`

- `evt` `<Object>`
    - `command` [`<Command>`](#command)

This event is emitted when a command is about to be processed.

#### Event: `command-processed`

- `evt` `<Object>`
    - `command` [`<Command>`](#command)
    - `response` [`<Response>`](#response)

This event is emitted after a command has been processed.

#### `engine.handlers`

`<Object>` - An object with the command names as keys, and handler functions as values.

#### `engine.commands`

[`<Command[]>`](#command) - The command queue.

#### `engine.busy`

`<Boolean>` - If `true`, a command is being processed right now.

#### `engine.command(name, handler)`

- `name` `<String>` - The command name.
- `handler` `<Function>` | `<String>`

Sets a handler for the given command. `handler` will be called with the following arguments:

- `command` [`<Command>`](#command)
- `out` `<Object>`
    - `send(content)` - Sends a successful response with the given content.
    - `err(content)` - Sends an error response with the given content.
    - `write(content)` - Writes given content to response.
    - `end(content)` - When using `write`, use this function to specify end of response.

You can pass a string as `handler` to immediately return a response as well.

#### `engine.start([options])`

- `options` `<Object>` *(optional)*
    - `input` [`<Readable>`](https://nodejs.org/api/stream.html#stream_class_stream_readable) *(optional)* - Default: `process.stdin`
    - `output` [`<Writable>`](https://nodejs.org/api/stream.html#stream_class_stream_writable) *(optional)* - Default: `process.stdout`

Starts listening to commands.
