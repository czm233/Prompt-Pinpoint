// 独立、可替换的截图监听器；不依赖选择器初始化，也不被旧版 document 监听器阻断。
;(() => {
  const previous = window.__pinpointScreenshotShortcut
  previous?.dispose()
  let shortcut = null
  let disposed = false
  let changeRevision = 0
  function apply(changes, area) {
    if (area === 'sync' && 'screenshotShortcut' in changes) {
      changeRevision++
      shortcut = changes.screenshotShortcut.newValue || null
    }
  }
  function keydown(event) {
    if (!shortcut || !event.isTrusted || event.repeat || event.isComposing) return
    if (event.code !== shortcut.key || event.ctrlKey !== !!shortcut.ctrl ||
        event.metaKey !== !!shortcut.meta || event.altKey !== !!shortcut.alt || event.shiftKey !== !!shortcut.shift) return
    if (!chrome.runtime.id) return
    event.preventDefault()
    event.stopImmediatePropagation()
    chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }).catch(() => {})
  }
  function dispose() {
    disposed = true
    window.removeEventListener('keydown', keydown, true)
    try { chrome.storage.onChanged.removeListener(apply) } catch {}
  }
  window.__pinpointScreenshotShortcut = { dispose }
  chrome.storage.onChanged.addListener(apply)
  chrome.storage.sync.get('screenshotShortcut').then(result => {
    if (!disposed && changeRevision === 0) shortcut = result.screenshotShortcut || null
  }).catch(() => {})
  window.addEventListener('keydown', keydown, true)
})()
