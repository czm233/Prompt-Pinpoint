/**
 * ElementSelector 选项页面脚本
 * 管理自定义快捷键的录制、冲突检测和保存
 */

const isMac = navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.includes('Mac')

// 当前正在录制/展示的快捷键
let currentShortcut = null
// 已保存的快捷键
let savedShortcut = null
// 从 chrome.commands 读取的内置快捷键
let builtinShortcuts = []
// 是否处于录制状态
let isRecording = false

const shortcutBox = document.getElementById('shortcutBox')
const shortcutDisplay = document.getElementById('shortcutDisplay')
const clearBtn = document.getElementById('clearBtn')
const saveBtn = document.getElementById('saveBtn')
const msgEl = document.getElementById('msgEl')
const existingList = document.getElementById('existingList')

// 初始化：读取已保存快捷键 + 读取内置命令
Promise.all([
  new Promise(resolve => chrome.storage.sync.get(['customShortcut'], resolve)),
  new Promise(resolve => chrome.commands.getAll(resolve))
]).then(([storageResult, commands]) => {
  // 读取自定义快捷键
  if (storageResult.customShortcut) {
    savedShortcut = storageResult.customShortcut
    currentShortcut = savedShortcut
    setDisplay(savedShortcut)
  }

  // 读取内置命令快捷键
  builtinShortcuts = commands
    .filter(cmd => cmd.shortcut)
    .map(cmd => ({
      label: cmd.description || cmd.name,
      shortcut: parseCommandShortcut(cmd.shortcut)
    }))
    .filter(item => item.shortcut)

  renderExistingList()
})

// 点击快捷键框开始录制
shortcutBox.addEventListener('click', startRecording)
shortcutBox.addEventListener('focus', startRecording)

shortcutBox.addEventListener('blur', () => {
  if (isRecording) stopRecording()
})

shortcutBox.addEventListener('keydown', (e) => {
  if (!isRecording) return
  e.preventDefault()
  e.stopPropagation()

  // 忽略单独按下修饰键
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return

  const shortcut = {
    key: e.code,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey
  }

  // 必须有修饰键
  if (!shortcut.ctrl && !shortcut.meta && !shortcut.alt && !shortcut.shift) {
    showMsg('必须包含至少一个修饰键（⌘ / ⌃ / ⌥ / ⇧）', 'hint')
    return
  }

  currentShortcut = shortcut
  setDisplay(shortcut)
  stopRecording()

  // 冲突检测
  const conflict = findConflict(shortcut)
  if (conflict) {
    shortcutBox.classList.add('has-conflict')
    showMsg(`与"${conflict}"冲突`, 'error')
  } else {
    shortcutBox.classList.remove('has-conflict')
    showMsg('', 'hint')
  }

  renderExistingList()
})

// 清除按钮
clearBtn.addEventListener('click', () => {
  currentShortcut = null
  isRecording = false
  shortcutBox.classList.remove('recording', 'has-conflict')
  shortcutDisplay.innerHTML = '<span class="placeholder">点击后按下快捷键...</span>'
  showMsg('必须包含修饰键（⌘ / ⌃ / ⌥ / ⇧）', 'hint')
  renderExistingList()
})

// 保存按钮
saveBtn.addEventListener('click', () => {
  if (currentShortcut && findConflict(currentShortcut)) {
    showMsg('存在冲突，请重新设置', 'error')
    return
  }
  chrome.storage.sync.set({ customShortcut: currentShortcut || null }, () => {
    savedShortcut = currentShortcut
    showMsg('已保存', 'success')
    renderExistingList()
  })
})

function startRecording() {
  if (isRecording) return
  isRecording = true
  shortcutBox.classList.add('recording')
  shortcutDisplay.textContent = '请按下快捷键组合...'
  shortcutBox.focus()
}

function stopRecording() {
  isRecording = false
  shortcutBox.classList.remove('recording')
}

function setDisplay(shortcut) {
  shortcutDisplay.className = ''
  shortcutDisplay.textContent = formatShortcut(shortcut)
}

function formatShortcut(shortcut) {
  if (!shortcut) return ''
  const parts = []
  if (shortcut.ctrl) parts.push(isMac ? '⌃' : 'Ctrl')
  if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (shortcut.shift) parts.push(isMac ? '⇧' : 'Shift')
  if (shortcut.meta) parts.push(isMac ? '⌘' : 'Win')
  parts.push(keyCodeLabel(shortcut.key))
  return isMac ? parts.join('') : parts.join('+')
}

function keyCodeLabel(code) {
  const labels = {
    'Space': 'Space', 'Enter': 'Enter', 'Escape': 'Esc',
    'Backspace': 'Backspace', 'Tab': 'Tab', 'Delete': 'Del',
    'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    'Period': '.', 'Comma': ',', 'Slash': '/', 'Backslash': '\\',
    'Semicolon': ';', 'Quote': "'", 'BracketLeft': '[', 'BracketRight': ']',
    'Minus': '-', 'Equal': '=', 'Backquote': '`'
  }
  if (labels[code]) return labels[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6)
  if (/^F\d+$/.test(code)) return code
  return code
}

// 将 chrome.commands 的快捷键字符串解析为对象
// 格式示例："Ctrl+Shift+S"、"MacCtrl+S"
function parseCommandShortcut(str) {
  if (!str) return null
  const parts = str.split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map(p => p.toLowerCase())
  return {
    key: 'Key' + key.toUpperCase(),  // 尝试映射到 KeyCode 格式
    ctrl: mods.includes('ctrl') || mods.includes('macctrl'),
    meta: mods.includes('command') || mods.includes('meta'),
    shift: mods.includes('shift'),
    alt: mods.includes('alt')
  }
}

// 检测冲突：与自定义快捷键本身（如果是编辑状态且 savedShortcut 不同则不算）及内置命令对比
function findConflict(shortcut) {
  for (const item of builtinShortcuts) {
    if (shortcutsEqual(item.shortcut, shortcut)) {
      return item.label
    }
  }
  return null
}

function shortcutsEqual(a, b) {
  if (!a || !b) return false
  return a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.meta === b.meta &&
    a.shift === b.shift &&
    a.alt === b.alt
}

function showMsg(text, type) {
  msgEl.textContent = text
  msgEl.className = 'msg'
  if (type === 'error') msgEl.classList.add('msg-error')
  else if (type === 'success') msgEl.classList.add('msg-success')
  else msgEl.classList.add('msg-hint')
}

// 渲染已注册快捷键列表
function renderExistingList() {
  const items = []

  // 内置命令
  builtinShortcuts.forEach(item => {
    const isConflict = currentShortcut && shortcutsEqual(item.shortcut, currentShortcut)
    items.push({
      label: item.label,
      display: formatShortcut(item.shortcut),
      conflict: isConflict
    })
  })

  // 自定义快捷键（已保存的）
  const customDisplay = savedShortcut ? formatShortcut(savedShortcut) : null
  const customConflict = savedShortcut && currentShortcut && !shortcutsEqual(savedShortcut, currentShortcut) && shortcutsEqual(savedShortcut, currentShortcut)
  items.push({
    label: '自定义切换快捷键',
    display: customDisplay,
    isCustom: true,
    conflict: false
  })

  existingList.innerHTML = items.map(item => `
    <div class="existing-item" style="${item.conflict ? 'color:#ef4444' : ''}">
      <span>${item.label}</span>
      <span class="key-tag ${item.display ? '' : 'empty'}">${item.display || '未设置'}</span>
    </div>
  `).join('')
}
