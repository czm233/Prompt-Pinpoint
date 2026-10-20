const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')

test('Control+1 works without selector initialization and reinjection replaces the previous listener', async () => {
  const keys = new Set(), changes = new Set(), messages = []
  const shortcut = { key: 'Digit1', ctrl: true, meta: false, alt: false, shift: false }
  const context = vm.createContext({
    window: {
      addEventListener(type, listener, capture) { assert.equal(type, 'keydown'); assert.equal(capture, true); keys.add(listener) },
      removeEventListener(_type, listener) { keys.delete(listener) }
    },
    chrome: {
      runtime: { id: 'test', sendMessage: async message => messages.push(message.type) },
      storage: {
        sync: { get: async () => ({ screenshotShortcut: shortcut }) },
        onChanged: { addListener: fn => changes.add(fn), removeListener: fn => changes.delete(fn) }
      }
    }
  })
  const source = fs.readFileSync(require.resolve('../extension/screenshot-shortcut.js'), 'utf8')
  vm.runInContext(source, context); await new Promise(setImmediate)
  vm.runInContext(source, context); await new Promise(setImmediate)
  assert.equal(keys.size, 1); assert.equal(changes.size, 1)
  const press = overrides => keys.forEach(fn => fn({ code: 'Digit1', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, isTrusted: true, repeat: false, isComposing: false, preventDefault() {}, stopImmediatePropagation() {}, ...overrides }))
  press({}); assert.deepEqual(messages, ['CAPTURE_SCREENSHOT'])
  press({ repeat: true }); press({ isTrusted: false }); press({ metaKey: true });
  assert.equal(messages.length, 1)
  changes.forEach(fn => fn({ screenshotShortcut: { newValue: null } }, 'sync'))
  press({}); assert.equal(messages.length, 1)
})
