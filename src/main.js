const {exec} = require('child_process')

exports.Command = require('./command')
exports.Response = require('./response')
exports.Controller = require('./controller')
exports.StreamController = require('./stream-controller')
exports.Engine = require('./engine')

// System paths are not inherited in macOS
// This is a quick & dirty fix

if (process.platform === 'darwin') {
    exec('/bin/bash -ilc "env; exit"', (err, result) => {
        if (err) return

        let [_, path] = result.trim().split('\n')
            .map(x => x.split('='))
            .find(x => x[0] === 'PATH') || []

        if (path != null) process.env.PATH = path
    })
}
