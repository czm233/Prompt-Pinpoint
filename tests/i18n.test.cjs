const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
test('defaults to English and switches languages without translating user content', async () => {
  let change
  const context = vm.createContext({ chrome: { storage: {
    sync: { get: async () => ({}) },
    onChanged: { addListener(fn) { change = fn } }
  } } })
  const source = fs.readFileSync(require.resolve('../extension/i18n.js'), 'utf8')
  vm.runInContext(source, context)
  await context.PinpointI18n.ready
  assert.equal(context.PinpointI18n.t('截图并复制'), 'Capture and copy')
  assert.equal(context.PinpointI18n.t('截图失败：{error}', { error: '用户原文' }), 'Screenshot failed: 用户原文')
  let updates = 0
  context.PinpointI18n.onChange(() => updates++)
  change({ language: { newValue: 'zh' } }, 'sync')
  assert.equal(context.PinpointI18n.t('截图并复制'), '截图并复制')
  assert.equal(context.PinpointI18n.language, 'zh')
  vm.runInContext(source, context)
  assert.equal(context.PinpointI18n.language, 'zh')
  change({ language: { newValue: 'en' } }, 'sync')
  assert.equal(context.PinpointI18n.t('✓ 已复制'), '✓ Copied')
  assert.equal(updates, 2)
})
