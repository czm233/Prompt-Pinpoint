/**
 * 图标生成脚本
 * 使用方法：在浏览器中打开此文件生成的 HTML，然后截图或使用 canvas 导出
 *
 * 或者使用 Node.js + canvas 库：
 * npm install canvas
 * node generate-icons.js
 */

const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const sizes = [16, 48, 128]
const iconsDir = path.join(__dirname, 'icons')

// 确保目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

sizes.forEach(size => {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // 背景渐变
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, '#3b82f6')
  gradient.addColorStop(1, '#2563eb')

  // 绘制圆角矩形背景
  const radius = size * 0.2
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(size - radius, 0)
  ctx.quadraticCurveTo(size, 0, size, radius)
  ctx.lineTo(size, size - radius)
  ctx.quadraticCurveTo(size, size, size - radius, size)
  ctx.lineTo(radius, size)
  ctx.quadraticCurveTo(0, size, 0, size - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()

  // 绘制靶心图标
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = size * 0.08
  ctx.lineCap = 'round'

  // 外圈
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2)
  ctx.stroke()

  // 内圈
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.18, 0, Math.PI * 2)
  ctx.stroke()

  // 中心点
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.06, 0, Math.PI * 2)
  ctx.fill()

  // 保存为 PNG
  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer)

  console.log(`✅ 已生成 icon${size}.png`)
})

console.log('🎉 所有图标生成完成！')
