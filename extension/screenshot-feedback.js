// 独立于元素选择器；每次截图前按需注入，仅在顶层页面显示。
;(() => {
  if (window !== window.top) return
  window.__pinpointScreenshotFeedback?.dispose?.()
  document.querySelectorAll('[data-pinpoint-screenshot-feedback]').forEach(node => node.remove())
  let host = null
  let dismissTimer
  let fadeTimer
  let revision = 0

  function remove() {
    revision++
    clearTimeout(dismissTimer)
    clearTimeout(fadeTimer)
    host?.remove()
    host = null
  }

  function show(message) {
    remove()
    const currentRevision = revision
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    host = document.createElement('div')
    host.setAttribute('data-pinpoint-screenshot-feedback', '')
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;'
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `
      :host { color-scheme: light; }
      * { box-sizing: border-box; }
      .card { position:absolute;top:20px;right:20px;width:220px;max-width:calc(100vw - 32px);
        background:#fff;color:#1e293b;border:1px solid #e2e8f0;border-radius:12px;
        box-shadow:0 12px 36px #0f172a33;overflow:hidden;pointer-events:none;
        font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      img { display:block;width:100%;max-height:180px;object-fit:contain;background:#f1f5f9; }
      .status { display:flex;align-items:flex-start;gap:8px;padding:10px 12px; }
      .text { flex:1;overflow-wrap:anywhere; }
      .success { color:#15803d;font-weight:600; }
      .error { color:#b91c1c; }
      .flash { position:absolute;inset:0;background:white;pointer-events:none; }
    `
    shadow.append(style)
    const card = document.createElement('section')
    card.className = 'card'
    card.setAttribute('aria-label', message.success ? PinpointI18n.t('截图已复制') : PinpointI18n.t('截图失败'))
    if (message.success && message.dataUrl?.startsWith('data:image/png;base64,')) {
      const image = document.createElement('img')
      image.src = message.dataUrl
      image.alt = PinpointI18n.t('刚刚截取的页面')
      card.append(image)
    }
    const status = document.createElement('div')
    status.className = 'status'
    const text = document.createElement('span')
    text.className = `text ${message.success ? 'success' : 'error'}`
    text.setAttribute('role', message.success ? 'status' : 'alert')
    text.textContent = message.success ? PinpointI18n.t('✓ 已复制') : PinpointI18n.t('截图失败：{error}', { error: message.error || PinpointI18n.t('请重试') })
    status.append(text)
    card.append(status)
    shadow.append(card)
    document.documentElement.append(host)

    function scheduleDismiss() {
      if (currentRevision !== revision) return
      clearTimeout(dismissTimer)
      // 错误保留更长时间，成功提示始终在一秒后淡出。
      dismissTimer = setTimeout(() => {
        if (currentRevision !== revision) return
        if (reducedMotion) return remove()
        card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' })
        fadeTimer = setTimeout(() => { if (currentRevision === revision) remove() }, 180)
      }, message.success ? 1000 : 8000)
    }
    if (!reducedMotion) {
      card.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' })
      if (message.success) {
        const flash = document.createElement('div')
        flash.className = 'flash'
        shadow.prepend(flash)
        flash.animate([{ opacity: 0.22 }, { opacity: 0 }], { duration: 120 }).finished.then(() => flash.remove()).catch(() => {})
      }
    }
    scheduleDismiss()
  }

  function onMessage(message, sender, sendResponse) {
    if (message.type === 'PREPARE_SCREENSHOT') {
      remove()
      // 等待隐藏后的页面完成绘制，避免上一次缩略图进入下一张截图。
      let replied = false
      const done = () => { if (!replied) { replied = true; sendResponse({ ready: true }) } }
      const timer = setTimeout(done, 200)
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); done() }))
      return true
    }
    if (message.type === 'SCREENSHOT_FEEDBACK') {
      PinpointI18n.ready.then(() => { show(message); sendResponse({ shown: true }) })
      return true
    }
    return false
  }
  chrome.runtime.onMessage.addListener(onMessage)
  window.__pinpointScreenshotFeedback = { dispose() {
    remove()
    try { chrome.runtime.onMessage.removeListener(onMessage) } catch {}
  } }
})()
