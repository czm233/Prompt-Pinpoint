const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')

function setup({ switched = false, captureError = false, fallback = false, copyError = false } = {}) {
  const listeners = []
  const calls = { captures: 0, copies: 0, closed: 0, badges: [], events: [] }
  const event = () => ({ addListener() {} })
  const noop = async () => {}
  let queryCount = 0
  const chrome = {
    permissions: { onAdded: event() },
    storage: { onChanged: event(), session: { remove: noop }, local: { set: noop, remove: noop } },
    runtime: {
      onMessage: { addListener(fn) { listeners.push(fn) } }, onInstalled: event(),
      getURL: path => `chrome-extension://test/${path}`,
      getManifest: () => ({ action: { default_title: 'Selector' } })
    },
    action: { onClicked: event(), setBadgeText: async ({ text }) => calls.badges.push(text), setBadgeBackgroundColor: noop, setTitle: noop },
    commands: { onCommand: event() },
    contextMenus: { onClicked: event() },
    webNavigation: { onCommitted: event() },
    tabs: {
      onRemoved: event(), onUpdated: event(),
      sendMessage: async (_id, message) => {
        calls.events.push(message.type === 'PREPARE_SCREENSHOT' ? 'hide-preview' : message.success ? 'success-preview' : 'error-preview')
        return {}
      },
      query: async () => [{ id: switched && ++queryCount > 1 ? 2 : 1 }],
      captureVisibleTab: async (windowId, options) => {
        calls.events.push('capture'); calls.captures++; assert.equal(windowId, 7); assert.equal(options.format, 'png')
        if (captureError) throw new Error('capture denied')
        return 'data:image/png;base64,test'
      }
    },
    scripting: { executeScript: async (args) => {
      if (args.files) return []
      calls.events.push('copy'); calls.copies++
      if (fallback) throw new Error('Restricted page')
      return [{ result: true }]
    } },
    windows: {
      create: async () => {
        const handler = listeners.at(-1)
        let data
        handler({ target: 'screenshot-clipboard', type: 'READY' }, { url: 'chrome-extension://test/clipboard.html' }, value => { data = value })
        assert.equal(data.dataUrl, 'data:image/png;base64,test')
        handler({ target: 'screenshot-clipboard', type: 'RESULT', success: !copyError, error: 'copy denied' }, { url: 'chrome-extension://test/clipboard.html' }, () => {})
        return { id: 8 }
      },
      remove: async id => { assert.equal(id, 8); calls.closed++ }
    }
  }
  const context = vm.createContext({ importScripts() {}, PinpointI18n: { t: (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? ''), ready: Promise.resolve(), onChange() {} }, chrome, console: { log() {} }, setTimeout: () => 1, clearTimeout() {} })
  vm.runInContext(fs.readFileSync(require.resolve('../extension/background.js'), 'utf8'), context)
  return { calls, run: () => vm.runInContext('captureScreenshot({id: 1, windowId: 7})', context) }
}

test('captures PNG once and ignores simultaneous/repeated requests', async () => {
  const { calls, run } = setup()
  await Promise.all([run(), run()]); await run()
  assert.equal(calls.captures, 1); assert.equal(calls.copies, 1); assert.deepEqual(calls.badges, ['✓'])
  assert.deepEqual(calls.events, ['hide-preview', 'capture', 'copy', 'success-preview'])
})

test('does not overwrite clipboard when active tab changes during capture', async () => {
  const { calls, run } = setup({ switched: true }); await run()
  assert.equal(calls.copies, 0); assert.deepEqual(calls.badges, ['!'])
})

test('capture rejection does not attempt clipboard write', async () => {
  const { calls, run } = setup({ captureError: true }); await run()
  assert.equal(calls.copies, 0); assert.deepEqual(calls.badges, ['!'])
})

for (const copyError of [false, true]) test(`restricted-page fallback closes its window on ${copyError ? 'failure' : 'success'}`, async () => {
  const { calls, run } = setup({ fallback: true, copyError }); await run()
  assert.equal(calls.closed, 1); assert.deepEqual(calls.badges, [copyError ? '!' : '✓'])
})
