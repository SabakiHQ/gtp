/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports[
  `ControllerStateTracker.test.js TAP queueCommand will send command after syncs are done > must match snapshot 1`
] = `
Array [
  Object {
    "args": Array [],
    "name": "clear_board",
  },
  Object {
    "args": Array [
      "F4",
      "G4",
      "H4",
    ],
    "name": "set_free_handicap",
  },
  Object {
    "args": Array [
      "B",
      "D4",
    ],
    "name": "play",
  },
  Object {
    "args": Array [
      "W",
      "E4",
    ],
    "name": "play",
  },
  Object {
    "args": Array [
      "B",
    ],
    "name": "genmove",
  },
  Object {
    "args": Array [],
    "name": "list_commands",
  },
  Object {
    "args": Array [],
    "name": "undo",
  },
]
`
