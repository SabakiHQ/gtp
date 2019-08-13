exports.normalizeVertex = vertex => vertex.trim().toUpperCase()

exports.commandEquals = (cmd1, cmd2) =>
    cmd1.name === cmd2.name
    && (
        cmd1.args.length === cmd2.args.length
        && cmd1.args.every((x, i) => x === cmd2.args[i])
    )

exports.lineSubscribe = function(readable, subscriber) {
    let buffer = ''
    let listener = data => {
        buffer += data.toString().replace(/\r/g, '')

        let newlineIndex = buffer.lastIndexOf('\n')

        if (newlineIndex >= 0) {
            let lines = buffer.slice(0, newlineIndex).split('\n')

            for (let line of lines) {
                subscriber(line)
            }

            buffer = buffer.slice(newlineIndex + 1)
        }
    }

    readable.on('data', listener)
    return () => readable.removeListener('data', listener)
}
