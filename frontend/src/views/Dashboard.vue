<template>
  <div class="dashboard">
    <h2 class="page-title">数据看板</h2>
    <el-row :gutter="20">
      <el-col :span="6"><stat-card icon="OfficeBuilding" :value="stats.campuses" label="院区" color="#2e7d32" /></el-col>
      <el-col :span="6"><stat-card icon="Files" :value="stats.departments" label="科室" color="#4caf50" /></el-col>
      <el-col :span="6"><stat-card icon="UserFilled" :value="stats.doctors" label="医生" color="#388e3c" /></el-col>
      <el-col :span="6"><stat-card icon="House" :value="stats.rooms" label="诊室" color="#66bb6a" /></el-col>
    </el-row>

    <el-row :gutter="20" class="mt-20">
      <el-col :span="6"><stat-card icon="Calendar" :value="stats.schedules" label="排班记录（周模板）" color="#2e7d32" /></el-col>
      <el-col :span="6"><stat-card icon="Clock" :value="stats.timeSlots" label="时段" color="#1b5e20" /></el-col>
      <el-col :span="6"><stat-card icon="Grid" :value="stats.zones" label="诊区" color="#43a047" /></el-col>
      <el-col :span="6"><stat-card icon="FirstAidKit" :value="stats.clinicTypes" label="门诊类型" color="#689f38" /></el-col>
    </el-row>

    <el-card class="mt-20" header="按院区排班统计">
      <el-table :data="campusStats" stripe>
        <el-table-column prop="campus" label="院区" />
        <el-table-column prop="count" label="排班数" sortable />
        <el-table-column prop="campusCode" label="院区代码" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, h, onMounted } from 'vue'
import api from '@/api'

const stats = ref({ campuses: 0, departments: 0, doctors: 0, rooms: 0, schedules: 0, timeSlots: 0, zones: 0, clinicTypes: 0 })
const campusStats = ref([])

async function loadStats() {
  // 一次性拉取所有 metadata
  const res = await api.get('/metadata')
  if (res.success) {
    stats.value = {
      campuses: res.campuses.length,
      departments: res.departments.length,
      doctors: res.doctors.length,
      rooms: res.rooms.length,
      timeSlots: res.timeSlots.length,
      zones: res.zones.length,
      clinicTypes: res.clinicTypes.length,
      schedules: 0
    }
  }
  // 排班数
  const schedRes = await api.get('/schedules')
  if (schedRes.success) {
    stats.value.schedules = schedRes.data.length
    // 按院区统计
    const map = {}
    schedRes.data.forEach(s => {
      map[s.campus] = (map[s.campus] || 0) + 1
    })
    campusStats.value = Object.entries(map).map(([campus, count]) => ({ campus, count, campusCode: schedRes.data.find(s => s.campus === campus)?.campusCode || '' }))
  }
}

onMounted(loadStats)

// 简单的 stat-card 子组件（用 h 函数渲染）
const StatCard = {
  props: ['icon', 'value', 'label', 'color'],
  setup(props) {
    return () => h('div', { class: 'stat-card', style: { '--accent': props.color } }, [
      h('div', { class: 'stat-icon' }, [h('el-icon', { size: 32 }, [
        h(resolveComponent('component'), { is: props.icon })
      ])]),
      h('div', { class: 'stat-value' }, [String(props.value)]),
      h('div', { class: 'stat-label' }, [props.label])
    ])
  }
}
import { resolveComponent } from 'vue'
</script>

<style scoped>
.dashboard { max-width: 1400px; margin: 0 auto; }
.page-title { font-size: 22px; font-weight: 600; color: #2e7d32; margin: 0 0 24px; }
.mt-20 { margin-top: 20px; }
:deep(.stat-card) {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border-left: 4px solid var(--accent, #2e7d32);
}
:deep(.stat-icon) {
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--accent) 15%, white);
  color: var(--accent);
  border-radius: 12px;
}
:deep(.stat-value) { font-size: 28px; font-weight: 700; color: #333; }
:deep(.stat-label) { font-size: 14px; color: #999; }
</style>
