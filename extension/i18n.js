;(() => {
  if (globalThis.PinpointI18n) return
  const english = {
  "截图并复制": "Capture and copy",
  "自定义切换快捷键": "Toggle selector shortcut",
  "点击后按下快捷键...": "Click and press a shortcut…",
  "未设置": "Not set",
  "请按下快捷键组合...": "Press a shortcut…",
  "必须包含至少一个修饰键": "Include at least one modifier key",
  "存在冲突，请重新设置": "Shortcut conflict. Choose another combination.",
  "未授权截图所需的网站权限，快捷键未保存": "Website access was denied. Shortcut not saved.",
  "已保存": "Saved",
  "与“{name}”冲突": "Conflicts with “{name}”",
  "保存失败：{error}": "Could not save: {error}",
  "读取设置失败：{error}": "Could not load settings: {error}",
  "顶部": "top",
  "中部": "middle",
  "底部": "bottom",
  "偏左": " left",
  "居中": " center",
  "偏右": " right",
  "页面": "Page ",
  " 内": " inside",
  "[元素 ": "[Element ",
  "  选择器: ": "  Selector: ",
  "  属性: ": "  Attributes: ",
  "  关联标签: \"": "  Label: \"",
  "  状态: ": "  State: ",
  "  位置: ": "  Position: ",
  "  上下文: ": "  Context: ",
  "prompt编写区域<br>将prompt写在这里<br>点击复制会一起复制到剪切板": "Write a prompt…",
  "复制": "Copy",
  "删除": "Delete",
  "<span>Cmd+点击 临时恢复交互</span>": "<span>Cmd+click to interact</span>",
  "<span>⏸ 长期恢复交互</span>": "<span>⏸ Pause selection</span>",
  "📍 当前页面: ": "📍 Current page: ",
  "清除本页": "Clear this page",
  "清除选择": "Clear selection",
  "清除所有": "Clear all",
  "复制历史": "Copy history",
  "继续选择": "Resume selection",
  "暂停选择": "Pause selection",
  "关闭": "Close",
  "已选择 ": "Selected ",
  " 个元素": " elements",
  " 个页面）": " pages)",
  "（": " (",
  " | 已暂停": " | Paused",
  "页面: ": "Page: ",
  "已复制！": "Copied!",
  "已复制所有选择器！": "Selectors copied!",
  "复制成功": "Copied",
  "刚刚": "Just now",
  " 分钟前": " min ago",
  " 小时前": " hr ago",
  " 天前": " days ago",
  "关闭历史": "Close history",
  "暂无历史记录": "No history yet",
  "已复制!": "Copied!",
  "复制超时，请保持浏览器在前台重试": "Copy timed out. Keep the browser in front and try again.",
  "剪贴板写入失败": "Could not write to the clipboard",
  "当前标签页已切换，请重试": "The active tab changed. Try again.",
  "截图已复制": "Screenshot copied",
  "截图失败": "Screenshot failed",
  "刚刚截取的页面": "Screenshot preview",
  "✓ 已复制": "✓ Copied",
  "请重试": "Try again",
  "截图失败：{error}": "Screenshot failed: {error}",
  "截图失败：{error}。请重新按截图快捷键重试。": "Screenshot failed: {error}. Press your shortcut to retry.",
  "运行中": "Active",
  "未启动": "Inactive",
  "停止选择器": "Stop selector",
  "启动选择器": "Start selector",
  "截图格式无效": "Invalid screenshot format",
  "复制窗口未获得焦点，请重试": "The copy window could not gain focus. Try again.",
  "Prompt-Pinpoint - 选项设置": "Prompt-Pinpoint — Options",
  "Prompt-Pinpoint 设置": "Prompt-Pinpoint Settings",
  "快捷键设置": "Keyboard shortcuts",
  "录制截图快捷键": "Record screenshot shortcut",
  "清除": "Clear",
  "保存": "Save",
  "开启/关闭元素选择器": "Toggle element selector",
  "必须包含修饰键（⌘ / ⌃ / ⌥ / ⇧）": "Include a modifier key (⌘ / ⌃ / ⌥ / ⇧)",
  "已注册的快捷键": "Assigned shortcuts",
  "开发者模式": "Developer mode",
  "允许选中插件自身的面板元素": "Allow selecting the extension panel",
  "面板尺寸": "Panel size",
  "选择面板的显示大小": "Choose the panel size",
  "小": "Small",
  "紧凑": "Compact",
  "中": "Medium",
  "适中": "Standard",
  "大": "Large",
  "宽敞": "Spacious",
  "状态：": "Status:",
  "已选中：": "Selected:",
  "0 个元素": "0 elements",
  "快捷键": "Shortcuts",
  "开启/关闭": "Toggle",
  "关闭选择器": "Close selector",
  "使用说明": "Help",
  "复制截图": "Copy screenshot",
  "正在复制截图…": "Copying screenshot…",
  "语言": "Language",
  "语言设置失败，请重试": "Could not change language. Try again.",
  "🎯 Prompt-Pinpoint（点击启动/停止）": "🎯 Prompt-Pinpoint (click to start/stop)"
}
  let language = 'en'
  const listeners = new Set()
  function t(key, values = {}) {
    const text = language === 'zh' ? key : (english[key] || key)
    return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match)
  }
  function render(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n) })
    root.querySelectorAll('[data-i18n-aria-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)) })
    if (root.documentElement) root.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }
  function apply(value) {
    language = value === 'zh' ? 'zh' : 'en'
    listeners.forEach(callback => callback())
  }
  const ready = chrome.storage.sync.get('language').then(result => apply(result.language)).catch(() => {})
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.language) apply(changes.language.newValue)
  })
  globalThis.PinpointI18n = { t, ready, render, get language() { return language }, onChange(callback) { listeners.add(callback); return () => listeners.delete(callback) } }
})()
