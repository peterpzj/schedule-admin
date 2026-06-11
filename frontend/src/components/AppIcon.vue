<!--
  AppIcon.vue - 统一 SVG 图标组件
  替代项目里残留的 emoji（🏥/👨‍⚕️/🚪/📅/📋 等）
  优势：清晰矢量渲染 / a11y 友好（可加 aria-label）/ 主题色可控
  用法：<AppIcon name="hospital" :size="24" color="primary" aria-label="医院" />
-->
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="['app-icon', 'app-icon--' + name]"
    :aria-label="ariaLabel"
    :aria-hidden="ariaLabel ? undefined : 'true'"
    :role="ariaLabel ? 'img' : undefined"
  >
    <component :is="paths" />
  </svg>
</template>

<script setup>
import { computed, h } from 'vue'

const props = defineProps({
  name:        { type: String, required: true },
  size:        { type: [Number, String], default: 20 },
  strokeWidth: { type: [Number, String], default: 1.8 },
  ariaLabel:   { type: String, default: '' }
})

// 24x24 viewBox, 1.8 stroke, 圆角端点
// 用 h() 函数返回 SVG path 数组，简单图标直接 innerHTML
const PATHS = {
  // 医院：方框 + 十字
  hospital: () => [
    h('path', { d: 'M3 21V8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v13' }),
    h('path', { d: 'M9 21V12h6v9' }),
    h('path', { d: 'M12 6v6' }),
    h('path', { d: 'M9 9h6' }),
    h('path', { d: 'M3 21h18' })
  ],
  // 医生：人形 + 十字
  doctor: () => [
    h('circle', { cx: 12, cy: 7, r: 3 }),
    h('path', { d: 'M5 21v-1a7 7 0 0 1 14 0v1' }),
    h('path', { d: 'M12 14v3' }),
    h('path', { d: 'M10.5 15.5h3' })
  ],
  // 诊室：门
  door: () => [
    h('path', { d: 'M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16' }),
    h('path', { d: 'M5 21h14' }),
    h('circle', { cx: 15, cy: 12, r: 0.7, fill: 'currentColor' })
  ],
  // 排班：日历
  calendar: () => [
    h('rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }),
    h('path', { d: 'M3 10h18' }),
    h('path', { d: 'M8 3v4M16 3v4' }),
    h('circle', { cx: 8, cy: 14, r: 1, fill: 'currentColor' }),
    h('circle', { cx: 12, cy: 14, r: 1, fill: 'currentColor' }),
    h('circle', { cx: 16, cy: 14, r: 1, fill: 'currentColor' })
  ],
  // 列表/管理
  list: () => [
    h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
    h('path', { d: 'M7 9h10M7 13h10M7 17h6' })
  ],
  // 上下箭头（导入/导出 / 趋势）
  arrowUpDown: () => [
    h('path', { d: 'M7 4v16M3 8l4-4 4 4' }),
    h('path', { d: 'M17 20V4M21 16l-4 4-4-4' })
  ],
  // 楼层/楼栋
  building: () => [
    h('rect', { x: 4, y: 3, width: 16, height: 18, rx: 1 }),
    h('path', { d: 'M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2' }),
    h('path', { d: 'M10 21v-3h4v3' })
  ],
  // 加载
  spinner: () => [
    h('path', { d: 'M12 2a10 10 0 0 1 10 10' }),
    h('path', { d: 'M12 22a10 10 0 0 1-10-10' })
  ],
  // 文件
  file: () => [
    h('path', { d: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z' }),
    h('path', { d: 'M14 3v6h6' })
  ],
  // 警告
  warning: () => [
    h('path', { d: 'M10.3 3.86a2 2 0 0 1 3.4 0l8.5 14a2 2 0 0 1-1.7 3.14H3.5a2 2 0 0 1-1.7-3.14z' }),
    h('path', { d: 'M12 9v4M12 17h.01' })
  ],
  // 刷新
  refresh: () => [
    h('path', { d: 'M3 12a9 9 0 0 1 15-6.7L21 8' }),
    h('path', { d: 'M21 3v5h-5' }),
    h('path', { d: 'M21 12a9 9 0 0 1-15 6.7L3 16' }),
    h('path', { d: 'M3 21v-5h5' })
  ]
}

const paths = computed(() => {
  const factory = PATHS[props.name]
  return factory ? factory() : []
})
</script>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  color: currentColor;
}
.app-icon--spinner {
  animation: spin 0.8s linear infinite;
  transform-origin: 50% 50%;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
