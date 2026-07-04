const t = require('tap')
const {prepareSpawn} = require('..')

const comspec = process.env.comspec || 'cmd.exe'

t.test('prepareSpawn', async t => {
  t.test('leaves non-Windows platforms untouched', async t => {
    for (let platform of ['darwin', 'linux']) {
      let command = '/usr/bin/katago'
      let args = ['gtp', '-config', 'my config.cfg']
      let options = {cwd: '/home/user'}
      let result = prepareSpawn(command, args, options, platform)

      // Byte-for-byte identical, and the very same references (no cloning).
      t.equal(result.command, command, `${platform}: command unchanged`)
      t.equal(result.args, args, `${platform}: args unchanged (same ref)`)
      t.equal(
        result.options,
        options,
        `${platform}: options unchanged (same ref)`
      )

      // Even a .bat path is left alone off Windows.
      let batResult = prepareSpawn('/x/y.bat', ['a b'], options, platform)
      t.equal(batResult.command, '/x/y.bat', `${platform}: .bat unchanged`)
      t.same(batResult.args, ['a b'], `${platform}: .bat args unchanged`)
      t.notOk(
        batResult.options.windowsVerbatimArguments,
        `${platform}: no windowsVerbatimArguments`
      )
    }
  })

  t.test(
    'leaves Windows .exe and extensionless commands untouched',
    async t => {
      let options = {cwd: 'C:\\e'}

      let exe = prepareSpawn(
        'C:\\engines\\katago.exe',
        ['--gtp'],
        options,
        'win32'
      )
      t.equal(exe.command, 'C:\\engines\\katago.exe')
      t.equal(exe.args, exe.args) // same ref preserved
      t.same(exe.args, ['--gtp'])
      t.equal(exe.options, options)
      t.notOk(exe.options.windowsVerbatimArguments)

      let plain = prepareSpawn('katago', ['--gtp'], {}, 'win32')
      t.equal(plain.command, 'katago')
      t.same(plain.args, ['--gtp'])
    }
  )

  t.test('wraps Windows .bat through cmd.exe', async t => {
    let options = {cwd: 'C:\\e'}
    let result = prepareSpawn(
      'C:\\engines\\katago.bat',
      ['--gtp'],
      options,
      'win32'
    )

    t.equal(result.command, comspec, 'runs via cmd.exe/comspec')
    t.same(result.args, [
      '/d',
      '/s',
      '/c',
      '"C:\\engines\\katago.bat ^"--gtp^""'
    ])
    t.equal(result.options.windowsVerbatimArguments, true)
    t.equal(result.options.cwd, 'C:\\e', 'preserves cwd')
  })

  t.test('wraps Windows .cmd through cmd.exe', async t => {
    let result = prepareSpawn(
      'C:\\engines\\gnugo.cmd',
      [],
      {cwd: 'C:\\e'},
      'win32'
    )

    t.equal(result.command, comspec)
    t.same(result.args, ['/d', '/s', '/c', '"C:\\engines\\gnugo.cmd"'])
    t.equal(result.options.windowsVerbatimArguments, true)
    t.equal(result.options.cwd, 'C:\\e')
  })

  t.test('matches the extension case-insensitively', async t => {
    let result = prepareSpawn('C:\\engines\\Katago.BAT', [], {}, 'win32')

    t.equal(result.command, comspec)
    t.same(result.args, ['/d', '/s', '/c', '"C:\\engines\\Katago.BAT"'])
    t.equal(result.options.windowsVerbatimArguments, true)
  })

  t.test('quotes arguments and command paths containing spaces', async t => {
    let result = prepareSpawn(
      'C:\\Program Files\\katago\\katago.bat',
      ['--config', 'my config.cfg'],
      {cwd: 'C:\\e'},
      'win32'
    )

    t.equal(result.command, comspec)
    t.same(result.args, [
      '/d',
      '/s',
      '/c',
      '"C:\\Program^ Files\\katago\\katago.bat ^"--config^" ^"my^ config.cfg^""'
    ])
  })

  t.test('escapes embedded double quotes in arguments', async t => {
    let result = prepareSpawn('C:\\e\\k.bat', ['say "hi"'], {}, 'win32')

    t.same(result.args, [
      '/d',
      '/s',
      '/c',
      '"C:\\e\\k.bat ^"say^ \\^"hi\\^"^""'
    ])
  })

  t.test('normalizes posix separators in the command path', async t => {
    let result = prepareSpawn('C:/engines/k.bat', ['a'], {}, 'win32')

    t.same(result.args, ['/d', '/s', '/c', '"C:\\engines\\k.bat ^"a^""'])
  })

  t.test(
    'double-escapes metachars for node_modules/.bin cmd-shims',
    async t => {
      let result = prepareSpawn(
        'C:\\proj\\node_modules\\.bin\\gtp2ogs.cmd',
        ['--foo bar'],
        {},
        'win32'
      )

      t.same(result.args, [
        '/d',
        '/s',
        '/c',
        '"C:\\proj\\node_modules\\.bin\\gtp2ogs.cmd ^^^"--foo^^^ bar^^^""'
      ])
    }
  )

  t.test('does not mutate the caller-supplied args or options', async t => {
    let args = ['--gtp', 'a b']
    let options = {cwd: 'C:\\e'}

    prepareSpawn('C:\\e\\k.bat', args, options, 'win32')

    t.same(args, ['--gtp', 'a b'], 'args array untouched')
    t.same(options, {cwd: 'C:\\e'}, 'options object untouched')
    t.notOk(
      'windowsVerbatimArguments' in options,
      'no windowsVerbatimArguments leaked onto the original options'
    )
  })

  t.test('does not double-wrap when the caller opted into a shell', async t => {
    let options = {cwd: 'C:\\e', shell: true}
    let result = prepareSpawn('C:\\e\\k.bat', ['--gtp'], options, 'win32')

    t.equal(result.command, 'C:\\e\\k.bat', 'left to Node shell handling')
    t.same(result.args, ['--gtp'])
    t.equal(result.options, options)
  })
})
