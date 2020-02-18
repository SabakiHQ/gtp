exports.fromString = function(input) {
  input = input.replace(/\t/g, ' ').trim()
  if (input.length === 0 || !'=?'.includes(input[0]))
    return {id: null, content: '', error: false}

  let error = input[0] !== '='
  let hasId = input.length >= 2 && input[1].match(/\d/) != null

  input = input.slice(1)
  let id = hasId ? +input.split(/\s/)[0] : null

  if (hasId && !isNaN(id)) input = input.slice((id + '').length)
  return {id, content: input.trim(), error}
}

exports.toString = function({id = null, content, error = false}) {
  return `${error ? '?' : '='}${id != null ? id : ''} ${
    content ? content : ''
  }`.trim()
}
