/* istanbul ignore file */

module.exports = (() => {
  try {
    let customRequire = eval('require')
    let m = customRequire('child_process')
    if (m != null) return m
  } catch (err) {
    let throwErr = () => {
      throw new Error('This feature is not supported outside Node environment')
    }

    return {
      spawn: throwErr,
      exec: throwErr
    }
  }
})()
