/**
 * ElementSelector Extension - Background Script (Service Worker)
 * 管理插件状态和处理消息转发
 */

// 存储每个标签页的状态
const tabStates = new Map()

// 1.2.54 起当前选择只在 content script 内存中存在；清理旧版本遗留的会话数据。
chrome.storage.session.remove('elementSelectorData').catch(() => {})

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_SELECTOR') {
    toggleSelector(message.tabId)
    sendResponse({ success: true })
    return true
  }
  return false
})

// 监听扩展图标点击（直接启动/停止选择器）
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    toggleSelector(tab.id)
  }
})

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STATE_CHANGED' && sender.tab) {
    // 更新标签页状态
    tabStates.set(sender.tab.id, {
      isActive: message.isActive,
      count: message.count
    })

    // 保存到 storage
    chrome.storage.local.set({
      elementSelectorActive: message.isActive,
      [`active_${sender.tab.id}`]: message.isActive,
      [`count_${sender.tab.id}`]: message.count
    })
  } else if (message.type === 'GET_FRAME_CONTEXT' && sender.tab) {
    sendResponse({
      frameId: sender.frameId || 0,
      topUrl: sender.tab.url || message.frameUrl
    })
  } else if (message.type === 'SELECTIONS_CHANGED' && sender.tab) {
    const data = message.data
    // 仅在当前打开期间向所有 frame 同步，不持久化当前选择。
    broadcastToAllFrames(sender.tab.id, {
      type: 'SYNC_SELECTIONS',
      data: data
    })
    sendResponse({ success: true })
  } else if (message.type === 'BROADCAST_SELECTOR_COMMAND' && sender.tab) {
    broadcastToAllFrames(sender.tab.id, { type: message.command })
    sendResponse({ success: true })
  }
  return true
})

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-selector') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab) {
      toggleSelector(tab.id)
    }
  }
})


// 将控制与同步消息发送到顶层页面及所有 iframe。tabs.sendMessage 默认只发送到 frame 0，
// 会导致嵌套 iframe 中的选择器没有收到 START/TOGGLE 等命令。
async function broadcastToAllFrames(tabId, message) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId })
    const frameIds = (frames || []).map(frame => frame.frameId)
    await Promise.all(frameIds.map(frameId =>
      chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => {})
    ))
  } catch (error) {
    // 页面导航或 chrome:// 页面可能暂时无法枚举 frame，至少尝试顶层 frame。
    chrome.tabs.sendMessage(tabId, message).catch(() => {})
  }
}

// 切换选择器
async function toggleSelector(tabId) {
  try {
    // 先尝试注入 content script（如果还没有注入的话）
    await ensureContentScriptInjected(tabId)

    // 直接发送到所有 frame。不要只发给顶层 frame，否则 iframe 中的选择器不会启动。
    await broadcastToAllFrames(tabId, { type: 'TOGGLE' })
  } catch (error) {
    console.error('切换选择器失败:', error)
  }
}

// 确保 content script 已注入
async function ensureContentScriptInjected(tabId) {
  try {
    // 对所有 frame 注入；content.js 自带重复加载保护。
    // 这样扩展更新前已经打开的页面，其跨域 iframe 也能立即获得选择能力。
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js']
    })
  } catch (error) {
    // 页面可能不允许脚本注入（例如 chrome:// 页面），交给调用方处理。
    throw error
  }
}

// 标签页关闭时清理状态
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId)
  chrome.storage.local.remove([`active_${tabId}`, `count_${tabId}`])
})

// 标签页更新时清理状态（导航到新页面）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    tabStates.delete(tabId)
    chrome.storage.local.remove([`active_${tabId}`, `count_${tabId}`])
  }
  // 页面加载完成后主动注入 content script，确保自定义快捷键立即生效
  // 即使 content_scripts 配置对当前页面未生效（如扩展更新前已打开的页面）也能正常工作
  if (changeInfo.status === 'complete' && tab.url &&
      (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    ensureContentScriptInjected(tabId).catch(() => {})
  }
})

console.log('🎯 ElementSelector Background Service Worker 已启动')

// 页面运行期间动态创建的 iframe（例如点击按钮后才出现的弹窗）需要单独注入。
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) return
  const state = tabStates.get(details.tabId)
  if (!state || !state.isActive) return
  chrome.scripting.executeScript({
    target: { tabId: details.tabId, frameIds: [details.frameId] },
    files: ['content.js']
  }).catch(() => {})
  chrome.tabs.sendMessage(details.tabId, { type: 'START' }, { frameId: details.frameId }).catch(() => {})
})
