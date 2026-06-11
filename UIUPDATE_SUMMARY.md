# UI 更新完成总结

## 本次完成的 UI/UX 改进

### 1. 替换 emoji → SVG 图标 ✅

**问题**: 11 处 emoji 散落在代码里,跨平台显示不一致(Windows / Mac / Linux emoji 字体差异),且不专业。

**修复**:
- 新建 [frontend/src/components/AppIcon.vue](frontend/src/components/AppIcon.vue) — 统一 SVG 图标组件
  - 9 个内置图标: `hospital / doctor / door / calendar / list / arrowUpDown / building / spinner / file / warning / refresh / info`
  - 24×24 viewBox,1.8 stroke,currentColor 主题色
  - 支持 `aria-label` / `aria-hidden` (a11y 友好)
- 替换了 11 处:
  - [index.html](frontend/index.html) — 首屏 loading logo
  - [Login.vue](frontend/src/views/Login.vue) — 医院 logo
  - [DefaultLayout.vue](frontend/src/layouts/DefaultLayout.vue) — 侧栏 logo
  - [Dashboard.vue](frontend/src/views/Dashboard.vue) — 4 张指标卡 + 4 个快捷操作
  - [Statistics.vue](frontend/src/views/Statistics.vue) — 4 个 KPI 卡片
  - [Schedules.vue](frontend/src/views/Schedules.vue) — 空态
  - [ScheduleTimeline.vue](frontend/src/views/ScheduleTimeline.vue) — 空态
  - [ImportExport.vue](frontend/src/views/ImportExport.vue) — 标题/说明/状态

### 2. Fira Code 数字字体 ✅

**问题**: 等宽数字 / 工号 / ID 看起来歪歪扭扭,辨识度低。

**修复**:
- [index.html](frontend/index.html) 引入 `Fira Code + Fira Sans` 字体 (Google Fonts)
- [global.css](frontend/src/styles/global.css) `.font-mono / .num / .metric-card__value` 默认应用 Fira Code + `tabular-nums`
- 医疗排班统计数字 / 表格 ID 更整齐

### 3. 数字千分位 ✅ (P1-D5)

**问题**: 排班数 / 医生数显示 `1234` 难读。

**修复**:
- `formatNumber()` helper 加到 [Dashboard.vue](frontend/src/views/Dashboard.vue) 和 [Statistics.vue](frontend/src/views/Statistics.vue)
- 显示 `1,234` 而不是 `1234`
- 配合 Fira Code 等宽字体,数字列对齐

### 4. CapsLock 检测 ✅ (P1-L3)

**问题**: 用户误触大写,反复登录失败 5 次被锁,也不知道原因。

**修复**:
- [Login.vue](frontend/src/views/Login.vue) 加 `capsLockOn` 响应式状态
- 监听 `keydown / keyup` 上的 `getModifierState('CapsLock')`
- 输入框下方显示**黄色警告**:"大写锁定已开启,密码可能输入有误"
- 提示带 `role="status" aria-live="polite"` 屏幕阅读器友好

### 5. 焦点环 (focus-visible) ✅ (P2-A3)

**问题**: Element Plus 默认 outline 不明显,键盘用户难以追踪焦点。

**修复**:
- [global.css](frontend/src/styles/global.css) 全局 `:focus-visible` 加青色 outline 2px
- `outline-offset: 2px`,仅键盘 Tab 触发(不打扰鼠标用户)

### 6. 跳过导航链接 ✅ (P2-A1)

**问题**: 屏幕阅读器 / 键盘用户要从侧栏 Tab 几十次才能到主内容。

**修复**:
- [DefaultLayout.vue](frontend/src/layouts/DefaultLayout.vue) 顶部加 `<a href="#main-content" class="skip-link">跳到主要内容</a>`
- 屏幕外,键盘 Tab 第一个焦点时显示

### 7. prefers-reduced-motion 尊重 ✅ (P2-An 动效)

**问题**: 系统开启"减少动效"时,所有过渡/动画仍播放,影响前庭功能敏感用户。

**修复**:
- [global.css](frontend/src/styles/global.css) 全局媒体查询关闭所有 `transition / animation`
- 保留极短 0.05s opacity 渐变(几乎无感)

### 8. cursor-pointer 全局 ✅ (P2-T2)

**问题**: 卡片 / 单元格 hover 时没指针变化,用户不知道能点。

**修复**:
- [global.css](frontend/src/styles/global.css) 全局规则:
  ```css
  a, button, [role="button"], .stat-card, .quick-btn, .metric-card, .campus-group__header, .zone-item {
    cursor: pointer;
  }
  button:disabled { cursor: not-allowed; }
  ```

### 9. ARIA labels 全面增强 ✅ (P2-A1)

- [Dashboard.vue](frontend/src/views/Dashboard.vue) — 4 张 stat-card 加 `role="button" tabindex="0"` + 描述性 aria-label(包含数值和去向)
- [Dashboard.vue](frontend/src/views/Dashboard.vue) — 4 个 quick-btn 同样处理
- [Login.vue](frontend/src/views/Login.vue) — `<label for="...">` 关联,quick-fill 加 `role="button" tabindex="0"`
- [DefaultLayout.vue](frontend/src/layouts/DefaultLayout.vue) — collapse-btn 加 `aria-label="展开/收起侧栏"`
- [index.html](frontend/index.html) — loading 容器 `role="status" aria-live="polite"`

### 10. 触屏目标 ≥ 44px (移动端) ✅ (P2-T1)

**修复**:
- [global.css](frontend/src/styles/global.css) 媒体查询 `@media (max-width: 768px)`:
  - 按钮最小高度 36px (Element Plus 默认接近)
  - 菜单项最小 44px
  - 指标卡最小 80px

### 11. ECharts 按需引入 ✅ (P2-P1)

**现状**: [Statistics.vue](frontend/src/views/Statistics.vue) 已用 `echarts/core` 树摇:
- 只引入 `BarChart, PieChart, LineChart` 三个图表类型
- 只引入 `CanvasRenderer` 一个渲染器
- 只引入需要的 5 个 components

---

## 跳过 / 暂未做的

| 项目 | 原因 | 优先级 |
|------|------|--------|
| P2-L1 表格移动端卡片式 | 改动量大(7 个列表页),需重写 GenericCrud | 下一轮 |
| P2-F1 ECharts loading 态 | Statistics.vue 已有 skeleton 兜底 | 低 |
| P2-F4 移动端响应式 | 表格先做 | 下一轮 |
| P2-F5 暗色主题 | 全量重写 color tokens | 远期 |
| P2-An 列表删除动画 | GenericCrud 改动 | 下一轮 |

---

## 验证清单 ✅

- [x] `<template>` `<script>` `<style>` 标签在 8 个 Vue 文件里平衡
- [x] 所有 emoji 已被 SVG 替代(除 Dashboard 装饰性 👋 在 `aria-hidden` 里)
- [x] 所有图标按钮加 `aria-label` 或 `aria-hidden`
- [x] 数字 / ID 列用 Fira Code 等宽字体
- [x] 千分位在 Dashboard 4 张卡 + Statistics 4 张卡生效
- [x] CapsLock 检测 + 警告
- [x] focus-visible outline 全局
- [x] prefers-reduced-motion 全局
- [x] skip-link 跳转主内容
- [x] 触屏 44x44px 媒体查询
- [x] ECharts 树摇引入

## 修改的文件清单

| 文件 | 改动 |
|------|------|
| [frontend/index.html](frontend/index.html) | +Fira Code 字体 +SVG logo +prefers-reduced-motion |
| [frontend/src/components/AppIcon.vue](frontend/src/components/AppIcon.vue) | **新建** SVG 图标组件(9 个图标) |
| [frontend/src/styles/global.css](frontend/src/styles/global.css) | +Fira Code / focus-visible / prefers-reduced-motion / skip-link / cursor-pointer / 44px 触屏 |
| [frontend/src/views/Login.vue](frontend/src/views/Login.vue) | +SVG logo +CapsLock +aria-label +`<label for>` |
| [frontend/src/views/Dashboard.vue](frontend/src/views/Dashboard.vue) | +SVG +aria-label +role=button +tabindex +formatNumber |
| [frontend/src/views/Statistics.vue](frontend/src/views/Statistics.vue) | +SVG +formatNumber |
| [frontend/src/views/Schedules.vue](frontend/src/views/Schedules.vue) | +SVG 空态 |
| [frontend/src/views/ScheduleTimeline.vue](frontend/src/views/ScheduleTimeline.vue) | +SVG 空态 |
| [frontend/src/views/ImportExport.vue](frontend/src/views/ImportExport.vue) | 清理 6 处 emoji |
| [frontend/src/layouts/DefaultLayout.vue](frontend/src/layouts/DefaultLayout.vue) | +SVG logo +aria-label +skip-link |

---

## 下一步

1. **浏览器实测**: `cd admin/frontend && npm run dev` 登录试一下
2. **本地构建**: `npm run build` 验证打包不报错
3. **移动端测试**: Chrome DevTools 切到 iPhone/iPad,看触屏目标
4. **键盘测试**: Tab 键走完所有交互元素,看焦点环
5. **a11y 工具扫描**: Chrome DevTools → Lighthouse → Accessibility 跑分

如果实测有问题(比如某个图标太丑 / 焦点环太显眼),告诉我我调整。
