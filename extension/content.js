/**
 * ElementSelector Extension - Content Script
 * 注入到页面中，实现元素选择功能
 *
 * 功能：
 * 1. 悬停高亮：鼠标悬停时，元素显示蓝色虚线边框
 * 2. 点击选中：点击元素后，显示选中状态（彩色边框）
 * 3. 多元素选择：支持选中最多10个元素
 * 4. 选择器生成：优先使用 data-testid，其次生成唯一 CSS 选择器
 * 5. 浮动面板：显示已选中的元素信息，提供复制/清除/关闭按钮
 */

;(function() {
  'use strict'

  // 防止重复加载
  if (window.__ElementSelectorExtension) {
    return
  }

  // ==================== 工具函数 ====================

  /**
   * 生成元素的唯一选择器
   */
  function generateSelector(element) {
    // 1. 优先使用 data-testid
    const testId = element.getAttribute('data-testid')
    if (testId) {
      return '[data-testid="' + testId + '"]'
    }

    // 2. 尝试使用 id
    if (element.id) {
      return '#' + element.id
    }

    // 3. 生成唯一 CSS 选择器
    const parts = []
    let current = element

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase()

      // 添加类名（取第一个有意义的类名）
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c && !c.startsWith('_'))
        if (classes.length > 0) {
          selector += '.' + classes[0]
        }
      }

      // 如果有多个相同元素，添加 nth-of-type
      const parent = current.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName)
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1
          selector += ':nth-of-type(' + index + ')'
        }
      }

      parts.unshift(selector)
      current = current.parentElement

      // 限制深度
      if (parts.length >= 4) break
    }

    return parts.join(' > ')
  }

  /**
   * 获取元素的文本内容（截取前50字符）
   */
  function getTextContent(element) {
    const text = element.textContent ? element.textContent.trim() : ''
    return text.length > 50 ? text.substring(0, 50) + '...' : text
  }

  /**
   * 收集元素的完整信息，返回结构化对象
   */
  function collectElementInfo(element) {
    const info = {}
    const tagName = element.tagName.toLowerCase()
    info.tagName = tagName
    info.selector = generateSelector(element)

    // 语义属性
    const attrConfig = [
      ['type', ['input', 'button']],
      ['placeholder', ['input', 'textarea']],
      ['name', ['input', 'select', 'textarea', 'button']],
      ['href', ['a']],
      ['src', ['img', 'video', 'audio', 'iframe']],
      ['alt', ['img']],
      ['role', null],
      ['aria-label', null],
      ['for', ['label']],
      ['action', ['form']],
      ['method', ['form']],
      ['data-testid', null]
    ]
    const attrs = []
    for (const [attr, tags] of attrConfig) {
      if (tags === null || tags.includes(tagName)) {
        const val = element.getAttribute(attr)
        if (val !== null && val !== '') {
          attrs.push(attr + '=' + val)
        }
      }
    }
    if (['input', 'select', 'textarea'].includes(tagName) && element.value) {
      attrs.push('value=' + element.value)
    }
    info.attrs = attrs

    // 状态信息
    const states = []
    if (element.disabled) states.push('disabled')
    if (element.checked) states.push('checked')
    if (element.readOnly) states.push('readOnly')
    if (element.required) states.push('required')
    if (element.hidden) states.push('hidden')
    info.states = states

    // 文本内容
    info.text = getTextContent(element)

    // 关联标签（仅表单元素）
    if (['input', 'select', 'textarea'].includes(tagName)) {
      let labelText = ''
      if (element.id) {
        const label = document.querySelector('label[for="' + element.id + '"]')
        if (label) labelText = label.textContent.trim()
      }
      if (!labelText) {
        const parentLabel = element.closest('label')
        if (parentLabel) {
          const clone = parentLabel.cloneNode(true)
          clone.querySelectorAll('input, select, textarea').forEach(i => i.remove())
          labelText = clone.textContent.trim()
        }
      }
      if (labelText) {
        info.label = labelText.length > 50 ? labelText.substring(0, 50) + '...' : labelText
      }
    }

    // 尺寸与位置
    const rect = element.getBoundingClientRect()
    info.size = Math.round(rect.width) + 'x' + Math.round(rect.height)

    const vw = window.innerWidth
    const vh = window.innerHeight
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const posY = centerY < vh / 3 ? '顶部' : centerY < vh * 2 / 3 ? '中部' : '底部'
    const posX = centerX < vw / 3 ? '偏左' : centerX < vw * 2 / 3 ? '居中' : '偏右'
    info.position = '页面' + posY + posX

    // 层级上下文（最近的语义化祖先）
    const semanticTags = ['form', 'nav', 'header', 'footer', 'main', 'aside', 'section', 'article', 'dialog']
    let parent = element.parentElement
    while (parent && parent !== document.body) {
      const parentTag = parent.tagName.toLowerCase()
      if (semanticTags.includes(parentTag) || parent.getAttribute('role')) {
        let ctx = '<' + parentTag
        if (parent.id) {
          ctx += '#' + parent.id
        } else if (parent.className && typeof parent.className === 'string') {
          const cls = parent.className.trim().split(/\s+/)[0]
          if (cls) ctx += '.' + cls
        }
        ctx += '>'
        info.context = ctx + ' 内'
        break
      }
      parent = parent.parentElement
    }

    return info
  }

  /**
   * 将结构化信息格式化为文本
   */
  function formatElementInfo(info, id) {
    const lines = []

    // 标题行
    let title = '[元素 ' + id + '] <' + info.tagName
    const typeAttr = info.attrs.find(function(a) { return a.startsWith('type=') })
    if (typeAttr) title += ' ' + typeAttr
    title += '>'
    if (info.text) title += ' "' + info.text + '"'
    lines.push(title)

    // 选择器
    lines.push('  选择器: ' + info.selector)

    // 属性
    if (info.attrs.length > 0) {
      lines.push('  属性: ' + info.attrs.join(' | '))
    }

    // 关联标签
    if (info.label) {
      lines.push('  关联标签: "' + info.label + '"')
    }

    // 状态
    if (info.states.length > 0) {
      lines.push('  状态: ' + info.states.join(' | '))
    }

    // 位置
    lines.push('  位置: ' + info.position + ' (' + info.size + ')')

    // 上下文
    if (info.context) {
      lines.push('  上下文: ' + info.context)
    }

    return lines.join('\n')
  }

  /**
   * 创建带样式的元素
   */
  function createElement(tag, styles, attrs) {
    const el = document.createElement(tag)
    if (styles) {
      Object.assign(el.style, styles)
    }
    if (attrs) {
      for (const key in attrs) {
        if (attrs.hasOwnProperty(key)) {
          if (key === 'textContent') {
            el.textContent = attrs[key]
          } else if (key === 'innerHTML') {
            el.innerHTML = attrs[key]
          } else {
            el.setAttribute(key, attrs[key])
          }
        }
      }
    }
    return el
  }

  // ==================== ElementSelector 主类 ====================

  const ElementSelector = {
    _isActive: false,
    _isPaused: false,  // 暂停选择状态
    _devMode: false,   // 开发者模式：允许选中插件自身元素
    _selectedElements: [],
    _hoveredElement: null,
    _nextId: 1, // 用于生成唯一 ID（编号不再回收）

    // DOM 元素引用
    _container: null,
    _hoverOverlay: null,
    _selectedOverlays: [],
    _panel: null,

    // 拖拽相关状态
    _isDragging: false,
    _dragStartX: 0,
    _dragStartY: 0,
    _panelStartX: 0,
    _panelStartY: 0,
    _handleDragMouseMove: null,
    _handleDragMouseUp: null,

    // 拖拽结束后防止 click 误触发
    _wasDragging: false,

    // 事件处理函数
    _handleMouseMove: null,
    _handleClick: null,
    _handleKeyDown: null,
    _handleScroll: null,
    _handleResize: null,

    // URL 变化检测
    _lastUrl: null,
    _urlCheckInterval: null,

    /**
     * 启动选择器
     */
    start() {
      if (this._isActive) return
      this._isActive = true
      this._isPaused = false
      this._createUI()
      this._bindEvents()
      document.body.style.cursor = 'crosshair'
      this._notifyStateChange()
      // 从 storage 加载已有选择
      this._loadFromStorage()
      console.log('ElementSelector 已启动')
    },

    /**
     * 停止选择器
     */
    stop() {
      if (!this._isActive) return
      this._isActive = false
      this._isPaused = false
      this._unbindEvents()
      this._removeUI()
      this._resetState()
      document.body.style.cursor = ''
      this._notifyStateChange()
      console.log('ElementSelector 已停止')
    },

    /**
     * 切换状态
     */
    toggle() {
      if (this._isActive) {
        this.stop()
      } else {
        this.start()
      }
    },

    /**
     * 获取选中的元素信息
     */
    getSelected() {
      return this._selectedElements.map(el => ({
        selector: el.selector,
        info: el.info
      }))
    },

    // ==================== 内部方法 ====================

    _resetState() {
      this._selectedElements = []
      this._hoveredElement = null
    },

    _createUI() {
      // 创建容器
      this._container = createElement('div', {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '0',
        height: '0',
        zIndex: '2147483647',
        pointerEvents: 'none'
      })

      // 创建悬停遮罩
      this._hoverOverlay = createElement('div', {
        position: 'fixed',
        pointerEvents: 'none',
        border: '2px dashed #3b82f6',
        background: 'rgba(59, 130, 246, 0.1)',
        zIndex: '2147483646',
        transition: 'all 0.1s ease',
        display: 'none'
      })
      this._container.appendChild(this._hoverOverlay)

      // 创建浮动面板
      this._panel = this._createPanel()
      this._container.appendChild(this._panel)

      document.body.appendChild(this._container)
    },

    // SVG 图标定义
    _icons: {
      copyAll: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
      clear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
      clearAll: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="9" y1="10" x2="15" y2="16"></line><line x1="15" y1="10" x2="9" y2="16"></line></svg>',
      pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',
      resume: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
      close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
    },

    /**
     * 创建标题栏图标按钮
     */
    _createIconButton(iconKey, title, onClick) {
      const btn = createElement('button', {
        background: 'transparent',
        border: 'none',
        color: '#fff',
        width: '28px',
        height: '28px',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px',
        transition: 'background 0.15s ease, opacity 0.15s ease',
        flexShrink: '0',
        opacity: '0.85'
      }, { title: title })
      btn.innerHTML = this._icons[iconKey]
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255,255,255,0.2)'
        btn.style.opacity = '1'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent'
        btn.style.opacity = '0.85'
      })
      btn.onclick = (e) => {
        e.stopPropagation()
        onClick()
      }
      return btn
    },

    _createPanel() {
      const self = this
      const panel = createElement('div', {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '233px',
        height: '300px',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: '2147483646',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }, { 'data-element-selector-panel': 'true' })

      // 标题栏（同时作为拖拽手柄）
      const header = createElement('div', {
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        color: '#fff',
        padding: '0',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        flexShrink: '0',
        cursor: self._devMode ? 'default' : 'grab',
        userSelect: 'none',
        gap: '0'
      }, { id: 'es-panel-header' })

      // 左侧：已选择元素信息（利用剩余空间）
      const selectedInfo = createElement('span', {
        flex: '1',
        fontSize: '12px',
        color: 'rgba(255,255,255,0.85)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: '0'
      }, { id: 'es-selected-info', textContent: '0' })
      header.appendChild(selectedInfo)

      // 右侧：图标按钮组
      const btnGroup = createElement('div', {
        display: 'flex',
        alignItems: 'center',
        gap: '0px',
        flexShrink: '0'
      }, { id: 'es-header-buttons' })
      header.appendChild(btnGroup)

      // 绑定拖拽事件（开发者模式下禁用，避免与元素选择冲突）
      header.addEventListener('mousedown', (e) => {
        if (self._devMode) return
        if (e.target.closest('button')) return
        self._startDrag(e)
      })

      panel.appendChild(header)

      // 初始化标题栏按钮（此时 this._panel 尚未赋值，直接操作 btnGroup）
      this._populateHeaderButtons(btnGroup, selectedInfo)

      // 中间区域：内容 + Prompt 横向排列
      const middleRow = createElement('div', {
        display: 'flex',
        flex: '1',
        minHeight: '0'
      })

      // 左侧：内容区域
      const content = createElement('div', {
        padding: '4px 6px',
        flex: '1',
        minHeight: '0',
        overflowY: 'scroll'
      }, { id: 'es-panel-content' })
      this._updatePanelContent(content)
      middleRow.appendChild(content)

      // 右侧：Prompt 输入区
      const promptSection = createElement('div', {
        width: '50%',
        flexShrink: '0',
        borderLeft: '1px solid #333',
        background: '#1e1e1e'
      })

      const promptInput = createElement('textarea', {
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '0',
        padding: '6px 8px',
        fontSize: '12px',
        fontFamily: 'inherit',
        resize: 'none',
        outline: 'none',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        display: 'block',
        background: '#1e1e1e',
        color: '#fff',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        whiteSpace: 'pre-wrap'
      }, { id: 'es-prompt-input', placeholder: 'prompt编写区域\n将prompt写在这里\n点击复制会一起复制到剪切板' })
      promptInput.addEventListener('focus', () => {
        promptInput.style.borderColor = '#3b82f6'
      })
      promptInput.addEventListener('blur', () => {
        promptInput.style.borderColor = '#e2e8f0'
      })
      promptSection.appendChild(promptInput)
      middleRow.appendChild(promptSection)
      panel.appendChild(middleRow)

      // 复制全部按钮（占满宽度）
      const copyBar = createElement('button', {
        width: '100%',
        padding: '8px 0',
        background: '#3b82f6',
        color: '#fff',
        border: 'none',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer',
        flexShrink: '0',
        transition: 'background 0.15s ease'
      }, { id: 'es-copy-bar', textContent: '复制' })
      copyBar.addEventListener('mouseenter', () => { copyBar.style.background = '#2563eb' })
      copyBar.addEventListener('mouseleave', () => { copyBar.style.background = '#3b82f6' })
      copyBar.onclick = () => self._copyAllSelectors()
      panel.appendChild(copyBar)

      // 提示区
      const tips = createElement('div', {
        padding: '4px 16px',
        background: '#f8fafc',
        fontSize: '11px',
        color: '#94a3b8',
        textAlign: 'center',
        flexShrink: '0'
      }, { innerHTML: 'Cmd+点击 临时恢复交互<br>⏸ 长期恢复交互' })
      panel.appendChild(tips)

      return panel
    },

    _updatePanelContent(content) {
      const self = this
      content.innerHTML = ''

      if (this._selectedElements.length === 0) {
        return
      }

      // 颜色数组，用于区分不同元素
      const colors = [
        '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
      ]

      // 按 URL 分组
      const currentUrl = window.location.href
      const grouped = {}
      this._selectedElements.forEach((el) => {
        const url = el.url || currentUrl
        if (!grouped[url]) grouped[url] = []
        grouped[url].push(el)
      })

      // 当前页面排在最前面
      const urls = Object.keys(grouped).sort((a, b) => {
        if (a === currentUrl) return -1
        if (b === currentUrl) return 1
        return a.localeCompare(b)
      })

      urls.forEach((url, urlIndex) => {
        const elements = grouped[url]
        const isCurrentPage = url === currentUrl

        // 如果有多个页面，显示页面 URL 标题
        if (urls.length > 1) {
          const urlLabel = createElement('div', {
            fontSize: '11px',
            color: isCurrentPage ? '#3b82f6' : '#94a3b8',
            marginBottom: '6px',
            marginTop: urlIndex > 0 ? '12px' : '0',
            padding: '4px 8px',
            background: isCurrentPage ? '#eff6ff' : '#f8fafc',
            borderRadius: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }, { textContent: (isCurrentPage ? '📍 当前页面: ' : '🔗 ') + url, title: url })
          content.appendChild(urlLabel)
        }

        elements.forEach((el, index) => {
          const color = colors[(el.id - 1) % colors.length]
          const label = '' + el.id

          // 卡片样式：其他页面用灰色
          const card = createElement('div', {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '2px 4px',
            marginBottom: index < elements.length - 1 ? '2px' : '0',
            background: isCurrentPage ? '#fff' : '#f8fafc',
            borderRadius: '4px',
            border: 'none',
            opacity: isCurrentPage ? '1' : '0.75'
          })

          // 标签
          const labelEl = createElement('span', {
            background: isCurrentPage ? color : '#94a3b8',
            color: '#fff',
            padding: '2px 0',
            borderRadius: '3px',
            fontSize: '12px',
            fontWeight: '500',
            minWidth: '24px',
            textAlign: 'center',
            display: 'inline-block'
          }, { textContent: label })
          card.appendChild(labelEl)

          // 按钮容器
          const btnGroup = createElement('div', {
            display: 'flex',
            gap: '4px'
          })

          // 复制按钮（图标）
          const copyBtn = createElement('button', {
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            padding: '4px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#94a3b8',
            transition: 'color 0.15s ease, background 0.15s ease'
          }, { title: '复制' })
          copyBtn.innerHTML = self._icons.copyAll
          copyBtn.addEventListener('mouseenter', () => { copyBtn.style.color = '#3b82f6'; copyBtn.style.background = '#eff6ff' })
          copyBtn.addEventListener('mouseleave', () => { copyBtn.style.color = '#94a3b8'; copyBtn.style.background = 'transparent' })
          copyBtn.onclick = () => self._copySelector(el)
          btnGroup.appendChild(copyBtn)

          // 删除按钮（图标）
          const deleteBtn = createElement('button', {
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            padding: '4px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#94a3b8',
            transition: 'color 0.15s ease, background 0.15s ease'
          }, { title: '删除' })
          deleteBtn.innerHTML = self._icons.clear
          deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.color = '#ef4444'; deleteBtn.style.background = '#fef2f2' })
          deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.color = '#94a3b8'; deleteBtn.style.background = 'transparent' })
          deleteBtn.onclick = () => self._removeElement(el.id)
          btnGroup.appendChild(deleteBtn)

          card.appendChild(btnGroup)
          content.appendChild(card)
        })
      })
    },

    /**
     * 更新标题栏中的图标按钮组和选择信息
     */
    _updateHeaderButtons() {
      if (!this._panel) return

      const btnGroup = this._panel.querySelector('#es-header-buttons')
      const infoEl = this._panel.querySelector('#es-selected-info')
      if (!btnGroup) return

      this._populateHeaderButtons(btnGroup, infoEl)
    },

    /**
     * 填充标题栏按钮和选择信息（可在 panel 初始化和刷新时复用）
     */
    _populateHeaderButtons(btnGroup, infoEl) {
      const self = this
      btnGroup.innerHTML = ''

      const hasSelected = this._selectedElements.length > 0
      const urls = new Set(this._selectedElements.map(el => el.url))
      const hasMultiplePages = urls.size > 1

      // 清除按钮（始终显示）
      const clearBtn = this._createIconButton('clear', hasMultiplePages ? '清除本页' : '清除选择', () => self._clearSelection())
      btnGroup.appendChild(clearBtn)

      // 清除所有按钮（多页面时显示）
      if (hasMultiplePages) {
        const clearAllBtn = this._createIconButton('clearAll', '清除所有', () => self._clearAllSelections())
        btnGroup.appendChild(clearAllBtn)
      }

      // 分隔线（始终显示）
      const divider = createElement('div', {
        width: '1px',
        height: '16px',
        background: 'rgba(255,255,255,0.3)',
        flexShrink: '0'
      })
      btnGroup.appendChild(divider)

      // 暂停/继续按钮
      const pauseBtn = this._createIconButton(
        this._isPaused ? 'resume' : 'pause',
        this._isPaused ? '继续选择' : '暂停选择',
        () => self._togglePause()
      )
      btnGroup.appendChild(pauseBtn)

      // 关闭按钮分隔线（始终显示）
      const closeDivider = createElement('div', {
        width: '1px',
        height: '16px',
        background: 'rgba(255,255,255,0.3)',
        flexShrink: '0',
        marginLeft: '4px',
        marginRight: '4px'
      })
      btnGroup.appendChild(closeDivider)

      // 关闭按钮
      const closeBtn = this._createIconButton('close', '关闭', () => self.stop())
      btnGroup.appendChild(closeBtn)

      // 更新选择信息
      if (infoEl) {
        this._updateSelectedInfoEl(infoEl)
      }
    },

    /**
     * 更新标题栏中间的已选择元素信息
     */
    _updateSelectedInfoEl(infoEl) {
      const count = this._selectedElements.length
      if (count === 0) {
        infoEl.textContent = this._isPaused ? '已暂停' : '0'
      } else {
        const urls = new Set(this._selectedElements.map(el => el.url))
        let text = '' + count
        if (urls.size > 1) {
          text += '（' + urls.size + ' 个页面）'
        }
        if (this._isPaused) {
          text += ' | 已暂停'
        }
        infoEl.textContent = text
      }
    },

    _removeUI() {
      // 清理拖拽事件
      if (this._handleDragMouseMove) {
        document.removeEventListener('mousemove', this._handleDragMouseMove, true)
        this._handleDragMouseMove = null
      }
      if (this._handleDragMouseUp) {
        document.removeEventListener('mouseup', this._handleDragMouseUp, true)
        this._handleDragMouseUp = null
      }
      this._isDragging = false

      if (this._container) {
        this._container.remove()
        this._container = null
      }
      this._hoverOverlay = null
      this._selectedOverlays = []
      this._panel = null
    },

    _bindEvents() {
      const self = this

      this._handleMouseMove = (e) => {
        if (!self._isActive) return
        if (self._isPaused) return
        if (self._isDragging) return

        const target = e.target
        const isPanel = target.closest && target.closest('[data-element-selector-panel]')

        // 开发者模式：仅捕获面板自身元素
        if (self._devMode) {
          if (!isPanel) return
        } else {
          if (isPanel) return
        }

        e.stopPropagation()
        self._hoveredElement = target
        self._updateHoverOverlay(target.getBoundingClientRect())
      }

      this._handleClick = (e) => {
        if (!self._isActive) return
        if (self._wasDragging) { self._wasDragging = false; return }

        const target = e.target
        const isPanel = target.closest && target.closest('[data-element-selector-panel]')

        // 开发者模式：仅捕获面板自身元素
        if (self._devMode) {
          if (!isPanel) return
        } else {
          if (isPanel) return
        }
        // 忽略选中元素标签（overlay）内的元素
        if (target.closest && target.closest('[data-element-selector-overlay]')) return

        // Cmd+Click 穿透：允许正常导航
        if (e.metaKey) return

        // 暂停时不拦截点击
        if (self._isPaused) return

        e.preventDefault()
        e.stopPropagation()

        self._selectElement(target)
      }

      this._handleKeyDown = (e) => {
        // ESC 关闭选择模式
        if (e.key === 'Escape' && self._isActive) {
          self.stop()
        }
      }

      this._handleScroll = () => {
        self._updateSelectedOverlays()
      }

      this._handleResize = () => {
        self._updateSelectedOverlays()
      }

      document.addEventListener('mousemove', this._handleMouseMove, true)
      document.addEventListener('click', this._handleClick, true)
      document.addEventListener('keydown', this._handleKeyDown, true)
      window.addEventListener('scroll', this._handleScroll, true)
      window.addEventListener('resize', this._handleResize)

      // SPA 路由变化检测 + 元素 DOM 重绑定（轮询方式，兼容所有框架）
      this._lastUrl = window.location.href
      this._urlCheckInterval = setInterval(() => {
        if (window.location.href !== self._lastUrl) {
          self._onUrlChanged()
        } else {
          // 尝试为当前页面缺少 DOM 引用的元素恢复绑定（SPA 渲染延迟）
          self._tryRebindElements()
        }
      }, 200)
    },

    _unbindEvents() {
      if (this._handleMouseMove) {
        document.removeEventListener('mousemove', this._handleMouseMove, true)
      }
      if (this._handleClick) {
        document.removeEventListener('click', this._handleClick, true)
      }
      if (this._handleKeyDown) {
        document.removeEventListener('keydown', this._handleKeyDown, true)
      }
      if (this._handleScroll) {
        window.removeEventListener('scroll', this._handleScroll, true)
      }
      if (this._handleResize) {
        window.removeEventListener('resize', this._handleResize)
      }
      if (this._urlCheckInterval) {
        clearInterval(this._urlCheckInterval)
        this._urlCheckInterval = null
      }
    },

    _updateHoverOverlay(rect) {
      if (!this._hoverOverlay) return
      this._hoverOverlay.style.display = 'block'
      this._hoverOverlay.style.zIndex = this._devMode ? '2147483648' : '2147483646'
      this._hoverOverlay.style.left = rect.left + 'px'
      this._hoverOverlay.style.top = rect.top + 'px'
      this._hoverOverlay.style.width = rect.width + 'px'
      this._hoverOverlay.style.height = rect.height + 'px'
    },

    _hideHoverOverlay() {
      if (this._hoverOverlay) {
        this._hoverOverlay.style.display = 'none'
      }
    },

    _updateSelectedOverlays() {
      const self = this

      // 移除旧的遮罩
      this._selectedOverlays.forEach(overlay => overlay.remove())
      this._selectedOverlays = []

      // 颜色数组
      const colors = [
        '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
      ]

      // 只为有 DOM 引用的当前页面元素创建遮罩
      this._selectedElements.forEach((el, index) => {
        if (!el.element) return  // 其他页面的元素没有 DOM 引用
        const rect = el.element.getBoundingClientRect()
        const color = colors[(el.id - 1) % colors.length]  // 颜色基于 ID，不是索引
        const label = '' + el.id  // 使用固定 ID

        const overlay = createElement('div', {
          position: 'fixed',
          pointerEvents: 'none',
          border: '2px solid ' + color,
          background: color + '20',
          zIndex: self._devMode ? '2147483648' : '2147483645',
          left: rect.left + 'px',
          top: rect.top + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px'
        }, { 'data-element-selector-overlay': 'true' })

        // 标签容器
        const labelContainer = createElement('div', {
          position: 'absolute',
          top: '-28px',
          left: '0',
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'auto'
        })

        // 标签文字
        const labelEl = createElement('span', {
          background: color,
          color: '#fff',
          padding: '3px 8px',
          borderRadius: '4px 0 0 4px',
          fontSize: '12px',
          fontWeight: '500',
          whiteSpace: 'nowrap'
        }, { textContent: label })
        labelContainer.appendChild(labelEl)

        // 关闭按钮
        const closeBtn = createElement('span', {
          background: color,
          color: '#fff',
          padding: '3px 6px',
          borderRadius: '0 4px 4px 0',
          fontSize: '12px',
          cursor: 'pointer',
          fontWeight: 'bold',
          borderLeft: '1px solid rgba(255,255,255,0.3)'
        }, { textContent: '✕' })
        closeBtn.onclick = ((elementId) => (event) => {
          event.stopPropagation()
          event.preventDefault()
          self._removeElement(elementId)
        })(el.id)  // 传递 ID 而不是索引
        labelContainer.appendChild(closeBtn)

        overlay.appendChild(labelContainer)

        if (self._container) {
          self._container.appendChild(overlay)
        }
        self._selectedOverlays.push(overlay)
      })
    },

    _selectElement(target) {
      const info = collectElementInfo(target)
      const existingIndex = this._selectedElements.findIndex(el => el.selector === info.selector && el.url === window.location.href)

      if (existingIndex !== -1) {
        // 取消选中
        this._selectedElements.splice(existingIndex, 1)
      } else {
        // 添加选中（无数量限制）
        this._selectedElements.push({
          id: this._nextId++,  // 分配固定 ID
          selector: info.selector,
          element: target,
          info: info,
          url: window.location.href
        })
      }

      this._updateSelectedOverlays()
      this._refreshPanel()
      this._notifyStateChange()
      this._saveToStorage()
    },

    _removeElement(id) {
      // 根据 ID 删除元素（不是索引）
      this._selectedElements = this._selectedElements.filter(el => el.id !== id)
      this._updateSelectedOverlays()
      this._refreshPanel()
      this._notifyStateChange()
      this._saveToStorage()
    },

    _refreshPanel() {
      if (!this._panel) return

      const content = this._panel.querySelector('#es-panel-content')
      if (content) this._updatePanelContent(content)
      this._updateHeaderButtons()

      // 开发者模式下禁用拖拽光标
      const header = this._panel.querySelector('#es-panel-header')
      if (header) header.style.cursor = this._devMode ? 'default' : 'grab'
    },

    // ==================== 拖拽相关方法 ====================

    /**
     * 开始拖拽面板
     */
    _startDrag(e) {
      if (!this._panel) return
      const self = this
      this._isDragging = true

      // 记录鼠标起始位置
      this._dragStartX = e.clientX
      this._dragStartY = e.clientY

      // 获取面板当前位置，将 bottom/right 定位转换为 top/left 定位
      const panelRect = this._panel.getBoundingClientRect()
      this._panelStartX = panelRect.left
      this._panelStartY = panelRect.top

      // 切换为 top/left 定位（方便拖拽偏移计算）
      this._panel.style.bottom = 'auto'
      this._panel.style.right = 'auto'
      this._panel.style.top = this._panelStartY + 'px'
      this._panel.style.left = this._panelStartX + 'px'

      // 拖拽时切换鼠标样式
      const header = this._panel.firstChild
      if (header) header.style.cursor = 'grabbing'

      // 绑定 document 级别的 mousemove 和 mouseup
      this._handleDragMouseMove = (e) => {
        self._onDrag(e)
      }
      this._handleDragMouseUp = (e) => {
        self._stopDrag(e)
      }
      document.addEventListener('mousemove', this._handleDragMouseMove, true)
      document.addEventListener('mouseup', this._handleDragMouseUp, true)

      // 阻止传播，避免触发元素选择逻辑
      e.preventDefault()
      e.stopPropagation()
    },

    /**
     * 拖拽进行中
     */
    _onDrag(e) {
      if (!this._isDragging || !this._panel) return

      // 计算偏移量
      const deltaX = e.clientX - this._dragStartX
      const deltaY = e.clientY - this._dragStartY

      let newX = this._panelStartX + deltaX
      let newY = this._panelStartY + deltaY

      // 获取面板尺寸和视口尺寸，限制在视口范围内
      const panelRect = this._panel.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      // 限制左边界
      if (newX < 0) newX = 0
      // 限制右边界
      if (newX + panelRect.width > viewportWidth) newX = viewportWidth - panelRect.width
      // 限制上边界
      if (newY < 0) newY = 0
      // 限制下边界
      if (newY + panelRect.height > viewportHeight) newY = viewportHeight - panelRect.height

      this._panel.style.left = newX + 'px'
      this._panel.style.top = newY + 'px'

      // 阻止传播，避免触发元素选择逻辑
      e.preventDefault()
      e.stopPropagation()
    },

    /**
     * 结束拖拽
     */
    _stopDrag(e) {
      if (!this._isDragging) return

      // 标记拖拽刚结束，防止 click 误触发
      this._wasDragging = true

      this._isDragging = false

      // 恢复鼠标样式
      const header = this._panel ? this._panel.firstChild : null
      if (header) header.style.cursor = 'grab'

      // 清除 document 级别的事件监听
      if (this._handleDragMouseMove) {
        document.removeEventListener('mousemove', this._handleDragMouseMove, true)
        this._handleDragMouseMove = null
      }
      if (this._handleDragMouseUp) {
        document.removeEventListener('mouseup', this._handleDragMouseUp, true)
        this._handleDragMouseUp = null
      }

      // 阻止传播
      e.preventDefault()
      e.stopPropagation()
    },

    _clearSelection() {
      // 只清除当前页面的元素，保留其他页面的元素
      const currentUrl = window.location.href
      this._selectedElements = this._selectedElements.filter(el => el.url !== currentUrl)
      this._updateSelectedOverlays()
      this._refreshPanel()
      this._notifyStateChange()
      this._saveToStorage()
    },

    _clearAllSelections() {
      // 清除所有页面的所有选择
      this._selectedElements = []
      this._nextId = 1
      this._updateSelectedOverlays()
      this._refreshPanel()
      this._notifyStateChange()
      this._saveToStorage()
    },

    _getPromptText() {
      const promptInput = document.getElementById('es-prompt-input')
      return promptInput ? promptInput.value.trim() : ''
    },

    _copySelector(el) {
      const self = this
      const prompt = this._getPromptText()
      let text = ''
      if (prompt) {
        text += prompt + '\n\n'
      }
      if (el.url && !self._devMode) {
        text += '页面: ' + el.url + '\n'
      }
      text += formatElementInfo(el.info, el.id)
      navigator.clipboard.writeText(text).then(() => {
        self._showCopyFeedback('已复制！')
      })
    },

    _copyAllSelectors() {
      const self = this
      const prompt = this._getPromptText()

      // 无元素且无 prompt 时不执行
      if (this._selectedElements.length === 0 && !prompt) return

      const currentUrl = window.location.href

      // 按 URL 分组
      const grouped = {}
      this._selectedElements.forEach((el) => {
        const url = el.url || currentUrl
        if (!grouped[url]) grouped[url] = []
        grouped[url].push(el)
      })

      // 当前页面排在最前面
      const urls = Object.keys(grouped).sort((a, b) => {
        if (a === currentUrl) return -1
        if (b === currentUrl) return 1
        return a.localeCompare(b)
      })

      let text = ''
      if (prompt) {
        text += prompt + '\n\n'
      }

      urls.forEach((url, index) => {
        if (index > 0) text += '\n'
        // 开发者模式不带 URL
        if (!self._devMode) {
          text += '页面: ' + url + '\n'
        }
        const elements = grouped[url]
        text += elements.map((el) => {
          return formatElementInfo(el.info, el.id)
        }).join('\n\n')
        text += '\n'
      })

      navigator.clipboard.writeText(text.trimEnd()).then(() => {
        self._showCopyFeedback('已复制所有选择器！')
      })
    },

    _showCopyFeedback(message) {
      const info = this._panel ? this._panel.querySelector('#es-selected-info') : null
      if (info) {
        const originalColor = info.style.color
        info.textContent = message
        info.style.color = '#90ee90'
        setTimeout(() => {
          this._updateHeaderButtons()
          info.style.color = originalColor || ''
        }, 1500)
      }
    },

    /**
     * 切换暂停/继续状态
     */
    _togglePause() {
      this._isPaused = !this._isPaused
      if (this._isPaused) {
        document.body.style.cursor = ''
        this._hideHoverOverlay()
      } else {
        document.body.style.cursor = 'crosshair'
      }
      // 切换标题栏颜色
      const header = this._panel ? this._panel.querySelector('#es-panel-header') : null
      if (header) {
        header.style.background = this._isPaused
          ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
      }
      this._refreshPanel()
    },

    /**
     * URL 变化时的处理（SPA 路由切换）
     */
    _onUrlChanged() {
      const newUrl = window.location.href
      if (newUrl === this._lastUrl) return
      const oldUrl = this._lastUrl
      this._lastUrl = newUrl

      // 旧页面的元素清空 DOM 引用
      this._selectedElements.forEach(el => {
        if (el.url === oldUrl) {
          el.element = null
        }
      })

      this._updateSelectedOverlays()
      this._refreshPanel()
      this._saveToStorage()
    },

    /**
     * 尝试为当前页面缺少 DOM 引用的元素恢复绑定
     * 由轮询定时器调用，处理 SPA 渲染延迟的情况
     */
    _tryRebindElements() {
      const currentUrl = window.location.href
      let changed = false
      this._selectedElements.forEach(el => {
        if (el.url === currentUrl && !el.element) {
          try {
            const dom = document.querySelector(el.selector)
            if (dom) {
              el.element = dom
              changed = true
            }
          } catch (e) {}
        }
      })
      if (changed) {
        this._updateSelectedOverlays()
        this._refreshPanel()
      }
    },

    /**
     * 保存选择数据到 chrome.storage.session
     */
    _saveToStorage() {
      if (!chrome || !chrome.storage || !chrome.storage.session) return
      const data = {
        selections: this._selectedElements.map(el => ({
          id: el.id,
          url: el.url || window.location.href,
          info: el.info,
          selector: el.selector
        })),
        nextId: this._nextId,
        isActive: this._isActive
      }
      chrome.storage.session.set({ elementSelectorData: data })
    },

    /**
     * 从 chrome.storage.session 加载选择数据
     */
    _loadFromStorage() {
      if (!chrome || !chrome.storage || !chrome.storage.session) return
      const self = this
      chrome.storage.session.get('elementSelectorData', (result) => {
        if (!result || !result.elementSelectorData) return
        const data = result.elementSelectorData
        const currentUrl = window.location.href

        // 恢复 nextId
        if (data.nextId && data.nextId > self._nextId) {
          self._nextId = data.nextId
        }

        // 恢复选择数据
        if (data.selections && data.selections.length > 0) {
          data.selections.forEach((item) => {
            // 检查是否已经在内存中（避免重复）
            if (self._selectedElements.some(el => el.id === item.id)) return

            const entry = {
              id: item.id,
              url: item.url,
              info: item.info,
              selector: item.selector,
              element: null
            }

            // 当前页面的元素尝试重新找到 DOM
            if (item.url === currentUrl) {
              try {
                const dom = document.querySelector(item.selector)
                if (dom) {
                  entry.element = dom
                }
              } catch (e) {
                // 选择器无效，忽略
              }
            }

            self._selectedElements.push(entry)
          })

          // 刷新 UI
          self._updateSelectedOverlays()
          self._refreshPanel()
          self._notifyStateChange()
        }
      })
    },

    _notifyStateChange() {
      // 发送消息给 background script（检查 runtime 是否存在）
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: 'STATE_CHANGED',
            isActive: this._isActive,
            count: this._selectedElements.length
          })
        } catch (e) {
          // 忽略错误（扩展可能已被重新加载）
        }
      }
    }
  }

  // 监听来自 background/popup 的消息
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'TOGGLE') {
        ElementSelector.toggle()
        sendResponse({ success: true })
      } else if (message.type === 'PING') {
        // 响应 PING，表示 content script 已加载
        sendResponse({ success: true, loaded: true })
      }
      return true
    })
  } catch (e) {
    // 忽略错误（扩展可能已被重新加载）
  }

  // 挂载到全局（用于防止重复加载检测）
  window.__ElementSelectorExtension = ElementSelector

  // 全局自定义快捷键监听（自动注入后立即生效，无需先激活选择器）
  let _customShortcut = null

  function _matchesShortcut(e, s) {
    return e.code === s.key &&
      e.ctrlKey === s.ctrl &&
      e.metaKey === s.meta &&
      e.shiftKey === s.shift &&
      e.altKey === s.alt
  }

  try {
    chrome.storage.sync.get(['customShortcut', 'devMode'], (result) => {
      _customShortcut = result.customShortcut || null
      ElementSelector._devMode = !!result.devMode
    })

    chrome.storage.onChanged.addListener((changes) => {
      if ('customShortcut' in changes) {
        _customShortcut = changes.customShortcut.newValue || null
      }
      if ('devMode' in changes) {
        ElementSelector._devMode = !!changes.devMode.newValue
      }
    })

    document.addEventListener('keydown', (e) => {
      if (!_customShortcut) return
      if (_matchesShortcut(e, _customShortcut)) {
        e.preventDefault()
        e.stopPropagation()
        ElementSelector.toggle()
      }
    }, true)
  } catch (e) {
    // 忽略错误（扩展可能已被重新加载）
  }

  console.log('🎯 ElementSelector Content Script 已加载！')
})()
