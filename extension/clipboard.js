// 受限网页的复制后备入口：写入图片后由后台关闭窗口。
;(async () => {
  await PinpointI18n.ready
  PinpointI18n.render()
  try {
    const message = await chrome.runtime.sendMessage({ target: 'screenshot-clipboard', type: 'READY' })
    if (!message?.dataUrl?.startsWith('data:image/png;base64,')) throw new Error(PinpointI18n.t('截图格式无效'))
    if (!document.hasFocus()) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(PinpointI18n.t('复制窗口未获得焦点，请重试'))), 5000)
        window.addEventListener('focus', () => { clearTimeout(timer); resolve() }, { once: true })
      })
    }
    const blob = await (await fetch(message.dataUrl)).blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    await chrome.runtime.sendMessage({ target: 'screenshot-clipboard', type: 'RESULT', success: true })
  } catch (error) {
    await chrome.runtime.sendMessage({
      target: 'screenshot-clipboard', type: 'RESULT', success: false, error: error.message
    })
  }
})()
