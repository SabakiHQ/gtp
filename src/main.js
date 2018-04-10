const {exec} = require('child_process')

const Command = exports.Command = require('./command')
const Response = exports.Response = require('./response')
const Controller = exports.Controller = require('./controller')

// System paths are not inherited in macOS
// This is a quick & dirty fix

if (process.platform === 'darwin') {
    exec('/bin/bash -ilc "env; exit"', (err, result) => {
        if (err) return

        process.env.PATH = result.trim().split('\n')
            .map(x => x.split('='))
            .find(x => x[0] === 'PATH')[1]
    })
}
