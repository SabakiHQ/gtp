module.exports = function(readable, subscriber) {
    let buffer = ''

    readable.on('data', data => {
        buffer += data.toString().replace(/\r/g, '')

        let newlineIndex = buffer.lastIndexOf('\n')

        if (newlineIndex >= 0) {
            let lines = buffer.slice(0, newlineIndex).split('\n')

            for (let line of lines) {
                subscriber(line)
            }

            buffer = buffer.slice(newlineIndex + 1)
        }
    })
}
