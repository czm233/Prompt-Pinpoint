/**
 * ElementSelector Extension - Background Script (Service Worker)
 * 管理插件状态和处理消息转发
 */

// 存储每个标签页的状态
const tabStates = new Map()

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_SELECTOR') {
    toggleSelector(message.tabId)
  }
  return true
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
      [`active_${sender.tab.id}`]: message.isActive,
      [`count_${sender.tab.id}`]: message.count
    })
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

// 切换选择器
async function toggleSelector(tabId) {
  try {
    // 先尝试注入 content script（如果还没有注入的话）
    await ensureContentScriptInjected(tabId)

    // 发送切换消息给 content script
    await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE' })
  } catch (error) {
    console.error('切换选择器失败:', error)
  }
}

// 确保 content script 已注入
async function ensureContentScriptInjected(tabId) {
  try {
    // 尝试发送一个 ping 消息，检查 content script 是否已加载
    await chrome.tabs.sendMessage(tabId, { type: 'PING' })
  } catch (error) {
    // 如果没有加载，则注入 content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    })
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
