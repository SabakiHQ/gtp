exports.fromString = function(input) {
  input = input.replace(/#.*?$/, '').trim()

  let inputs = input.split(/\s+/)
  let id = parseInt(inputs[0], 10)

  if (!isNaN(id) && id + '' === inputs[0]) inputs.shift()
  else id = null

  let [name, ...args] = inputs
  return {id, name, args}
}

exports.toString = function({id = null, name, args = []}) {
  return `${id != null ? id : ''} ${name} ${args.join(' ')}`.trim()
}
