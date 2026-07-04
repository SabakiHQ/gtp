const path = require('path')

// Since Node.js 18.20.2 / 20.12.2 / 21.7.2 (CVE-2024-27980), child_process.spawn
// on Windows refuses to run a .bat/.cmd file unless it is invoked through a shell;
// it throws EINVAL otherwise. Batch files therefore have to be launched via
// cmd.exe. prepareSpawn() rewrites the (command, args, options) tuple for that
// case and leaves every other case -- all non-Windows platforms, and Windows
// .exe/extensionless commands -- completely untouched.
//
// The cmd.exe argument-escaping below is a faithful port of the battle-tested
// logic in cross-spawn 7 (https://github.com/moxystudio/node-cross-spawn, MIT).
// Keeping it inline avoids adding a runtime dependency to this otherwise
// dependency-free package. See tests/spawn.test.js, which cross-checks it against
// cross-spawn's own escape functions.

// cmd.exe metacharacters -- see http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g
const isBatchRegExp = /\.(?:bat|cmd)$/i
// Matches an npm cmd-shim in node_modules/.bin: those proxy through an extra
// cmd.exe, so their metachars must be double-escaped.
const isCmdShimRegExp = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i

function escapeCommand(arg) {
  // Escape meta chars
  return arg.replace(metaCharsRegExp, '^$1')
}

function escapeArgument(arg, doubleEscapeMetaChars) {
  // Convert to string
  arg = `${arg}`

  // Sequence of backslashes followed by a double quote: double up all the
  // backslashes and escape the double quote.
  arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"')

  // Sequence of backslashes followed by the end of the string (which will
  // become a double quote later): double up all the backslashes.
  arg = arg.replace(/(?=(\\+?)?)\1$/, '$1$1')

  // Quote the whole thing.
  arg = `"${arg}"`

  // Escape meta chars.
  arg = arg.replace(metaCharsRegExp, '^$1')

  // Double escape meta chars if necessary.
  if (doubleEscapeMetaChars) {
    arg = arg.replace(metaCharsRegExp, '^$1')
  }

  return arg
}

// Returns the exact {command, args, options} tuple to hand to child_process.spawn.
// Pure and side-effect free, so the Windows path is unit-testable on any host.
function prepareSpawn(
  command,
  args = [],
  options = {},
  platform = process.platform
) {
  // Every non-Windows platform spawns exactly as before.
  if (platform !== 'win32') {
    return {command, args, options}
  }

  // Only .bat/.cmd files are affected; .exe and extensionless commands still
  // spawn directly, and if the caller already opted into a shell, Node handles
  // the batch file itself -- don't double-wrap.
  if (!isBatchRegExp.test(command) || options.shell) {
    return {command, args, options}
  }

  // Normalize posix separators into Windows ones (foo/bar.bat -> foo\bar.bat),
  // otherwise cmd.exe fails to find the file. Use the win32 variant explicitly
  // so the result is correct even when this runs on a non-Windows host.
  const normalizedCommand = path.win32.normalize(command)
  const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(normalizedCommand)

  const escapedCommand = escapeCommand(normalizedCommand)
  const escapedArgs = args.map(arg =>
    escapeArgument(arg, needsDoubleEscapeMetaChars)
  )
  const shellCommand = [escapedCommand].concat(escapedArgs).join(' ')

  return {
    command: process.env.comspec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${shellCommand}"`],
    // Tell Node's spawn that the arguments are already escaped.
    options: {...options, windowsVerbatimArguments: true}
  }
}

module.exports = {prepareSpawn, escapeCommand, escapeArgument}
