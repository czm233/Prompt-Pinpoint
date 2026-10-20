const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')

function setup(granted = true) {
  const elements = new Map()
  function element() {
    return { textContent: '', listeners: {}, children: [],
      addEventListener(name, fn) { this.listeners[name] = fn },
      querySelectorAll: () => [], classList: { add() {}, remove() {}, toggle() {} },
      focus() {}, append(...items) { this.children.push(...items) }, replaceChildren() { this.children = [] }
    }
  }
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id) }
  const settings = {}
  let requests = 0
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/options.js'), 'utf8'), {
    PinpointI18n: { t: key => key, ready: Promise.resolve(), onChange() {}, render() {}, language: 'zh' },
    navigator: { platform: 'MacIntel', userAgent: 'Mac' },
    document: { getElementById: get, createElement: element },
    chrome: {
      runtime: { sendMessage: async () => ({ ready: true }) },
      commands: { getAll: async () => [] },
      permissions: { request: async () => { requests++; return granted } },
      storage: { sync: {
        get: (_keys, callback) => callback ? callback(settings) : Promise.resolve(settings),
        set: async data => Object.assign(settings, data)
      } }
    }
  })
  const record = (id, code) => {
    get(id).listeners.click()
    get(id).listeners.keydown({ key: code.slice(3), code, altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, preventDefault() {}, stopPropagation() {} })
  }
  return { get, settings, record, requests: () => requests }
}

test('records and saves screenshot shortcut locally; detects conflicts in both directions; clears', async () => {
  const s = setup(); await new Promise(setImmediate)
  s.record('screenshotShortcutBox', 'KeyY')
  await s.get('screenshotSaveBtn').listeners.click()
  assert.equal(s.settings.screenshotShortcut.key, 'KeyY')
  assert.equal(s.requests(), 1)
  s.record('shortcutBox', 'KeyY')
  await s.get('saveBtn').listeners.click()
  assert.match(s.get('msgEl').textContent, /冲突/)
  assert.equal(s.settings.customShortcut, undefined)
  s.record('shortcutBox', 'KeyU'); await s.get('saveBtn').listeners.click()
  s.record('screenshotShortcutBox', 'KeyU'); await s.get('screenshotSaveBtn').listeners.click()
  assert.match(s.get('screenshotMsg').textContent, /冲突/)
  assert.equal(s.settings.screenshotShortcut.key, 'KeyY')
  s.get('screenshotClearBtn').listeners.click(); await s.get('screenshotSaveBtn').listeners.click()
  assert.equal(s.settings.screenshotShortcut, null)
  assert.equal(s.requests(), 1)
})
test('denied website permission does not save an unusable screenshot shortcut', async () => {
  const s = setup(false); await new Promise(setImmediate)
  s.record('screenshotShortcutBox', 'KeyY'); await s.get('screenshotSaveBtn').listeners.click()
  assert.equal(s.settings.screenshotShortcut, undefined)
  assert.match(s.get('screenshotMsg').textContent, /未授权/)
  assert.equal(s.get('screenshotSaveBtn').disabled, false)
})
