<template>
  <div class="dashboard view-wrap">

    <!-- 顶部欢迎栏 -->
    <div class="welcome-bar">
      <div class="welcome-left">
        <div class="welcome-title">你好，{{ auth.user?.name || auth.user?.username }} <span aria-hidden="true">👋</span></div>
        <div class="welcome-sub">以下是今日门诊运营概览（周{{ todayLabel }}）</div>
      </div>
      <div class="welcome-right">
        <div class="live-badge" aria-label="实时数据"><span class="live-dot" aria-hidden="true"></span>实时数据</div>
        <div class="refresh-time">更新于 {{ refreshTime }}</div>
      </div>
    </div>

    <!-- 核心指标卡片 -->
    <div class="stat-grid">
      <div v-if="loading" v-for="i in 4" :key="'sk-' + i" class="stat-card stat-card--skeleton">
        <div class="skeleton" style="width: 48px; height: 48px; border-radius: 12px"></div>
        <div class="stat-card__body">
          <div class="skeleton" style="width: 60%; height: 12px; margin-bottom: 10px"></div>
          <div class="skeleton" style="width: 40%; height: 28px"></div>
        </div>
      </div>
      <template v-else>
        <div
          class="stat-card stat-card--campuses"
          role="button"
          tabindex="0"
          :aria-label="`院区，共 ${stats.campuses} 个，点击进入院区管理`"
          @click="router.push('/campuses')"
          @keyup.enter="router.push('/campuses')"
        >
          <AppIcon name="hospital" :size="36" class="stat-card__icon" />
          <div class="stat-card__body">
            <div class="stat-card__value">{{ formatNumber(stats.campuses) }}</div>
            <div class="stat-card__label">院区</div>
          </div>
          <div class="stat-card__arrow" aria-hidden="true">›</div>
        </div>
        <div
          class="stat-card stat-card--doctors"
          role="button"
          tabindex="0"
          :aria-label="`在职医生，共 ${stats.doctors} 人，点击进入医生管理`"
          @click="router.push('/doctors')"
          @keyup.enter="router.push('/doctors')"
        >
          <AppIcon name="doctor" :size="36" class="stat-card__icon" />
          <div class="stat-card__body">
            <div class="stat-card__value">{{ formatNumber(stats.doctors) }}</div>
            <div class="stat-card__label">在职医生</div>
          </div>
          <div class="stat-card__arrow" aria-hidden="true">›</div>
        </div>
        <div
          class="stat-card stat-card--rooms"
          role="button"
          tabindex="0"
          :aria-label="`诊室，共 ${stats.rooms} 个，点击进入诊室管理`"
          @click="router.push('/rooms')"
          @keyup.enter="router.push('/rooms')"
        >
          <AppIcon name="door" :size="36" class="stat-card__icon" />
          <div class="stat-card__body">
            <div class="stat-card__value">{{ formatNumber(stats.rooms) }}</div>
            <div class="stat-card__label">诊室</div>
          </div>
          <div class="stat-card__arrow" aria-hidden="true">›</div>
        </div>
        <div
          class="stat-card stat-card--schedules"
          role="button"
          tabindex="0"
          :aria-label="`周排班模板，共 ${stats.schedules} 条，点击进入排班管理`"
          @click="router.push('/schedules')"
          @keyup.enter="router.push('/schedules')"
        >
          <AppIcon name="calendar" :size="36" class="stat-card__icon" />
          <div class="stat-card__body">
            <div class="stat-card__value">{{ formatNumber(stats.schedules) }}</div>
            <div class="stat-card__label">周排班模板</div>
          </div>
          <div class="stat-card__arrow" aria-hidden="true">›</div>
        </div>
      </template>
    </div>

    <!-- #问题1 重构：上层数据按"院区→诊区"层级展示，下层数据按职称/时段/诊室分布 -->
    <div class="main-grid">

      <!-- 左列：院区→诊区二级树 -->
      <div class="main-left">
        <el-card class="panel" header="院区 → 诊区 排班分布">
          <div v-if="loading" class="loading-text">加载中…</div>
          <div v-else-if="!campusZoneTree.length" class="empty-text">暂无排班数据</div>
          <div v-else class="campus-tree">
            <div v-for="cg in campusZoneTree" :key="cg.campusCode" class="campus-group">
              <div class="campus-group__header" @click="toggleCampus(cg.campusCode)">
                <span class="caret" :class="{ open: cg.expanded }">▸</span>
                <span class="campus-group__name">{{ cg.campusName }}</span>
                <span class="campus-group__meta">
                  <el-tag size="small" effect="light" type="info">{{ cg.zones.length }} 诊区</el-tag>
                  <el-tag size="small" effect="light">{{ cg.totalSchedules }} 条排班</el-tag>
                </span>
              </div>
              <div v-show="cg.expanded" class="campus-group__body">
                <div v-for="zg in cg.zones" :key="zg.zoneCode" class="zone-item">
                  <span class="zone-item__name">{{ zg.zoneName }}</span>
                  <span class="zone-item__code">{{ zg.zoneCode }}</span>
                  <div class="zone-item__bar-wrap">
                    <div class="zone-item__bar" :style="{ width: barWidth(zg.scheduleCount, cg.totalSchedules) + '%', background: campusColor(cg.campusCode) }"></div>
                  </div>
                  <span class="zone-item__count">{{ zg.scheduleCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 快捷操作 -->
        <el-card class="panel" header="快捷操作">
          <div class="quick-actions">
            <div
              class="quick-btn"
              role="button"
              tabindex="0"
              aria-label="排班管理"
              @click="router.push('/schedules')"
              @keyup.enter="router.push('/schedules')"
            >
              <AppIcon name="calendar" :size="22" class="quick-btn__icon" />
              <span>排班管理</span>
            </div>
            <div
              class="quick-btn"
              role="button"
              tabindex="0"
              aria-label="导入导出"
              @click="router.push('/importExport')"
              @keyup.enter="router.push('/importExport')"
            >
              <AppIcon name="arrowUpDown" :size="22" class="quick-btn__icon" />
              <span>导入导出</span>
            </div>
            <div
              class="quick-btn"
              role="button"
              tabindex="0"
              aria-label="医生管理"
              @click="router.push('/doctors')"
              @keyup.enter="router.push('/doctors')"
            >
              <AppIcon name="doctor" :size="22" class="quick-btn__icon" />
              <span>医生管理</span>
            </div>
            <div
              class="quick-btn"
              role="button"
              tabindex="0"
              aria-label="诊室管理"
              @click="router.push('/rooms')"
              @keyup.enter="router.push('/rooms')"
            >
              <AppIcon name="door" :size="22" class="quick-btn__icon" />
              <span>诊室管理</span>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 右列：按职称 + 时段 + 诊室 -->
      <div class="main-right">
        <!-- #问题1 新增：按职称分布 -->
        <el-card class="panel" header="按职称分布">
          <div v-if="loading" class="loading-text">加载中…</div>
          <div v-else-if="!titleStats.length" class="empty-text">暂无医生数据</div>
          <div v-else class="title-list">
            <div v-for="ts in titleStats" :key="ts.title" class="title-item">
              <div class="title-item__label">
                <span class="title-dot" :style="{ background: titleColor(ts.title) }"></span>
                <span class="title-name">{{ ts.title || '未填写' }}</span>
              </div>
              <div class="title-item__bar-wrap">
                <div class="title-item__bar" :style="{ width: titleBarWidth(ts.doctorCount) + '%', background: titleColor(ts.title) }"></div>
              </div>
              <div class="title-item__meta">
                <span class="title-item__doctors">{{ ts.doctorCount }} 医生</span>
                <span class="title-item__schedules">{{ ts.scheduleCount }} 排班</span>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 时段分布 -->
        <el-card class="panel" header="各时段排班分布">
          <div class="period-list">
            <div v-for="ps in periodStats" :key="ps.periodKey" class="period-item">
              <div class="period-item__label">
                <span class="period-dot" :class="'period-dot--' + ps.periodKey"></span>
                {{ ps.period }}
              </div>
              <div class="period-item__bar-wrap">
                <div class="period-item__bar" :style="{ width: barWidth(ps.count, maxPeriodCount) + '%', background: periodColor(ps.periodKey) }"></div>
              </div>
              <div class="period-item__count">{{ ps.count }}</div>
            </div>
          </div>
        </el-card>

        <!-- 诊室统计 -->
        <el-card class="panel" header="各院区诊室统计">
          <div class="room-list">
            <div v-for="rs in roomStats" :key="rs.campusCode" class="room-item">
              <span class="room-item__name">{{ rs.campus }}</span>
              <div class="room-item__track">
                <div class="room-item__fill" :style="{ width: barWidth(rs.count, maxRoomCount) + '%', background: campusColor(rs.campusCode) }"></div>
              </div>
              <span class="room-item__count">{{ rs.count }} 间</span>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 最近排班预览 -->
    <el-card class="panel recent-panel" header="排班模板预览（最近10条）">
      <el-table :data="recentSchedules" stripe size="small">
        <el-table-column prop="doctorName" label="医生" min-width="90" show-overflow-tooltip />
        <el-table-column prop="department" label="科室" min-width="80" show-overflow-tooltip />
        <el-table-column prop="campus" label="院区" min-width="90" show-overflow-tooltip />
        <el-table-column prop="roomName" label="诊室" min-width="100" show-overflow-tooltip />
        <el-table-column prop="period" label="时段" min-width="70">
          <template #default="{ row }">
            <el-tag size="small" :type="periodTagType(row.period)">{{ row.period }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="dayOfWeek" label="周几" min-width="70">
          <template #default="{ row }">{{ dayLabel(row.dayOfWeek) }}</template>
        </el-table-column>
        <el-table-column prop="startTime" label="时间" min-width="100">
          <template #default="{ row }">{{ row.startTime }}–{{ row.endTime }}</template>
        </el-table-column>
      </el-table>
    </el-card>

  </div>
</template>

<script setup>
/**
 * #问题1 重构：
 *   - 之前：loadStats 调 /metadata + /schedules 全表，前端自己 reduce 聚合（性能差）
 *   - 现在：调 /api/statistics（后端 GROUP BY 聚合），前端只展示
 *   - 新增：按职称 title 分布（医生属于医院不分院区，按职称统计）
 *   - 新增：按院区→诊区二级树（用户要求的数据结构）
 *   - 移除：前端手写 reduce / campusMap / periodMap / roomMap
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'

const router = useRouter()
const auth = useAuthStore()
const refreshTime = ref('')

const stats = ref({ campuses: 0, departments: 0, doctors: 0, rooms: 0, schedules: 0, timeSlots: 0, zones: 0, clinicTypes: 0 })
const periodStats = ref([])
const roomStats = ref([])
const titleStats = ref([])            // #问题1：按职称分布
const campusZoneTree = ref([])        // #问题1：院区→诊区二级结构
const recentSchedules = ref([])
const loading = ref(true)

const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay()
const todayLabel = ['周一','周二','周三','周四','周五','周六','周日'][todayDow - 1]

const CAMPUS_COLORS = { YX: '#2e7d32', HP: '#faad14', TH: '#1890ff' }
const PERIOD_COLORS = { morning: '#52c41a', noon: '#faad14', afternoon: '#2e7d32', night: '#722ed1' }
const PERIOD_MAP = { '上午': 'morning', '中午': 'noon', '下午': 'afternoon', '夜班': 'night' }
// #问题1：职称颜色（视觉上区分配属不同职称）
const TITLE_COLORS = ['#0369a1', '#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899']
function titleColor(title) {
  if (!title) return '#94a3b8'
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0
  return TITLE_COLORS[Math.abs(hash) % TITLE_COLORS.length]
}

function campusColor(code) { return CAMPUS_COLORS[code] || '#2e7d32' }
function periodColor(key) { return PERIOD_COLORS[key] || '#2e7d32' }
function periodTagType(p) {
  if (p === '上午') return 'success'
  if (p === '中午') return 'warning'
  if (p === '下午') return ''
  return 'info'
}
function dayLabel(d) { return ['周一','周二','周三','周四','周五','周六','周日'][(d || 1) - 1] || '周' + d }

function barWidth(count, max) {
  if (!max || max <= 0) return 0
  return Math.max(2, Math.round((count / max) * 100))
}
function titleBarWidth(count) {
  const max = Math.max(...titleStats.value.map(t => t.doctorCount), 1)
  return barWidth(count, max)
}

/**
 * #P1-D5 数字千分位 — 1,234 而不是 1234
 *   配合 Fira Code 字体使用，医疗排班统计 / 工号 / ID 更易读
 */
function formatNumber(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return n
  // 整数用 toLocaleString；保留原小数（如 1.5）
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

const maxPeriodCount = computed(() => Math.max(...periodStats.value.map(p => p.count), 1))
const maxRoomCount = computed(() => Math.max(...roomStats.value.map(r => r.count), 1))

function toggleCampus(code) {
  const item = campusZoneTree.value.find(c => c.campusCode === code)
  if (item) item.expanded = !item.expanded
}

async function loadStats() {
  loading.value = true
  try {
    const [statRes, schedRes] = await Promise.all([
      api.get('/statistics'),
      api.get('/schedules')
    ])

    if (statRes.success) {
      const d = statRes.data
      stats.value = {
        campuses: d.totalCampuses || 0,
        departments: d.totalDepartments || 0,
        doctors: d.totalDoctors || 0,
        rooms: d.totalRooms || 0,
        timeSlots: d.totalTimeSlots || 0,
        zones: d.totalZones || 0,
        clinicTypes: d.totalClinicTypes || 0,
        schedules: d.totalSchedules || 0
      }
      periodStats.value = (d.slotStats || []).map(s => ({
        period: s.period,
        periodKey: PERIOD_MAP[s.period] || 'afternoon',
        count: s.count
      }))
      const campusRoomMap = {}
      ;(d.roomStats || []).forEach(rs => {
        const key = rs.code
        if (!campusRoomMap[key]) campusRoomMap[key] = { campusCode: key, campus: rs.campus, count: 0 }
        campusRoomMap[key].count += rs.count
      })
      roomStats.value = Object.values(campusRoomMap)
      titleStats.value = (d.titleStats || [])
      campusZoneTree.value = buildCampusZoneTree(d.campusZoneStats || [])
    }

    if (schedRes.success) {
      recentSchedules.value = (schedRes.data || []).slice(0, 10)
    }

    const now = new Date()
    refreshTime.value = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    console.error('加载数据失败', e)
  } finally {
    loading.value = false
  }
}

/**
 * 把后端 campusZoneStats（扁平数组）转成 [{ campusCode, campusName, zones: [{...}] }] 嵌套结构
 * 默认展开第一个院区
 */
function buildCampusZoneTree(flat) {
  const campusMap = {}
  for (const row of flat) {
    if (!campusMap[row.campusCode]) {
      campusMap[row.campusCode] = {
        campusCode: row.campusCode,
        campusName: row.campusName || row.campusCode,
        zones: [],
        totalSchedules: 0,
        expanded: false
      }
    }
    campusMap[row.campusCode].zones.push({
      zoneCode: row.zoneCode,
      zoneName: row.zoneName || row.zoneCode,
      scheduleCount: row.scheduleCount || 0,
      roomCount: row.roomCount || 0
    })
    campusMap[row.campusCode].totalSchedules += row.scheduleCount || 0
  }
  const list = Object.values(campusMap)
  if (list.length > 0) list[0].expanded = true
  return list
}

onMounted(loadStats)
</script>

<style scoped>
.dashboard { max-width: 1400px; margin: 0 auto; }

/* 欢迎栏 */
.welcome-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  background: linear-gradient(135deg, #075985 0%, #0369a1 50%, #0ea5e9 100%);
  border-radius: var(--radius-lg);
  padding: 24px 28px;
  color: #fff;
  box-shadow: 0 4px 20px rgba(3, 105, 161, 0.3);
  position: relative;
  overflow: hidden;
}
.welcome-bar::after {
  content: '';
  position: absolute;
  right: -40px; top: -40px;
  width: 200px; height: 200px;
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
}
.welcome-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.5px; }
.welcome-sub { font-size: 13px; opacity: 0.8; }
.welcome-right { text-align: right; }
.live-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.2); border-radius: 20px;
  padding: 4px 12px; font-size: 12px; margin-bottom: 4px;
  backdrop-filter: blur(4px);
}
.live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #7dd3fc;
  animation: blink 1.5s infinite;
  box-shadow: 0 0 6px rgba(125, 211, 252, 0.8);
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
.refresh-time { font-size: 12px; opacity: 0.7; }

/* 核心指标卡片 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.stat-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  padding: 20px 22px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-base) var(--ease-out);
}
.stat-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, var(--color-primary-light) 0%, var(--color-primary) 100%);
  border-radius: 0 var(--radius-full) var(--radius-full) 0;
  opacity: 0;
  transition: opacity var(--duration-fast);
}
.stat-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
  border-color: rgba(3, 105, 161, 0.15);
}
.stat-card:hover::before { opacity: 1; }
.stat-card__icon { font-size: 38px; line-height: 1; flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
.stat-card__body { flex: 1; min-width: 0; }
.stat-card__value {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}
.stat-card__label {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.stat-card__arrow {
  margin-left: auto;
  font-size: 22px;
  color: var(--text-disabled);
  transition: color var(--duration-fast), transform var(--duration-fast);
}
.stat-card:hover .stat-card__arrow {
  color: var(--color-primary);
  transform: translateX(4px);
}

/* 指标卡动画增强 */
.stat-card { animation: fadeUp 0.4s var(--ease-out) both; }
.stat-card:nth-child(1) { animation-delay: 0ms; }
.stat-card:nth-child(2) { animation-delay: 60ms; }
.stat-card:nth-child(3) { animation-delay: 120ms; }
.stat-card:nth-child(4) { animation-delay: 180ms; }

.stat-card--skeleton {
  pointer-events: none;
  cursor: default;
}
.stat-card--skeleton:hover {
  transform: none;
  box-shadow: var(--shadow-sm);
  border-color: var(--border-light);
}

/* 主网格 */
.main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.main-left, .main-right { display: flex; flex-direction: column; gap: 20px; }
.panel { border-radius: var(--radius-lg); }

/* #问题1：院区→诊区二级树 */
.campus-tree { display: flex; flex-direction: column; gap: 12px; }
.campus-group { border: 1px solid var(--border-light); border-radius: var(--radius-md); overflow: hidden; }
.campus-group__header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: var(--color-primary-bg);
  cursor: pointer;
  user-select: none;
  transition: background var(--duration-fast);
}
.campus-group__header:hover { background: rgba(3, 105, 161, 0.12); }
.caret { display: inline-block; transition: transform var(--duration-fast); color: var(--text-muted); font-size: 14px; }
.caret.open { transform: rotate(90deg); color: var(--color-primary); }
.campus-group__name { font-weight: 700; color: var(--text-primary); font-size: 14px; flex: 1; min-width: 0; }
.campus-group__meta { display: flex; gap: 6px; }
.campus-group__body { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-card); }
.zone-item {
  display: grid;
  grid-template-columns: 100px 110px 1fr 40px;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}
.zone-item__name { font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zone-item__code { font-family: monospace; font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zone-item__bar-wrap { height: 6px; background: var(--bg-muted); border-radius: var(--radius-full); overflow: hidden; }
.zone-item__bar { height: 100%; border-radius: var(--radius-full); transition: width 0.6s var(--ease-out); }
.zone-item__count { text-align: right; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }

/* 加载/空态 */
.loading-text, .empty-text { padding: 20px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

/* 快速操作 */
.quick-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.quick-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-radius: var(--radius-md);
  background: var(--color-primary-bg);
  border: 1px solid rgba(3, 105, 161, 0.12);
  cursor: pointer; font-size: 13px; color: var(--color-primary-dark); font-weight: 500;
  transition: all var(--duration-fast) var(--ease-out);
}
.quick-btn:hover {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 4px 12px rgba(3, 105, 161, 0.25);
  transform: translateY(-1px);
}
.quick-btn__icon { font-size: 18px; }

/* #问题1：按职称分布 */
.title-list { display: flex; flex-direction: column; gap: 10px; }
.title-item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.title-item__label { min-width: 90px; display: flex; align-items: center; gap: 8px; }
.title-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(255,255,255,0.8); }
.title-name { font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-item__bar-wrap { flex: 1; height: 8px; background: var(--bg-muted); border-radius: var(--radius-full); overflow: hidden; }
.title-item__bar { height: 100%; border-radius: var(--radius-full); transition: width 0.6s var(--ease-out); }
.title-item__meta { display: flex; gap: 8px; min-width: 100px; justify-content: flex-end; }
.title-item__doctors { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.title-item__schedules { color: var(--text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }

/* 时段分布 */
.period-list { display: flex; flex-direction: column; gap: 12px; }
.period-item { display: flex; align-items: center; gap: 12px; }
.period-item__label { min-width: 60px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.period-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.period-dot--morning { background: var(--color-success); }
.period-dot--noon { background: var(--color-warning); }
.period-dot--afternoon { background: var(--color-primary-light); }
.period-dot--night { background: #8b5cf6; }
.period-item__bar-wrap { flex: 1; height: 8px; background: var(--bg-muted); border-radius: var(--radius-full); overflow: hidden; }
.period-item__bar { height: 100%; border-radius: var(--radius-full); transition: width 0.6s var(--ease-out); }
.period-item__count { min-width: 36px; text-align: right; font-size: 13px; font-weight: 600; color: var(--text-primary); }

/* 诊室统计 */
.room-list { display: flex; flex-direction: column; gap: 10px; }
.room-item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.room-item__name { min-width: 70px; font-weight: 500; color: var(--text-primary); }
.room-item__track { flex: 1; height: 6px; background: var(--bg-muted); border-radius: var(--radius-full); overflow: hidden; }
.room-item__fill { height: 100%; border-radius: var(--radius-full); transition: width 0.6s var(--ease-out); }
.room-item__count { min-width: 50px; text-align: right; color: var(--text-muted); }

/* 最近排班 */
.recent-panel { }
</style>