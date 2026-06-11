<template>
  <div class="stats-page view-wrap">
    <!-- 顶部筛选 -->
    <div class="filter-bar">
      <div class="filter-left">
        <el-select v-model="filter.campusCode" placeholder="全部院区" clearable filterable style="width: 180px" @change="loadAll">
          <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
        </el-select>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
        <el-button type="primary" :icon="Download" @click="onExport">导出 CSV</el-button>
      </div>
      <div class="filter-right">
        <span class="update-time">更新于 {{ refreshTime }}</span>
      </div>
    </div>

    <!-- KPI 指标卡 -->
    <div v-if="loading" class="kpi-grid">
      <div v-for="i in 4" :key="i" class="kpi-card skeleton-card">
        <div class="skeleton" style="width: 60%; height: 16px; margin-bottom: 12px"></div>
        <div class="skeleton" style="width: 40%; height: 28px"></div>
      </div>
    </div>
    <div v-else class="kpi-grid">
      <div class="kpi-card kpi-card--primary">
        <AppIcon name="calendar" :size="32" class="kpi-icon" />
        <div class="kpi-body">
          <div class="kpi-value">{{ formatNumber(kpis.schedules) }}</div>
          <div class="kpi-label">总排班数</div>
        </div>
      </div>
      <div class="kpi-card">
        <AppIcon name="hospital" :size="32" class="kpi-icon" />
        <div class="kpi-body">
          <div class="kpi-value">{{ formatNumber(kpis.campuses) }}</div>
          <div class="kpi-label">院区数</div>
        </div>
      </div>
      <div class="kpi-card">
        <AppIcon name="doctor" :size="32" class="kpi-icon" />
        <div class="kpi-body">
          <div class="kpi-value">{{ formatNumber(kpis.doctors) }}</div>
          <div class="kpi-label">医生数</div>
        </div>
      </div>
      <div class="kpi-card">
        <AppIcon name="door" :size="32" class="kpi-icon" />
        <div class="kpi-body">
          <div class="kpi-value">{{ formatNumber(kpis.rooms) }}</div>
          <div class="kpi-label">诊室数</div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div v-if="loading" class="chart-row">
      <div v-for="i in 2" :key="i" class="chart-card">
        <div class="skeleton" style="width: 30%; height: 20px; margin-bottom: 16px"></div>
        <div class="skeleton" style="width: 100%; height: 320px"></div>
      </div>
    </div>

    <div v-else class="chart-row">
      <!-- 柱状图：各院区排班 -->
      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">各院区排班分布</span>
          <span class="chart-sub">点击柱条可跳转院区</span>
        </div>
        <v-chart :option="campusChartOption" autoresize style="height: 320px" @click="onCampusClick" />
      </div>

      <!-- 饼图：时段分布 -->
      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">各时段排班分布</span>
          <span class="chart-sub">比例图</span>
        </div>
        <v-chart :option="periodChartOption" autoresize style="height: 320px" />
      </div>
    </div>

    <div v-if="!loading && chartPhase >= 1" class="chart-row">
      <!-- 折线图：各周次分布 -->
      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">各周次排班分布</span>
          <span class="chart-sub">周一 ~ 周日</span>
        </div>
        <v-chart :option="dayChartOption" autoresize style="height: 280px" />
      </div>

      <!-- 横向柱状图：TOP 10 科室 -->
      <div class="chart-card">
        <div class="chart-header">
          <span class="chart-title">TOP 10 科室</span>
          <span class="chart-sub">按排班数</span>
        </div>
        <v-chart :option="deptChartOption" autoresize style="height: 280px" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { Refresh, Download } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { ElMessage } from 'element-plus'
import api, { apiDownload, saveBlob } from '@/api'

use([CanvasRenderer, BarChart, PieChart, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, DataZoomComponent])

const router = useRouter()
const loading = ref(true)
// #问题4-B 修复：分两阶段渲染 4 个 chart，避免同时挂载 4 个 ECharts Canvas 占用主线程
//   phase=0 时第二行 chart 用 v-if 不挂载；phase=1 时再挂载，让出主线程给首屏
const chartPhase = ref(0)
const refreshTime = ref('')
let timer = null

const filter = ref({ campusCode: '' })
const campuses = ref([])

const kpis = ref({ schedules: 0, campuses: 0, doctors: 0, rooms: 0 })
const campusStats = ref([])
const periodStats = ref([])
const deptStats = ref([])
const dayStats = ref([])

const PRIMARY = '#0369a1'
const PRIMARY_LIGHT = '#0ea5e9'
const COLORS = ['#0369a1', '#0ea5e9', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d']

const campusChartOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: { type: 'category', data: campusStats.value.map(c => c.campus || c.name) },
  yAxis: { type: 'value' },
  series: [{
    type: 'bar',
    data: campusStats.value.map(c => c.count),
    itemStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: PRIMARY_LIGHT }, { offset: 1, color: PRIMARY }]
      },
      borderRadius: [4, 4, 0, 0]
    },
    barWidth: 40
  }]
}))

const periodChartOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: { bottom: 0, icon: 'circle' },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    center: ['50%', '45%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: '{b}\n{d}%' },
    data: periodStats.value.map((p, i) => ({
      name: p.period || p.name,
      value: p.count,
      itemStyle: { color: COLORS[i % COLORS.length] }
    }))
  }]
}))

const dayChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: {
    type: 'category',
    data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    boundaryGap: false
  },
  yAxis: { type: 'value' },
  series: [{
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 8,
    lineStyle: { width: 3, color: PRIMARY },
    itemStyle: { color: PRIMARY, borderColor: '#fff', borderWidth: 2 },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: 'rgba(14, 165, 233, 0.4)' }, { offset: 1, color: 'rgba(3, 105, 161, 0.05)' }]
      }
    },
    data: dayOfWeekData()
  }]
}))

function dayOfWeekData() {
  const map = new Map(dayStats.value.map(d => [d.dayOfWeek, d.count]))
  const out = []
  for (let i = 1; i <= 7; i++) out.push(map.get(i) || 0)
  return out
}

const deptChartOption = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 100, right: 30, top: 20, bottom: 30 },
  xAxis: { type: 'value' },
  yAxis: {
    type: 'category',
    data: deptStats.value.slice(0, 10).reverse().map(d => d.department || '未分类')
  },
  series: [{
    type: 'bar',
    data: deptStats.value.slice(0, 10).reverse().map(d => d.count),
    itemStyle: { color: PRIMARY, borderRadius: [0, 4, 4, 0] },
    barWidth: 16
  }]
}))

async function loadAll() {
  loading.value = true
  try {
    const [statsRes, metaRes] = await Promise.all([
      api.get('/statistics', { campus: filter.value.campusCode }),
      api.get('/metadata')
    ])
    if (statsRes.success) {
      // /statistics 仍按旧格式（success + 直接挂字段，未走列表解包）
      const d = statsRes.data || statsRes
      campusStats.value = d.campusStats || []
      periodStats.value = d.slotStats || []
      deptStats.value = d.deptStats || []
      dayStats.value = d.dayStats || []
      kpis.value = {
        schedules: d.totalSchedules || 0,
        campuses: d.totalCampuses || 0,
        doctors: d.totalDoctors || 0,
        rooms: d.totalRooms || 0
      }
    }
    if (metaRes.success) {
      // /metadata 保持旧格式（直接挂在顶层）
      campuses.value = metaRes.campuses || []
    }
  } catch (e) {
    ElMessage.error('加载失败：' + e.message)
  } finally {
    loading.value = false
    refreshTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    // #问题4-B 修复：第一阶段渲染完后，用 nextTick + 50ms 让出主线程再渲染第二批 chart
    //   requestAnimationFrame 在重负载下会合并帧，不如 setTimeout 50ms 稳
    nextTick(() => {
      chartPhase.value = 1
    })
  }
}

function onCampusClick(params) {
  const c = campusStats.value[params.dataIndex]
  if (c && c.code) {
    router.push('/campuses?code=' + c.code)
  }
}

async function onExport() {
  try {
    const blob = await apiDownload('/schedules/export', { campus: filter.value.campusCode || undefined })
    saveBlob(blob, '排班统计_' + new Date().toISOString().slice(0, 10) + '.csv')
    ElMessage.success('导出成功')
  } catch (e) {
    ElMessage.error(e.message)
  }
}

onMounted(() => {
  loadAll()
  timer = setInterval(() => {
    refreshTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }, 60000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.stats-page { padding: 0 24px 24px; max-width: 1500px; margin: 0 auto; }

/* 筛选 */
.filter-bar {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  padding: 14px 18px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}
.filter-left, .filter-right { display: flex; align-items: center; gap: 10px; }
.update-time { font-size: 12px; color: var(--text-muted); }

/* KPI */
.kpi-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  margin-bottom: 20px;
}
.kpi-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  display: flex; align-items: center; gap: 14px;
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-base) var(--ease-out);
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
.kpi-card--primary {
  background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%);
  color: #fff;
  border-color: transparent;
}
.kpi-icon { font-size: 32px; flex-shrink: 0; }
.kpi-body { flex: 1; min-width: 0; }
.kpi-value {
  font-size: 28px; font-weight: 800; line-height: 1.1;
  font-variant-numeric: tabular-nums; letter-spacing: -0.5px;
}
.kpi-label {
  font-size: 11.5px; margin-top: 4px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.6px;
  opacity: 0.85;
}
.kpi-card--primary .kpi-label { color: rgba(255, 255, 255, 0.85); }
.kpi-card:not(.kpi-card--primary) .kpi-label { color: var(--text-muted); }
.kpi-card:not(.kpi-card--primary) .kpi-value { color: var(--text-primary); }
.skeleton-card { padding: 18px 20px; }

/* 图表 */
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  box-shadow: var(--shadow-sm);
}
.chart-header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 16px;
}
.chart-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.chart-sub { font-size: 12px; color: var(--text-muted); }
</style>
