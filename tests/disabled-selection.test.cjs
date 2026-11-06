const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')

const source = fs.readFileSync(require.resolve('../extension/content.js'), 'utf8')
const bind = source.slice(source.indexOf('    _bindEvents() {') + '    _bindEvents() {'.length, source.indexOf('\n    _unbindEvents()'))
// Exercise the actual event wiring, without starting the extension UI.
function setup() {
  const listeners = {}, selected = []
  const selector = { _isActive: true, _selectElement: el => selected.push(el) }
  const context = vm.createContext({
    document: { addEventListener: (type, fn) => { listeners[type] = fn } },
    window: { addEventListener() {}, location: { href: 'https://example.test' } },
    setInterval() {}
  })
  vm.runInContext(`(function () { ${bind.slice(0, bind.lastIndexOf('    },'))} })`, context).call(selector)
  return { listeners, selected, selector }
}
function event(type, target, extra = {}) {
  return { type, target, button: 0, isPrimary: true, preventDefault() {}, stopPropagation() {}, ...extra }
}

test('disabled controls and their children select once even if a click follows', () => {
  for (const child of [false, true]) {
    const { listeners, selected } = setup()
    const target = { child, closest: query => query === ':disabled' ? {} : null }
    listeners.pointerdown(event('pointerdown', target))
    listeners.click(event('click', target))
    assert.deepEqual(selected, [target])
  }
})

test('disabled pointer selection respects pause, Cmd, panel exclusion and mouse buttons', () => {
  for (const mode of ['paused', 'cmd', 'panel', 'right', 'secondary']) {
    const { listeners, selected, selector } = setup()
    selector._isPaused = mode === 'paused'
    const target = { closest: query => query === ':disabled' || (mode === 'panel' && query.includes('panel')) ? {} : null }
    listeners.pointerdown(event('pointerdown', target, { metaKey: mode === 'cmd', button: mode === 'right' ? 2 : 0, isPrimary: mode !== 'secondary' }))
    assert.equal(selected.length, 0, mode)
  }
})

test('enabled elements continue to select through click only', () => {
  const { listeners, selected } = setup()
  const target = { closest: () => null }
  listeners.pointerdown(event('pointerdown', target))
  assert.equal(selected.length, 0)
  listeners.click(event('click', target))
  assert.deepEqual(selected, [target])
})
