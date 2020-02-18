/* istanbul ignore file */

const EventEmitter = require('events')
const {lineSubscribe} = require('../helper')

module.exports = (() => {
  try {
    let customRequire = eval('require')
    let m = customRequire('readline')
    if (m != null) return m
  } catch (err) {}

  return {
    createInterface({input}) {
      let lineReader = new EventEmitter()

      this._unsubscribe = lineSubscribe(input, line => {
        lineReader.emit('line', line)
      })

      return lineReader
    },
    close() {
      this._unsubscribe()
    },
    prompt() {}
  }
})()
