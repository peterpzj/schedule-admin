# 排班管理后台 - UI/UX 改进清单

## 设计系统(基于 ui-ux-pro-max 生成)

| 维度 | 选定 |
|------|------|
| **Pattern** | Data-Dense + Drill-Down(KPI 卡片 + 详细列表/图表) |
| **Style** | Data-Dense Dashboard(多图表、紧凑布局、高数据密度) |
| **Primary** | `#0891B2` 沉稳青色 (Trust / 医院) |
| **Secondary** | `#22D3EE` 亮青 |
| **CTA** | `#059669` 健康绿(成功/确认) |
| **Background** | `#ECFEFF` 极浅青 |
| **Text** | `#164E63` 深青灰(对比度 7:1+) |
| **字体** | Fira Sans(正文) + Fira Code(数字/工号) |
| **性能** | ⚡ 优秀 / **a11y** | ✓ WCAG AA |

---

## P0 — 必须修(用户每天撞到)

| # | 项目 | 现状 | 修复 | 工作量 |
|---|------|------|------|--------|
| **P0-U1** | 排班列表加载白屏 → 骨架屏 | `v-if="loading"` + `<div>加载中...</div>` | Element Plus `<el-skeleton>` 行级骨架 | 0.5d |
| **P0-U2** | 错误提示不显眼 / 一闪而过 | 弹一次就消失 | `ElMessage` 改为 `ElNotification` 持久 + 错误码 | 0.5d |
| **P0-U3** | 操作按钮无 loading 反馈 | 点了之后按钮还亮 | `<el-button :loading="submitting">` | 0.5d |
| **P0-U4** | 表单提交后无成功反馈 | 列表默默刷新 | 成功后 `ElMessage.success('已保存')` | 0.5h |
| **P0-U5** | 401 后不跳登录页 | 用户卡死 | axios 拦截器 → 401 → `localStorage.clear()` + `router.push('/login')` | 1d |

## P1 — 强烈推荐(易感知体验提升)

### 1. 排班时间线视图(已有,待打磨)

| # | 项目 | 现状 | 修复 |
|---|------|------|------|
| P1-T1 | 50×24=1200 格子渲染慢 | 已用 CSS Grid | 加 `content-visibility: auto` 跳过屏外 |
| P1-T2 | 鼠标悬停无提示 | 只有 click | `title` 属性 + 自定义 tooltip |
| P1-T3 | 周末/节假日无视觉区分 | 全白 | 周六加浅灰底,周日加更浅灰 |
| P1-T4 | 排班冲突无标红 | 默默失败 | 红色边框 + 叹号图标 |
| P1-T5 | 无缩放控制 | 字太小看不全 | +/- 缩放按钮,localStorage 记忆 |
| P1-T6 | 拖拽改时段 | 只能输入 | HTML5 drag/drop 重排 |

### 2. 登录页

| # | 项目 | 现状 | 修复 |
|---|------|------|------|
| P1-L1 | 错误信息模糊 | "账号或密码错误" | 加"剩余尝试次数: 8/10" |
| P1-L2 | 无密码强度提示 | 改密时不知道 | `<el-progress>` 实时显示 |
| P1-L3 | CapsLock 状态未提示 | 误触 | 监听 keydown 检测 |
| P1-L4 | "记住我"未实现 | 每次都输 | localStorage + JWT 长效 |

### 3. 数据看板(已有,待优化)

| # | 项目 | 修复 |
|---|------|------|
| P1-D1 | KPI 卡片用 Material 风格数字 | `<el-statistic>` + Fira Code 字体 |
| P1-D2 | 图表无 loading 态 | ECharts `showLoading()` + `hideLoading()` |
| P1-D3 | 图表 tooltip 文字小 | 改 14px + 加白底边框 |
| P1-D4 | 院区切换无动画 | 加 150ms fade |
| P1-D5 | 数字无千分位 | `1,234` 而非 `1234` |

### 4. 通用列表页(医生/诊室/科室/门诊/诊区/时段)

| # | 项目 | 修复 |
|---|------|------|
| P1-Tab1 | `<el-table>` 行高太密 | `:row-style="{ height: '48px' }"` |
| P1-Tab2 | 无空数据态 | `<el-empty>` 友好插画 |
| P1-Tab3 | 删除前无确认 | `ElMessageBox.confirm` 弹窗 |
| P1-Tab4 | 序号 # 列 折行 | 已修 ✅ |
| P1-Tab5 | 搜索框不防抖 | `lodash.debounce` 300ms |

## P2 — 建议(锦上添花)

### 可访问性(a11y) — CRITICAL

| # | 项目 | 修复 |
|---|------|------|
| P2-A1 | 图标按钮无 aria-label | `<el-button aria-label="删除">` |
| P2-A2 | 颜色对比 < 4.5:1 | 全量审查 #164E63 主文 / #94A3B8 副文 |
| P2-A3 | focus 环被覆盖 | `*:focus-visible { outline: 2px solid #0891B2 }` |
| P2-A4 | 表格无 caption / scope | `<th scope="col">` |
| P2-A5 | 表单无 label 关联 | `<el-form-item label="..." for="...">` |
| P2-A6 | 错误不只靠颜色 | 红色 + 错误图标 + 文本 |
| P2-A7 | `prefers-rereduced-motion` | 媒体查询关闭过渡 |

### 触屏/交互

| # | 项目 | 修复 |
|---|------|------|
| P2-T1 | 移动端按钮 < 44x44px | 媒体查询放大 |
| P2-T2 | cursor 不是 pointer | 全局 `a, button { cursor: pointer }` |
| P2-T3 | hover 状态闪烁 | `transition-colors duration-200` |

### 性能

| # | 项目 | 修复 |
|---|------|------|
| P2-P1 | 首屏 ECharts 全量加载 | 路由懒加载 + 按需引入 |
| P2-P2 | 大列表 1000+ 行卡 | `<el-table-v2>` 虚拟滚动 |
| P2-P3 | 图标全量打包 | 按需 icon(图标树摇) |
| P2-P4 | content-visibility 未用 | 屏外 section 跳过渲染 |
| P2-P5 | image 懒加载 | `<el-image lazy>` |

### 布局/响应式

| # | 项目 | 修复 |
|---|------|------|
| P2-L1 | 移动端表格横向溢出 | 卡片式布局 fallback |
| P2-L2 | sidebar 在小屏不折叠 | `<el-aside :width="isMobile ? '0' : '220px'">` |
| P2-L3 | 字号 < 16px | 媒体查询调大 |
| P2-L4 | 暗色主题未实现 | Element Plus 主题切换 |

### 动画

| # | 项目 | 修复 |
|---|------|------|
| P2-An1 | 页面切换硬切 | `<router-view v-slot>` + `<Transition>` 200ms fade |
| P2-An2 | 列表删除无动画 | `<TransitionGroup>` |
| P2-An3 | 数字滚动无动效 | `el-statistic` + count-up |
| P2-An4 | 弹窗/抽屉突兀 | Element Plus 默认 + 100ms 缓动 |

### 数据可视化

| # | 项目 | 修复 |
|---|------|------|
| P2-V1 | 排班占比(时段)用饼图 | 改 **Stacked Bar**(易比较) |
| P2-V2 | 院区排名 → 横向 Bar | 文字易读 |
| P2-V3 | 周次分布 → Heatmap | 7×N 矩阵 |
| P2-V4 | 趋势图缺图例 | 加 ECharts legend + tooltip 数值 |
| P2-V5 | 颜色单一 | 用 ECharts categorical palette(青/绿/橙/红循环) |

---

## 轮 2 推荐组合(1 周工作量)

### **核心套(必做,5 天)**
- P0-U1/U2/U3/U4/U5 加载/错误/反馈 全套
- P1-Tab1/2/3 列表行高/空态/删除确认
- P2-A1/A2/A3 a11y 基础三件套
- P2-T1/T2 cursor + 触屏

### **加分组(锦上添花,2 天)**
- P1-T1/2/3 时间线视图打磨
- P2-P1/P2 大图表/虚拟滚动
- P2-An1 页面切换动画

### **主题套(可选,1 天)**
- 全量色板替换为 #0891B2 主色
- Fira Sans 字体
- 暗色主题开关

---

## 实施顺序建议

| Day | 内容 |
|-----|------|
| 1 | P0-U1/U2/U3/U4/U5(全局 loading/error/feedback) |
| 2 | P1-Tab1/2/3(列表基础体验) |
| 3 | P2-A1/A2/A3(a11y 基础) + P2-T1/T2(交互) |
| 4 | P1-T1/2/3(时间线打磨) + P2-V1/2(图表优化) |
| 5 | P2-An1(过渡动画) + 全局配色替换 + 回归测试 |

---

## 验收清单

- [ ] 所有按钮 ≥ 44x44px
- [ ] 所有图标按钮有 aria-label
- [ ] 文本对比度 ≥ 4.5:1
- [ ] focus 环可见
- [ ] 加载有骨架屏
- [ ] 错误有清晰提示 + 重试入口
- [ ] 列表有空态
- [ ] 删除有确认
- [ ] 移动端无横向滚动
- [ ] `prefers-reduced-motion` 生效
- [ ] 时间线有周末区分
- [ ] 图表有图例 + tooltip
- [ ] 暗色主题(可选)

---

**如要开始,告诉我**:
- "**轮 2: 核心套**" → P0 + P1 基础 + P2 a11y(5 天)
- "**轮 2: 全套**" → 核心套 + 加分组 + 主题套(8 天)
- "**轮 2: 排班视图打磨**" → P1-T1~6 时间线专项(2 天)
