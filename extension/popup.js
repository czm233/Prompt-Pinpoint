/**
 * ElementSelector Extension - Popup 脚本
 * 管理弹出页面的交互逻辑
 */

// DOM 元素
const toggleBtn = document.getElementById('toggle-btn')
const statusText = document.getElementById('status-text')
const selectedCount = document.getElementById('selected-count')

// 初始化
async function init() {
  // 获取当前标签页的选择器状态
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab) return

  // 从 storage 获取状态
  const result = await chrome.storage.local.get([`active_${tab.id}`, `count_${tab.id}`])

  updateUI(result[`active_${tab.id}`] || false, result[`count_${tab.id}`] || 0)

  // 监听来自 content script 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATE_CHANGED') {
      updateUI(message.isActive, message.count)
    }
  })
}

// 更新 UI
function updateUI(isActive, count) {
  // 更新状态文本
  statusText.textContent = isActive ? '运行中' : '未启动'
  statusText.className = `status-text ${isActive ? 'active' : ''}`

  // 更新选中数量
  selectedCount.textContent = `${count} 个元素`

  // 更新按钮
  const btnIcon = toggleBtn.querySelector('.btn-icon')
  const btnText = toggleBtn.querySelector('.btn-text')

  if (isActive) {
    btnIcon.textContent = '⏹'
    btnText.textContent = '停止选择器'
    toggleBtn.classList.add('active')
  } else {
    btnIcon.textContent = '▶'
    btnText.textContent = '启动选择器'
    toggleBtn.classList.remove('active')
  }
}

// 切换选择器
async function toggleSelector() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab) return

  // 发送消息给 background script
  chrome.runtime.sendMessage({
    type: 'TOGGLE_SELECTOR',
    tabId: tab.id
  })
}

// 事件绑定
toggleBtn.addEventListener('click', toggleSelector)

// 启动
init()
