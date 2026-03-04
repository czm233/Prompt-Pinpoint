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
    // 已经加载过，只切换状态
    window.__ElementSelectorExtension.toggle()
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
   * 获取元素的文本内容（截取前20字符）
   */
  function getTextContent(element) {
    const text = element.textContent ? element.textContent.trim() : ''
    return text.length > 20 ? text.substring(0, 20) + '...' : text
  }

  /**
   * 生成元素描述
   */
  function generateDescription(element) {
    const tagName = element.tagName.toLowerCase()
    const className = element.className && typeof element.className === 'string'
      ? element.className.trim().split(/\s+/)[0]
      : ''
    const text = getTextContent(element)

    let desc = '<' + tagName + '>'
    if (className) desc += ' .' + className
    if (text) desc += ' "' + text + '"'

    return desc
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
    _selectedElements: [],
    _hoveredElement: null,
    _nextId: 1, // 用于生成唯一 ID（编号不再回收）

    // DOM 元素引用
    _container: null,
    _hoverOverlay: null,
    _selectedOverlays: [],
    _panel: null,

    // 事件处理函数
    _handleMouseMove: null,
    _handleClick: null,
    _handleKeyDown: null,
    _handleScroll: null,
    _handleResize: null,

    /**
     * 启动选择器
     */
    start() {
      if (this._isActive) return
      this._isActive = true
      this._createUI()
      this._bindEvents()
      document.body.style.cursor = 'crosshair'
      this._notifyStateChange()
      console.log('ElementSelector 已启动')
    },

    /**
     * 停止选择器
     */
    stop() {
      if (!this._isActive) return
      this._isActive = false
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
        tagName: el.tagName,
        className: el.className,
        textContent: el.textContent,
        description: el.description
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

    _createPanel() {
      const self = this
      const panel = createElement('div', {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '360px',
        maxHeight: '500px',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: '2147483647',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }, { 'data-element-selector-panel': 'true' })

      // 头部
      const header = createElement('div', {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#fff',
        padding: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: '0'
      })
      header.innerHTML = '<span style="font-weight: 600; font-size: 15px;">🎯 元素选择器</span>'

      const closeBtn = createElement('button', {
        background: 'rgba(255,255,255,0.2)',
        border: 'none',
        color: '#fff',
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }, { textContent: '✕' })
      closeBtn.onclick = () => self.stop()
      header.appendChild(closeBtn)
      panel.appendChild(header)

      // 内容区域
      const content = createElement('div', {
        padding: '16px',
        flex: '1',
        minHeight: '0',
        overflowY: 'auto'
      }, { id: 'es-panel-content' })
      this._updatePanelContent(content)
      panel.appendChild(content)

      // 底部按钮区
      const footer = createElement('div', {
        padding: '12px 16px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        gap: '8px',
        flexShrink: '0'
      }, { id: 'es-panel-footer' })
      this._updatePanelFooter(footer)
      panel.appendChild(footer)

      // 提示区
      const tips = createElement('div', {
        padding: '8px 16px',
        background: '#f8fafc',
        fontSize: '11px',
        color: '#94a3b8',
        textAlign: 'center',
        flexShrink: '0'
      }, { textContent: '快捷键：Alt+S 开启/关闭 | ESC 关闭 | 点击 ✕ 可取消选中' })
      panel.appendChild(tips)

      return panel
    },

    _updatePanelContent(content) {
      const self = this
      content.innerHTML = ''

      if (this._selectedElements.length === 0) {
        content.innerHTML =
          '<div style="color: #64748b; text-align: center; padding: 20px 0;">' +
            '<div style="font-size: 40px; margin-bottom: 12px;">👆</div>' +
            '<div>点击页面元素进行选择</div>' +
          '</div>'
        return
      }

      // 颜色数组，用于区分不同元素
      const colors = [
        '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
      ]

      this._selectedElements.forEach((el, index) => {
        const color = colors[(el.id - 1) % colors.length]  // 颜色基于 ID，不是索引
        const label = '元素 ' + el.id  // 使用固定 ID

        // 简化的卡片：只显示标签和按钮
        const card = createElement('div', {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          marginBottom: index < self._selectedElements.length - 1 ? '8px' : '0',
          background: '#fff',
          borderRadius: '6px',
          border: '1px solid #e2e8f0'
        })

        // 标签
        const labelEl = createElement('span', {
          background: color,
          color: '#fff',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '500'
        }, { textContent: label })
        card.appendChild(labelEl)

        // 按钮容器
        const btnGroup = createElement('div', {
          display: 'flex',
          gap: '6px'
        })

        // 复制按钮
        const copyBtn = createElement('button', {
          background: 'transparent',
          border: '1px solid #e2e8f0',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
          color: '#475569'
        }, { textContent: '📋 复制' })
        copyBtn.onclick = () => self._copySelector(el.selector)
        btnGroup.appendChild(copyBtn)

        // 删除按钮
        const deleteBtn = createElement('button', {
          background: 'transparent',
          border: '1px solid #fecaca',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
          color: '#dc2626'
        }, { textContent: '🗑️ 删除' })
        deleteBtn.onclick = () => self._removeElement(el.id)
        btnGroup.appendChild(deleteBtn)

        card.appendChild(btnGroup)
        content.appendChild(card)
      })
    },

    _updatePanelFooter(footer) {
      const self = this
      footer.innerHTML = ''

      if (this._selectedElements.length > 0) {
        const copyAllBtn = createElement('button', {
          flex: '1',
          padding: '10px',
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '500'
        }, { textContent: '📋 复制全部', id: 'es-copy-all-btn' })
        copyAllBtn.onclick = () => self._copyAllSelectors()
        footer.appendChild(copyAllBtn)

        const clearBtn = createElement('button', {
          flex: '1',
          padding: '10px',
          background: '#fff',
          color: '#475569',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px'
        }, { textContent: '🗑️ 清除选择' })
        clearBtn.onclick = () => self._clearSelection()
        footer.appendChild(clearBtn)
      }

      const closeBtn = createElement('button', {
        flex: this._selectedElements.length === 0 ? '1' : 'none',
        padding: '10px 16px',
        background: '#ef4444',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '500'
      }, { textContent: '关闭' })
      closeBtn.onclick = () => self.stop()
      footer.appendChild(closeBtn)
    },

    _removeUI() {
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

        const target = e.target

        // 忽略面板内的元素
        if (target.closest && target.closest('[data-element-selector-panel]')) return

        e.stopPropagation()
        self._hoveredElement = target
        self._updateHoverOverlay(target.getBoundingClientRect())
      }

      this._handleClick = (e) => {
        if (!self._isActive) return

        const target = e.target

        // 忽略面板内的元素
        if (target.closest && target.closest('[data-element-selector-panel]')) return
        // 忽略选中元素标签（overlay）内的元素
        if (target.closest && target.closest('[data-element-selector-overlay]')) return

        e.preventDefault()
        e.stopPropagation()

        self._selectElement(target)
      }

      this._handleKeyDown = (e) => {
        // Alt+S 切换选择模式
        if (e.altKey && e.key.toLowerCase() === 's') {
          e.preventDefault()
          self.toggle()
        }
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
      window.addEventListener('keydown', this._handleKeyDown)
      window.addEventListener('scroll', this._handleScroll, true)
      window.addEventListener('resize', this._handleResize)
    },

    _unbindEvents() {
      if (this._handleMouseMove) {
        document.removeEventListener('mousemove', this._handleMouseMove, true)
      }
      if (this._handleClick) {
        document.removeEventListener('click', this._handleClick, true)
      }
      if (this._handleKeyDown) {
        window.removeEventListener('keydown', this._handleKeyDown)
      }
      if (this._handleScroll) {
        window.removeEventListener('scroll', this._handleScroll, true)
      }
      if (this._handleResize) {
        window.removeEventListener('resize', this._handleResize)
      }
    },

    _updateHoverOverlay(rect) {
      if (!this._hoverOverlay) return
      this._hoverOverlay.style.display = 'block'
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

      // 创建新的遮罩
      this._selectedElements.forEach((el, index) => {
        const rect = el.element.getBoundingClientRect()
        const color = colors[(el.id - 1) % colors.length]  // 颜色基于 ID，不是索引
        const label = '元素 ' + el.id  // 使用固定 ID

        const overlay = createElement('div', {
          position: 'fixed',
          pointerEvents: 'none',
          border: '2px solid ' + color,
          background: color + '20',
          zIndex: '2147483645',
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
      const selector = generateSelector(target)
      const existingIndex = this._selectedElements.findIndex(el => el.selector === selector)

      if (existingIndex !== -1) {
        // 取消选中
        this._selectedElements.splice(existingIndex, 1)
      } else {
        // 添加选中（无数量限制）
        this._selectedElements.push({
          id: this._nextId++,  // 分配固定 ID
          selector: selector,
          tagName: target.tagName.toLowerCase(),
          className: target.className && typeof target.className === 'string'
            ? target.className.trim().split(/\s+/).join('.')
            : '',
          textContent: getTextContent(target),
          description: generateDescription(target),
          element: target
        })
      }

      this._updateSelectedOverlays()
      this._refreshPanel()
      this._notifyStateChange()
    },

    _removeElement(id) {
      // 根据 ID 删除元素（不是索引）
      this._selectedElements = this._selectedElements.filter(el => el.id !== id)
      this._updateSelectedOverlays()
      this._refreshPanel()
      this._notifyStateChange()
    },

    _refreshPanel() {
      if (!this._panel) return

      const content = this._panel.querySelector('#es-panel-content')
      const footer = this._panel.querySelector('#es-panel-footer')

      if (content) this._updatePanelContent(content)
      if (footer) this._updatePanelFooter(footer)
    },

    _clearSelection() {
      this._selectedElements = []
      this._updateSelectedOverlays()
      this._refreshPanel()
      this._notifyStateChange()
    },

    _copySelector(selector) {
      const self = this
      navigator.clipboard.writeText(selector).then(() => {
        self._showCopyFeedback('已复制！')
      })
    },

    _copyAllSelectors() {
      const self = this
      const text = this._selectedElements.map((el) => {
        const label = '元素 ' + el.id  // 使用固定 ID
        return label + ': ' + el.selector + '\n描述: ' + el.description
      }).join('\n\n')

      navigator.clipboard.writeText(text).then(() => {
        self._showCopyFeedback('已复制所有选择器！')
      })
    },

    _showCopyFeedback(message) {
      const btn = document.getElementById('es-copy-all-btn')
      if (btn) {
        const originalText = btn.textContent
        btn.textContent = message
        setTimeout(() => {
          btn.textContent = originalText
        }, 1500)
      }
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

  console.log('🎯 ElementSelector Content Script 已加载！')
})()
