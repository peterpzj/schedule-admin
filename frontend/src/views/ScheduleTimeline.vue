<template>
  <div class="timeline-page view-wrap">
    <PageHeader
      title="排班时间轴"
      subtitle="横向诊室 × 纵向时间 — 直观呈现某院区某诊区某天的医生出诊安排"
      icon="Clock"
    />

    <!-- 顶部三级筛选 -->
    <div class="filter-bar panel-card">
      <!-- 第一级：院区 tab -->
      <el-tabs v-model="activeCampus" class="campus-tabs" @tab-change="onCampusChange">
        <el-tab-pane
          v-for="c in campuses"
          :key="c.code"
          :label="c.name"
          :name="c.code"
        />
      </el-tabs>

      <!-- 第二级：诊区下拉 + 第三级：星期几 radio -->
      <div class="filter-row">
        <div class="filter-item">
          <label>诊区</label>
          <el-select v-model="activeZone" placeholder="全部诊区" clearable filterable style="width: 200px" @change="loadSchedules">
            <el-option
              v-for="z in filteredZones"
              :key="z.code"
              :label="`${z.name} (${z.code})`"
              :value="z.code"
            />
          </el-select>
        </div>
        <div class="filter-item">
          <label>星期几</label>
          <el-radio-group v-model="activeDay" @change="loadSchedules">
            <el-radio-button v-for="d in 7" :key="d" :label="d">
              {{ dayShort(d) }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-item filter-item--right">
          <span class="stat-pill">
            共 <b>{{ totalSchedules }}</b> 条排班，<b>{{ rooms.length }}</b> 间诊室，<b>{{ doctorCount }}</b> 位医生
          </span>
        </div>
      </div>
    </div>

    <!-- 时间轴主体 -->
    <div v-if="loading" class="loading-block">
      <div v-for="i in 6" :key="i" class="skeleton-row">
        <div class="skeleton" style="width: 100px"></div>
        <div class="skeleton" style="flex: 1"></div>
      </div>
    </div>

    <div v-else-if="!rooms.length" class="empty-block">
      <div class="empty-icon" aria-hidden="true">
        <AppIcon name="calendar" :size="56" />
      </div>
      <div class="empty-text">该筛选条件下暂无诊室数据</div>
      <el-button type="primary" @click="router.push('/rooms')">前往诊室管理</el-button>
    </div>

    <div v-else class="timeline-container panel-card">
      <div class="timeline-scroll">
        <div
          class="timeline-grid"
          :style="gridStyle"
        >
          <!-- 左上角 -->
          <div class="grid-cell grid-corner">时间 \ 诊室</div>

          <!-- 顶部：诊室列表 -->
          <div
            v-for="(r, i) in rooms"
            :key="'h-' + r.code"
            class="grid-cell grid-header"
          >
            <div class="room-code">{{ r.code }}</div>
            <div class="room-name">{{ r.name }}</div>
          </div>

          <!-- 左侧：时间刻度 -->
          <div
            v-for="(slot, idx) in timeSlots"
            :key="'t-' + slot"
            class="grid-cell grid-time"
            :class="{ 'grid-time--hour': isHourMark(slot) }"
          >
            {{ slot }}
          </div>

          <!-- 空白格子背景（让网格视觉对齐） -->
          <div
            v-for="(_, idx) in rooms.length"
            :key="'col-' + idx"
            class="grid-cell grid-cell--empty"
            :style="{
              gridColumn: idx + 2,
              gridRow: '2 / span ' + timeSlots.length
            }"
          />

          <!-- 每个排班块（跨行） -->
          <div
            v-for="b in blocks"
            :key="'b-' + b.id"
            class="schedule-block"
            :class="'dept-' + b.deptBucket"
            :style="b.style"
            @click="onBlockClick(b)"
            :title="`${b.doctorName}（${b.deptName || '未填写科室'}）\n${b.roomName} · ${b.startLabel}-${b.endLabel}`"
          >
            <div class="block-doctor">{{ b.doctorName }}</div>
            <div class="block-meta">{{ b.startLabel }}-{{ b.endLabel }}</div>
            <div v-if="b.deptName" class="block-dept">{{ b.deptName }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 颜色图例：按科室分桶的 6 色调色板 -->
    <div v-if="rooms.length" class="legend-bar">
      <span class="legend-label">科室色：</span>
      <span v-for="(color, i) in DEPT_COLORS" :key="i" class="legend-item">
        <span class="legend-swatch" :style="{ background: color }"></span>
        <span class="legend-name">科室 {{ i + 1 }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
/**
 * 排班时间轴视图
 *
 * 数据流：
 *   1. onMounted 并发拉 campuses + zones + rooms + doctors
 *   2. 用户切换 tab/诊区/星期几 → loadSchedules() 调 /api/schedules?campusCode=&zoneCode=&dayOfWeek=
 *   3. 把返回的 [{...}] 转成 [{ id, roomCode, startRow, spanRow, doctorName, deptName, ... }]
 *   4. CSS Grid 用 grid-column + grid-row / span 跨行定位色块
 *
 * 关键设计：
 *   - 不引新依赖（vue-echarts 已够，加 FullCalendar +200KB 太重）
 *   - 50 × 24 = 1200 格用 CSS Grid 渲染 60fps 毫无压力
 *   - 后端查询走 idx_schedules_axis 复合索引（migration 006）
 *   - 跨时段排班（医生连排 2+ 时段）用 grid-row: span N 一行 CSS 解决
 *   - 跨格点击直接跳 /schedules 编辑那条排班
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import PageHeader from '@/components/PageHeader.vue'

const router = useRouter()

// ----- 基础数据 -----
const campuses = ref([])
const zones = ref([])
const rooms = ref([])         // 当前院区+诊区过滤后的诊室
const allRooms = ref([])      // 全部诊室（用于院区切回后恢复）
const doctors = ref([])

// ----- 筛选状态 -----
const activeCampus = ref('')
const activeZone = ref('')
const activeDay = ref(new Date().getDay() === 0 ? 7 : new Date().getDay())
const loading = ref(false)

// ----- 排班 -----
const schedules = ref([])
const totalSchedules = computed(() => schedules.value.length)
const doctorCount = computed(() => {
  const set = new Set()
  for (const s of schedules.value) if (s.doctorId) set.add(s.doctorId)
  return set.size
})

// ----- 时间轴几何 -----
// 8:00 - 20:00,每 30 分钟一格，共 24 格
const TIME_START_HOUR = 8
const TIME_END_HOUR = 20
const SLOT_MINUTES = 30
const SLOT_HEIGHT_PX = 36     // 每格 36px，1200 格总高 ~432px
const HEADER_HEIGHT_PX = 64
const TIME_COL_WIDTH = 90
const ROOM_COL_WIDTH = 130

const timeSlots = computed(() => {
  const arr = []
  const totalSlots = (TIME_END_HOUR - TIME_START_HOUR) * (60 / SLOT_MINUTES)
  for (let i = 0; i < totalSlots; i++) {
    const minutesFromStart = i * SLOT_MINUTES
    const hour = TIME_START_HOUR + Math.floor(minutesFromStart / 60)
    const min = minutesFromStart % 60
    arr.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`)
  }
  return arr
})

// 把 "HH:MM" 转成行索引（0-based）
function timeToRow(t) {
  if (!t) return 0
  const parts = String(t).split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1] || '0', 10)
  const totalMin = (h - TIME_START_HOUR) * 60 + m
  return Math.max(0, Math.floor(totalMin / SLOT_MINUTES))
}

// 是否整点（用于加粗显示）
function isHourMark(slot) {
  return slot.endsWith(':00')
}

const gridStyle = computed(() => ({
  gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${rooms.value.length}, ${ROOM_COL_WIDTH}px)`,
  gridTemplateRows: `${HEADER_HEIGHT_PX}px repeat(${timeSlots.value.length}, ${SLOT_HEIGHT_PX}px)`
}))

// ----- 派生数据：blocks -----
// 同一诊室、同一医生、连续时段合并为 1 个块（grid-row span > 1）
const blocks = computed(() => {
  if (!rooms.value.length) return []
  const roomIndex = new Map()
  rooms.value.forEach((r, i) => roomIndex.set(r.code, i))

  // 1) 按 (roomCode, doctorId) 分桶
  const grouped = new Map()
  for (const s of schedules.value) {
    if (!roomIndex.has(s.roomId)) continue  // 诊室不在当前过滤范围
    const key = `${s.roomId}|${s.doctorId || '_anon'}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(s)
  }

  const out = []
  let blockId = 0
  for (const [key, list] of grouped) {
    // 按时段开始时间排序
    list.sort((a, b) => timeToRow(a.startTime) - timeToRow(b.startTime))
    // 合并连续：当前 row 等于上一条 endRow 时合并
    let cur = null
    for (const s of list) {
      const startRow = timeToRow(s.startTime)
      const endRow = timeToRow(s.endTime)
      if (cur && cur.endRow >= startRow && cur.roomId === s.roomId && cur.doctorId === s.doctorId) {
        // 合并：扩展 cur 的 endRow，更新 endLabel
        cur.endRow = Math.max(cur.endRow, endRow)
        cur.endLabel = s.endTime
        cur.ids.push(s.id)
      } else {
        if (cur) out.push(cur)
        cur = {
          id: 'b' + (blockId++),
          ids: [s.id],
          roomId: s.roomId,
          roomName: s.roomName,
          roomIndex: roomIndex.get(s.roomId),
          doctorId: s.doctorId,
          doctorName: s.doctorName || '未排医生',
          deptName: s.department || '',
          startRow,
          endRow,
          startLabel: s.startTime,
          endLabel: s.endTime
        }
      }
    }
    if (cur) out.push(cur)
  }

  // 2) 计算每个块的 grid 定位样式 + 科室分桶颜色
  for (const b of out) {
    b.spanRow = Math.max(1, b.endRow - b.startRow)
    b.deptBucket = deptBucket(b.deptName)
    b.style = {
      gridColumn: (b.roomIndex + 2).toString(),
      gridRow: `${b.startRow + 2} / span ${b.spanRow}`
    }
  }
  return out
})

// ----- 颜色：按科室分桶 6 色调色板 -----
const DEPT_COLORS = ['#0369a1', '#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7']
const _deptCache = new Map()
function deptBucket(name) {
  if (!name) return 0
  if (_deptCache.has(name)) return _deptCache.get(name)
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const bucket = Math.abs(hash) % DEPT_COLORS.length
  _deptCache.set(name, bucket)
  return bucket
}

// ----- 数据加载 -----
async function loadMeta() {
  try {
    const [cRes, zRes, rRes, dRes] = await Promise.all([
      api.get('/campuses'),
      api.get('/zones'),
      api.get('/rooms'),
      api.get('/doctors')
    ])
    if (cRes.success) campuses.value = cRes.data
    if (zRes.success) zones.value = zRes.data
    if (rRes.success) allRooms.value = rRes.data
    if (dRes.success) doctors.value = dRes.data
    if (campuses.value.length && !activeCampus.value) {
      activeCampus.value = campuses.value[0].code
    }
    await nextTick()
    onCampusChange()
  } catch (e) {
    ElMessage.error('加载基础数据失败：' + e.message)
  }
}

function onCampusChange() {
  // 切院区：重置诊区选择 + 过滤诊室
  activeZone.value = ''
  applyRoomFilter()
  loadSchedules()
}

const filteredZones = computed(() => {
  if (!activeCampus.value) return zones.value
  return zones.value.filter(z => z.campus_code === activeCampus.value)
})

function applyRoomFilter() {
  // 过滤当前院区(+可选诊区)的诊室
  rooms.value = allRooms.value.filter(r => {
    if (activeCampus.value && r.campus_code !== activeCampus.value) return false
    if (activeZone.value && r.zone_code !== activeZone.value) return false
    return true
  })
}

async function loadSchedules() {
  applyRoomFilter()
  loading.value = true
  try {
    const params = {
      campusCode: activeCampus.value || undefined,
      zoneCode: activeZone.value || undefined,
      dayOfWeek: activeDay.value
    }
    const res = await api.get('/schedules', params)
    if (res.success) {
      schedules.value = res.data || []
    } else {
      schedules.value = []
    }
  } catch (e) {
    schedules.value = []
    ElMessage.error('加载排班失败：' + e.message)
  } finally {
    loading.value = false
  }
}

function dayShort(d) {
  return ['一', '二', '三', '四', '五', '六', '日'][d - 1] ? '周' + ['一', '二', '三', '四', '五', '六', '日'][d - 1] : '周' + d
}

function onBlockClick(b) {
  // 跳到排班管理页，定位第一条
  if (b.ids && b.ids.length) {
    router.push({ path: '/schedules', query: { highlight: b.ids[0] } })
  }
}

onMounted(loadMeta)
</script>

<style scoped>
.timeline-page { max-width: 100%; }

/* 顶部筛选 */
.filter-bar { padding: 16px 20px; margin-bottom: 16px; }
.campus-tabs { margin-bottom: 8px; }
.campus-tabs :deep(.el-tabs__nav-wrap)::after { height: 1px; }
.filter-row {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  padding-top: 4px;
}
.filter-item { display: flex; align-items: center; gap: 8px; }
.filter-item label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.filter-item--right { margin-left: auto; }
.stat-pill {
  display: inline-block;
  padding: 5px 14px;
  background: var(--color-primary-bg);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--color-primary-dark);
  font-weight: 600;
  border: 1px solid rgba(3, 105, 161, 0.1);
}
.stat-pill b { color: var(--color-primary); font-weight: 700; }

/* 时间轴主体 */
.timeline-container { padding: 0; overflow: hidden; }
.timeline-scroll {
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 320px);
  min-height: 400px;
  background: var(--bg-card);
}

.timeline-grid {
  display: grid;
  /* gridTemplateColumns/gridTemplateRows 由 :style 动态绑定 */
  position: relative;
}

.grid-cell {
  border-right: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  background: var(--bg-card);
  /* #问题1 一致性：禁止换行 */
  white-space: nowrap;
}

.grid-corner {
  background: var(--bg-muted);
  font-weight: 700;
  color: var(--text-primary);
  position: sticky;
  left: 0;
  top: 0;
  z-index: 3;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.grid-header {
  background: var(--bg-muted);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 6px 4px;
  border-bottom: 2px solid var(--border-base, #d1d5db);
}
.grid-header .room-code {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}
.grid-header .room-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
}

.grid-time {
  background: var(--bg-muted);
  position: sticky;
  left: 0;
  z-index: 1;
  font-size: 11px;
  color: var(--text-muted);
  border-right: 1px solid var(--border-base, #d1d5db);
}
.grid-time--hour {
  font-weight: 700;
  color: var(--text-primary);
  background: var(--bg-base, #f3f4f6);
}

.grid-cell--empty {
  background: var(--bg-card);
  /* 整列连续背景，由 grid-column + grid-row 跨所有时间行 */
  border-bottom: none;
  border-right: 1px solid var(--border-light);
}

/* 排班块（绝对定位在 grid 内） */
.schedule-block {
  margin: 1px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  font-size: 11px;
  color: #fff;
  line-height: 1.25;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: transform var(--duration-fast), box-shadow var(--duration-fast);
  z-index: 1;
  position: relative;
  border: 1px solid rgba(255,255,255,0.25);
}
.schedule-block:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  z-index: 4;
}
.schedule-block .block-doctor {
  font-weight: 700;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.schedule-block .block-meta {
  font-size: 10px;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.schedule-block .block-dept {
  font-size: 10px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 6 色调色板 */
.schedule-block.dept-0 { background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); }
.schedule-block.dept-1 { background: linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%); }
.schedule-block.dept-2 { background: linear-gradient(135deg, #059669 0%, #10b981 100%); }
.schedule-block.dept-3 { background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); }
.schedule-block.dept-4 { background: linear-gradient(135deg, #dc2626 0%, #f97316 100%); }
.schedule-block.dept-5 { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); }

/* 加载骨架屏 */
.loading-block { padding: 20px; }
.skeleton-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.skeleton {
  height: 32px;
  background: linear-gradient(90deg, var(--bg-muted) 0%, var(--bg-hover) 50%, var(--bg-muted) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 空态 */
.empty-block {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-icon { font-size: 64px; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 15px; margin-bottom: 16px; }

/* 颜色图例 */
.legend-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 20px;
  margin-top: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  font-size: 12px;
}
.legend-label { font-weight: 600; color: var(--text-secondary); }
.legend-item { display: flex; align-items: center; gap: 6px; color: var(--text-muted); }
.legend-swatch {
  width: 16px; height: 16px; border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
.legend-name { font-size: 11px; }

/* 响应式：诊室过多时左右滑 */
@media (max-width: 1200px) {
  .timeline-scroll { max-height: calc(100vh - 280px); }
}
</style>