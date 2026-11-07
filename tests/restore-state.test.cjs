const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')

const background = fs.readFileSync(require.resolve('../extension/background.js'), 'utf8')
const content = fs.readFileSync(require.resolve('../extension/content.js'), 'utf8')

// 执行 background.js 中处理页面消息的 listener 原文，模拟 storage 与消息通道。
function setupListener(store) {
  const marker = "if (message.type === 'STATE_CHANGED' && sender.tab) {"
  const start = background.indexOf(marker)
  const begin = background.lastIndexOf('chrome.runtime.onMessage.addListener', start)
  const end = background.indexOf('return true\n})', start)
  let listener
  const context = vm.createContext({
    chrome: {
      runtime: { onMessage: { addListener(fn) { listener = fn } } },
      storage: {
        local: {
          // 与 chrome.storage.local.get 一致：只返回请求到的键。
          get: keys => Promise.resolve(Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]])))
        }
      },
      webNavigation: {}
    }
  })
  vm.runInContext(background.slice(begin, end + 'return true'.length) + '\n})', context)
  const ask = (tabId) => new Promise((resolve) => {
    const keepOpen = listener(
      { type: 'GET_FRAME_CONTEXT', frameUrl: 'https://example.test/page' },
      { tab: { id: tabId, url: 'https://example.test/page' }, frameId: 0 },
      resolve
    )
    assert.equal(keepOpen, true, 'listener 必须保持消息通道以支持异步 sendResponse')
  })
  return { ask }
}

test('restoreActive 只在刷新前本页确实开着且全局模式仍开启时为 true', async () => {
  const cases = [
    [{ active_7: true, elementSelectorActive: true }, true, '开着刷新 → 恢复'],
    [{ active_7: false, elementSelectorActive: true }, false, '页面内关闭后刷新 → 不再自动恢复（本次 bug）'],
    [{ elementSelectorActive: true }, false, '从未开过的页 → 不恢复'],
    [{ active_7: true, elementSelectorActive: false }, false, '图标全局关闭后刷新 → 不恢复'],
    [{}, false, 'storage 读失败以外的基础场景']
  ]
  for (const [store, expected, name] of cases) {
    const { ask } = setupListener(store)
    const reply = await ask(7)
    assert.equal(reply.restoreActive, expected, name)
    assert.equal(reply.frameId, 0)
    assert.equal(reply.topUrl, 'https://example.test/page')
  }
})

test('content 初始化恢复只认 per-tab restoreActive，不再读全局标志', () => {
  assert.match(content, /restoreActive && !ElementSelector\._isActive\) ElementSelector\.start\(\)/,
    'GET_FRAME_CONTEXT 回调按 restoreActive 恢复')
  assert.ok(!content.includes("chrome.storage.local.get(['elementSelectorActive']"),
    '初始化不得直接依据全局 elementSelectorActive 恢复（bug 源头）')
  // storage.onChanged 中的全局开关实时同步（图标/快捷键整体开关）必须保留。
  assert.match(content, /'elementSelectorActive' in changes/)
})

test('标签页 loading 时保留 active_<tabId>，只清理 count', () => {
  const start = background.indexOf('chrome.tabs.onUpdated.addListener')
  const segment = background.slice(start, background.indexOf('ensureContentScriptInjected(tabId).catch', start))
  assert.ok(!segment.includes('`active_${tabId}`'), 'loading 时不得删除 active_<tabId>（刷新后恢复依据）')
  assert.ok(segment.includes('`count_${tabId}`') || segment.includes('count_${tabId}'), 'count 仍需清理')
})
