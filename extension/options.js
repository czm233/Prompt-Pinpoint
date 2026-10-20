/** 快捷键在扩展设置内录制并保存。 */
const isMac = navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.includes('Mac')
let builtinShortcuts = []
let saving = false
const editors = [
  { key: 'screenshotShortcut', label: PinpointI18n.t('截图并复制'), prefix: 'screenshot' },
  { key: 'customShortcut', label: PinpointI18n.t('自定义切换快捷键'), prefix: '' }
].map(editor => ({
  ...editor,
  box: document.getElementById(editor.prefix ? 'screenshotShortcutBox' : 'shortcutBox'),
  display: document.getElementById(editor.prefix ? 'screenshotShortcutDisplay' : 'shortcutDisplay'),
  clear: document.getElementById(editor.prefix ? 'screenshotClearBtn' : 'clearBtn'),
  save: document.getElementById(editor.prefix ? 'screenshotSaveBtn' : 'saveBtn'),
  msg: document.getElementById(editor.prefix ? 'screenshotMsg' : 'msgEl'),
  current: null, saved: null, recording: false
}))

function showMessage(editor, text, type = 'hint') {
  editor.msg.textContent = text
  editor.msg.className = `msg msg-${type}`
}
function renderShortcut(editor) {
  editor.display.textContent = editor.current ? formatShortcut(editor.current) : PinpointI18n.t('点击后按下快捷键...')
  editor.display.className = editor.current ? '' : 'placeholder'
  editor.box.classList.remove('recording')
}
function findConflict(shortcut, editor) {
  return builtinShortcuts.find(item => shortcutsEqual(item.shortcut, shortcut))?.label ||
    editors.find(other => other !== editor && shortcutsEqual(other.saved, shortcut))?.label
}
function renderExistingList() {
  const list = document.getElementById('existingList')
  list.replaceChildren()
  for (const item of [...builtinShortcuts, ...editors.map(editor => ({ label: editor.label, shortcut: editor.saved }))]) {
    const row = document.createElement('div')
    row.className = 'existing-item'
    const label = document.createElement('span')
    label.textContent = item.label
    const value = document.createElement('span')
    value.className = `key-tag${item.shortcut ? '' : ' empty'}`
    value.textContent = item.shortcut ? formatShortcut(item.shortcut) : PinpointI18n.t('未设置')
    row.append(label, value)
    list.append(row)
  }
}
for (const editor of editors) {
  editor.save.disabled = true
  const start = () => {
    editor.recording = true
    editor.box.classList.add('recording')
    editor.display.textContent = PinpointI18n.t('请按下快捷键组合...')
  }
  editor.box.addEventListener('click', () => { editor.box.focus(); start() })
  editor.box.addEventListener('focus', start)
  editor.box.addEventListener('blur', () => { editor.recording = false; renderShortcut(editor) })
  editor.box.addEventListener('keydown', event => {
    if (!editor.recording || saving) return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat || event.isComposing || ['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      showMessage(editor, PinpointI18n.t('必须包含至少一个修饰键'), 'hint')
      return
    }
    editor.current = { key: event.code, ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey }
    editor.recording = false
    renderShortcut(editor)
    const conflict = findConflict(editor.current, editor)
    editor.box.classList.toggle('has-conflict', !!conflict)
    showMessage(editor, conflict ? PinpointI18n.t('与“{name}”冲突', { name: conflict }) : '', conflict ? 'error' : 'hint')
  })
  editor.clear.addEventListener('click', () => {
    if (saving) return
    editor.current = null
    editor.recording = false
    editor.box.classList.remove('has-conflict')
    renderShortcut(editor)
    showMessage(editor, '')
  })
  editor.save.addEventListener('click', async () => {
    if (saving) return
    const shortcut = editor.current
    if (shortcut && findConflict(shortcut, editor)) {
      showMessage(editor, PinpointI18n.t('存在冲突，请重新设置'), 'error')
      return
    }
    saving = true
    editors.forEach(item => { item.save.disabled = true })
    try {
      // 必须直接由保存按钮的用户手势发起；activeTab 不覆盖页面内按键。
      if (editor.key === 'screenshotShortcut' && shortcut) {
        const granted = await chrome.permissions.request({ origins: ['<all_urls>'] })
        if (!granted) {
          showMessage(editor, PinpointI18n.t('未授权截图所需的网站权限，快捷键未保存'), 'error')
          return
        }
      }
      await chrome.storage.sync.set({ [editor.key]: shortcut })
      if (editor.key === 'screenshotShortcut') {
        await chrome.runtime.sendMessage({ type: 'REFRESH_SCREENSHOT_SHORTCUTS' })
      }
      editor.saved = shortcut
      renderExistingList()
      showMessage(editor, PinpointI18n.t('已保存'), 'success')
    } catch (error) {
      showMessage(editor, PinpointI18n.t('保存失败：{error}', { error: error.message }), 'error')
    } finally {
      saving = false
      editors.forEach(item => { item.save.disabled = false })
    }
  })
}

Promise.all([
  chrome.storage.sync.get(['customShortcut', 'screenshotShortcut']),
  chrome.commands.getAll()
]).then(([settings, commands]) => {
  builtinShortcuts = commands.filter(command => command.shortcut).map(command => ({
    label: command.name === 'toggle-selector' ? PinpointI18n.t('开启/关闭元素选择器') : command.description || command.name, shortcut: parseCommandShortcut(command.shortcut)
  }))
  for (const editor of editors) {
    editor.current = editor.saved = settings[editor.key] || null
    renderShortcut(editor)
    editor.save.disabled = false
  }
  renderExistingList()
}).catch(error => editors.forEach(editor => showMessage(editor, PinpointI18n.t('读取设置失败：{error}', { error: error.message }), 'error')))

const sizeBtns = document.getElementById('sizeSelector').querySelectorAll('.size-btn')
chrome.storage.sync.get(['panelSize'], result => {
  sizeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.size === (result.panelSize || 'small')))
})
sizeBtns.forEach(btn => btn.addEventListener('click', () => {
  sizeBtns.forEach(item => item.classList.toggle('active', item === btn))
  chrome.storage.sync.set({ panelSize: btn.dataset.size })
}))
const devModeToggle = document.getElementById('devModeToggle')
chrome.storage.sync.get(['devMode'], result => { devModeToggle.checked = !!result.devMode })
devModeToggle.addEventListener('change', () => chrome.storage.sync.set({ devMode: devModeToggle.checked }))

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
  // macOS 的 getAll() 返回 ⌥⇧S 等显示字符串。
  str = str.replace(/⌃/g, 'MacCtrl+').replace(/⌥/g, 'Alt+')
    .replace(/⇧/g, 'Shift+').replace(/⌘/g, 'Command+')
  const parts = str.split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map(p => p.toLowerCase())
  return {
    key: /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase()
      : /^\d$/.test(key) ? 'Digit' + key : key,
    ctrl: mods.includes('ctrl') || mods.includes('macctrl'),
    meta: mods.includes('command') || mods.includes('meta'),
    shift: mods.includes('shift'),
    alt: mods.includes('alt')
  }
}

function shortcutsEqual(a, b) {
  if (!a || !b) return false
  return a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.meta === b.meta &&
    a.shift === b.shift &&
    a.alt === b.alt
}

const languageSelect = document.getElementById('languageSelect')
function refreshLanguage() {
  PinpointI18n.render()
  languageSelect.value = PinpointI18n.language
  editors[0].label = PinpointI18n.t('截图并复制')
  editors[1].label = PinpointI18n.t('自定义切换快捷键')
  chrome.commands.getAll().then(commands => {
    builtinShortcuts = commands.filter(command => command.shortcut).map(command => ({
      label: command.name === 'toggle-selector' ? PinpointI18n.t('开启/关闭元素选择器') : command.description || command.name,
      shortcut: parseCommandShortcut(command.shortcut)
    }))
    renderExistingList()
  })
  editors.forEach(editor => { if (!editor.recording) renderShortcut(editor); showMessage(editor, '') })
}
languageSelect.addEventListener('change', async () => {
  const error = document.getElementById('languageError')
  error.hidden = true
  try { await chrome.storage.sync.set({ language: languageSelect.value }) }
  catch { languageSelect.value = PinpointI18n.language; error.hidden = false; error.textContent = PinpointI18n.t('语言设置失败，请重试') }
})
PinpointI18n.ready.then(refreshLanguage)
PinpointI18n.onChange(refreshLanguage)
