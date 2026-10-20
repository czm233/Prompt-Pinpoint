# Prompt-Pinpoint
🎯 A Chrome extension to pinpoint web elements and copy selectors for AI-assisted refactoring. (一个精准定位网页元素并为 AI 辅助修改提供描述的 Chrome 插件)

## 界面语言

扩展默认使用 English。在 Options 顶部的 Language 下拉框中选择 English 或中文；设置会保存，并更新扩展菜单、选择器面板和截图提示。Chrome 自身的菜单文字仍由浏览器语言决定。

## 截图并复制

- 在扩展设置的「截图并复制」中点击输入框，按下组合键，再点击「保存」。与元素选择器的快捷键设置方式一致，不跳转 Chrome 设置。
- 首次保存截图快捷键时，需要允许 Chrome 提示的网站访问权限，才能在未点击扩展图标时直接截图；拒绝授权不会保存快捷键。
- 快捷键在 HTTP / HTTPS 网页中生效，不需要开启元素选择器。支持清除后保存，并检测与元素选择器快捷键的冲突。浏览器地址栏、内置页面等无法接收页面快捷键，可右键扩展图标选择「截图并复制」。
- 只截取当前标签页可见区域，不含标签栏、地址栏、收藏栏，也不会滚动截取整页。复制格式为 PNG，可直接粘贴到支持图片的应用。
- 普通 HTTPS 页面直接复制；受限页面可能短暂打开复制窗口，完成后自动关闭。复制成功后页面轻闪，右上角显示截图缩略图与「已复制」，1 秒后自动淡出，不提供手动关闭，也不会因鼠标悬停而延长。再次截图前自动移除旧提示。失败显示具体原因；浏览器内置页仍通过图标反馈。开启系统减少动态效果时不闪光、不播放动画。

本地更新：在 `chrome://extensions` 重新加载 Prompt-Pinpoint，并刷新要测试的网页；首次安装则加载本仓库的 `extension` 目录。

自动化检查：`node --test tests/*.test.cjs`。

# 例子
<img width="976" height="849" alt="image" src="https://github.com/user-attachments/assets/9965e7df-f44f-467e-a923-0fee7750361f" />

# 复制出来的内容
```text
页面URL: https://github.com/czm233/Prompt-Pinpoint/

元素 3: rails-partial.RailsPartial-module__d-contents__G5m4w > div.BorderGrid > div.BorderGrid-row:nth-of-type(2) > div.BorderGrid-cell
描述: <div> .BorderGrid-cell "Releases

    No rel..."

元素 4: rails-partial.RailsPartial-module__d-contents__G5m4w > div.BorderGrid > div.BorderGrid-row:nth-of-type(3) > div.BorderGrid-cell
描述: <div> .BorderGrid-cell "Packages
      0
..."
```
