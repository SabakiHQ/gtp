# @sabaki/gtp [![Build Status](https://travis-ci.org/SabakiHQ/gtp.svg?branch=master)](https://travis-ci.org/SabakiHQ/gtp)

A Node.js module for handling GTP engines.

## Installation

Use npm to install:

~~~
$ npm install @sabaki/gtp
~~~

Then require it as follows:

~~~js
const {Controller, Command, Response} = require('@sabaki/gtp')
~~~

## API
### Command

A GTP command is represented by an object of the following form:

~~~js
{
    id?: Integer | null,
    name: String,
    args?: String[]
}
~~~

#### `Command.fromString(input)`

- `input` `<String>` - The GTP command as string, e.g. `1 genmove B`

Returns a `Command` object, representing `input`.

#### `Command.toString(command)`

- `command` [`<Command>`](#command)

Returns a GTP command string represented by `command` to be sent to an engine.

### Response

A response from a GTP engine is represented by an object of the following form:

~~~js
{
    id?: Integer | null,
    content: String,
    error?: Boolean
}
~~~

#### `Response.fromString(input)`

- `input` `<String>` - The GTP response as string, e.g. `=1 ok`

Returns a `Response` object, representing `input`.

#### `Response.toString(response)`

- `response` [`<Response>`](#response)

Returns a GTP response string represented by `response`, something that an engine might send.

### Controller

`Controller` extends [`EventEmitter`](https://nodejs.org/api/events.html).

#### Constructor
##### `new Controller(path[, args])`

- `path` `<String>` - The path to an executable file, the GTP engine
- `args` `<String[]>` *(optional)* - Additional arguments that are passed to the engine when started

#### Members

- `path` `<String>`
- `args` `<String[]>`
- `process` [`<ChildProcess>`](https://nodejs.org/api/child_process.html) | `null` - The GTP engine process
- `commands` [`<Command[]>`](#command)  - The command queue

#### Events
##### Event: `started`

This event is emitted when the engine process starts.

##### Event: `stopped`

- `evt` `<Object>`
    - `signal` `<String>` - The signal by which the engine process was terminated.

This event is emitted after the engine process ends.

##### Event: `stderr`

- `evt` `<Object>`
    - `content` `<String>`

This event is emitted when the engine process finishes printing a line on stderr.

##### Event: `command-sent`

- `evt` `<Object>`
    - `command` [`<Command>`](#command)
    - `async getResponse()` [`<Response>`](#response)

This event is emitted when a command is sent to the engine.

#### Methods
##### `start()`

Spawns a process of the engine if necessary.

##### `async stop([timeout])`

- `timeout` `<Number>` *(optiona)* - Default: `3000`

Sends a `quit` command to the engine. If engine doesn't respond, it will be killed after `timeout` ms.

##### `kill()`

Kills the engine process.

##### `async sendCommand(command)`

- `command` [`<Command>`](#command)

Sends a command to the engine and returns a [response object](#response).
