exports.fromString = function(input) {
    input = input.replace(/\t/g, ' ').trim()

    let error = input[0] !== '='
    let hasId = input.length >= 2 && input[1] !== ' '

    input = input.slice(1)
    let id = hasId ? +input.split(' ')[0] : null

    if (hasId) input = input.slice((id + '').length)
    return {id, content: input.trim(), error}
}

exports.toString = function({id = null, content, error = false}) {
    return `${error ? '?' : '='}${id != null ? id : ''} ${content}`.trim()
}
