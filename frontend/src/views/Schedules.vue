<template>
  <div class="schedules-wrap view-wrap">
    <!-- 院区切换 Tabs -->
    <div class="campus-tabs">
      <div
        v-for="c in campuses"
        :key="c.code"
        :class="['campus-tab', { active: filter.campusCode === c.code }]"
        @click="onCampusTabClick(c.code)"
      >
        <div class="campus-tab-name">{{ c.name }}</div>
        <div class="campus-tab-code">{{ c.code }}</div>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="panel-card">
      <div class="filter-bar">
        <!-- #P1-9 修复：el-form 只包筛选控件，告警/状态指示挪到外面 -->
        <el-form :inline="true" :model="filter" class="filter-form">
          <el-form-item label="诊区">
            <el-select v-model="filter.zoneCode" placeholder="全部诊区" clearable filterable style="width: 160px" @change="onFilter">
              <el-option v-for="z in filteredZones" :key="z.code" :label="z.name" :value="z.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="门诊类型">
            <el-select v-model="filter.clinicTypeCode" placeholder="全部类型" clearable filterable style="width: 160px" @change="onFilter">
              <el-option v-for="c in clinicTypes" :key="c.code" :label="c.name" :value="c.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="周次">
            <el-select v-model="filter.dayOfWeek" placeholder="全部" clearable style="width: 130px" @change="onFilter">
              <el-option v-for="(d, i) in WEEKDAYS" :key="i+1" :label="d" :value="i+1" />
            </el-select>
          </el-form-item>
          <el-form-item label="医生">
            <el-input v-model="filter.doctorName" placeholder="姓名模糊搜索" clearable style="width: 180px" @keyup.enter="onFilter" @clear="onFilter" />
          </el-form-item>
          <el-form-item>
            <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
          </el-form-item>
        </el-form>

        <!-- 告警/状态：编辑弹窗才用，目前仅占位（如果不需要可删） -->
        <el-alert
          v-if="conflicts.length > 0"
          type="error"
          :closable="false"
          show-icon
          style="margin-top: 12px"
          :title="`发现 ${conflicts.length} 个排班冲突`"
        >
          <ul style="margin: 4px 0 0; padding-left: 20px">
            <li v-for="c in conflicts" :key="c.id + '_' + c.type">
              <span v-if="c.type === 'room'">该诊室已被占用：</span>
              <span v-else>该医生已被排：</span>
              {{ c.doctor_name }} ({{ c.work_id }}) - {{ c.room_name }} - {{ c.period }} ({{ c.start_time }}-{{ c.end_time }})
            </li>
          </ul>
        </el-alert>
        <el-alert v-else-if="editing.campus_code && editing.room_id && editing.day_of_week && !checkingConflict" type="success" :closable="false" show-icon style="margin-top: 12px" title="当前选择无冲突">
          <span>可继续保存。</span>
          <el-button v-if="availableSlots.length > 0" link type="primary" size="small" @click="loadAvailableSlots">查看空闲时段</el-button>
        </el-alert>
        <el-alert v-else-if="checkingConflict" type="info" :closable="false" show-icon style="margin-top: 12px" title="正在检测冲突..." />

        <div class="filter-stats">
          <span class="stat-pill">共 <b>{{ total }}</b> 条</span>
          <span class="stat-pill" v-if="filter.campusCode">院区 <b>{{ currentCampusName }}</b></span>
          <el-button :icon="Plus" type="primary" @click="onAdd">新增排班</el-button>
        </div>
      </div>
    </div>

    <!-- 排班列表（按周次分组） -->
    <!-- #P2-21 修复：仅渲染有数据的 day 面板（之前 7 个全画，大量空表格） -->
    <div v-for="dow in visibleDays" :key="dow" class="panel-card">
      <div class="day-header">
        <span class="day-label">{{ WEEKDAYS[dow - 1] }}</span>
        <el-tag size="small" type="success" effect="light">{{ groupByDay[dow].length }} 条</el-tag>
      </div>

      <el-table
        v-loading="loading"
        :data="groupByDay[dow]"
        stripe
        :empty-text="loading ? '加载中...' : '本周次暂无排班'"
        :row-class-name="onRowClass"
      >
        <el-table-column prop="doctor_name" label="医生" min-width="100">
          <template #default="{ row }">
            <div class="doctor-cell">
              <el-avatar :size="28" class="doctor-avatar">{{ (row.doctor_name || '?').slice(0, 1) }}</el-avatar>
              <div>
                <div class="doctor-name">{{ row.doctor_name }}</div>
                <div class="doctor-meta">{{ row.department || '—' }} · {{ row.work_id || '' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="zone_name" label="诊区" min-width="80" />
        <el-table-column prop="room_id" label="诊室" min-width="120">
          <template #default="{ row }">{{ row.room_name }}（{{ row.room_id }}）</template>
        </el-table-column>
        <el-table-column prop="clinic_type_name" label="门诊类型" min-width="100" />
        <el-table-column prop="period" label="时段" min-width="120">
          <template #default="{ row }">
            <el-tag :type="periodTagType(row.period)" size="small" effect="light">
              {{ row.period }} {{ row.start_time }}-{{ row.end_time }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="patient_limit" label="限号" min-width="70" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.patient_limit" size="small" effect="plain">{{ row.patient_limit }}</el-tag>
            <span v-else class="text-muted">不限</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="onEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="!loading && total === 0" class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <AppIcon name="calendar" :size="56" />
      </div>
      <div class="empty-text">该院区暂无排班数据</div>
      <el-button type="primary" :icon="Plus" @click="onAdd">新增第一条</el-button>
    </div>

    <!-- 编辑弹窗 -->
    <ScheduleFormDialog
      v-model:visible="dialogVisible"
      :editing="editing"
      :doctors="doctors"
      :campuses="campuses"
      :clinic-types="clinicTypes"
      :filtered-zones="filteredZones"
      :filtered-rooms="filteredRooms"
      :filtered-slots="filteredSlots"
      :recommendations="recommendations"
      :weekdays="WEEKDAYS"
      :saving="saving"
      @save="onSave"
      @doctorChange="onDoctorChange"
      @campusChange="onCampusChange"
      @zoneChange="onZoneChange"
      @clinicTypeChange="onClinicTypeChange"
      @slotChange="onSlotChange"
      @applyRecommend="applyRecommendation"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import { useDebouncedFn } from '@/composables/useDebouncedFn'
import ScheduleFormDialog from '@/components/schedule/ScheduleFormDialog.vue'

// #P1-14 修复：useRoute() 必须在 <script setup> 顶层调用，响应式订阅才能正常建立
const route = useRoute()

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const list = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref({})
// #P2-22 Timeline 跳转高亮
const highlightId = ref(null)

const campuses = ref([])
const zones = ref([])
const rooms = ref([])
const timeSlots = ref([])
const clinicTypes = ref([])
const doctors = ref([])

const filter = ref({ campusCode: '', zoneCode: '', clinicTypeCode: '', dayOfWeek: '', doctorName: '' })

const currentCampusName = computed(() => {
  const c = campuses.value.find(x => x.code === filter.value.campusCode)
  return c ? c.name : '—'
})

const filteredZones = computed(() => {
  if (!filter.value.campusCode) return zones.value
  return zones.value.filter(z => z.campus_code === filter.value.campusCode)
})

const filteredRooms = computed(() => {
  return rooms.value.filter(r =>
    r.campus_code === editing.value.campus_code &&
    (!editing.value.zone_code || r.zone_code === editing.value.zone_code)
  )
})

const filteredSlots = computed(() => {
  return timeSlots.value.filter(t =>
    t.campus_code === editing.value.campus_code &&
    (!editing.value.clinic_type_code || t.clinic_type_code === editing.value.clinic_type_code)
  )
})

// 按周次分组
const groupByDay = computed(() => {
  const groups = {}
  for (let i = 1; i <= 7; i++) groups[i] = []
  for (const s of list.value) {
    const d = Number(s.day_of_week)
    if (groups[d]) groups[d].push(s)
  }
  return groups
})

const visibleDays = computed(() => {
  if (filter.value.dayOfWeek) return [Number(filter.value.dayOfWeek)]
  return [1, 2, 3, 4, 5, 6, 7]
})

function periodTagType(p) {
  if (p === '上午') return 'success'
  if (p === '中午') return 'warning'
  if (p === '下午') return 'primary'
  if (p === '夜班') return 'info'
  return ''
}

async function loadList() {
  loading.value = true
  try {
    const params = {
      campusCode: filter.value.campusCode,
      zoneCode: filter.value.zoneCode,
      clinicTypeCode: filter.value.clinicTypeCode,
      dayOfWeek: filter.value.dayOfWeek,
      doctorName: filter.value.doctorName
    }
    const res = await api.get('/schedules', params)
    if (res.success) {
      list.value = res.data || []
      total.value = list.value.length
    }
  } finally {
    loading.value = false
  }
}

// 防抖版 loadList — 用于输入筛选（医生姓名），避免每次按键都打后端
const debouncedLoadList = useDebouncedFn(loadList, 350)

function onFilter() { loadList() }
function resetFilter() {
  filter.value = { campusCode: filter.value.campusCode, zoneCode: '', clinicTypeCode: '', dayOfWeek: '', doctorName: '' }
  loadList()
}

// 监听医生姓名字段：输入即搜索（防抖）
watch(() => filter.value.doctorName, function () {
  debouncedLoadList()
})

function onCampusTabClick(code) {
  filter.value.campusCode = filter.value.campusCode === code ? '' : code
  loadList()
}

function onAdd() {
  editing.value = {
    day_of_week: 1,
    patient_limit: 30,
    campus_code: filter.value.campusCode || (campuses.value[0]?.code || '')
  }
  dialogVisible.value = true
}

// #P0-4 修复：GET 列表返回 camelCase，弹窗表单用 snake_case，需要做一次字段名映射，
// 否则编辑已有排班时所有 select 都是空的（v-model 绑到不存在的 key）。
// 这里统一做 camelCase → snake_case 转换，保证弹窗回显与新增逻辑一致。
function rowToEditing(row) {
  if (!row) return {}
  // #B3 修复：Number(0) || 1 会把合法的 dow=0 静默改成 1。
  //   显式做范围归一化：1..7 保留原值，0 归 7（日历里 0=周日），其他 NaN/Infinity/缺省 回退 1。
  const rawDow = row.day_of_week ?? row.dayOfWeek
  const n = Number(rawDow)
  const normalizedDow = Number.isFinite(n) && n >= 1 && n <= 7 ? n : (n === 0 ? 7 : 1)
  return {
    id: row._id || row.id,
    doctor_id: row.doctor_id ?? row.doctorId,
    doctor_name: row.doctor_name ?? row.doctorName,
    work_id: row.work_id ?? row.workId,
    department: row.department,
    campus_code: row.campus_code ?? row.campusCode,
    campus_name: row.campus_name ?? row.campusName,
    zone_code: row.zone_code ?? row.zoneCode,
    zone_name: row.zone_name ?? row.zoneName,
    room_id: row.room_id ?? row.roomId,
    room_name: row.room_name ?? row.roomName,
    clinic_type_code: row.clinic_type_code ?? row.clinicTypeCode,
    clinic_type_name: row.clinic_type_name ?? row.clinicTypeName,
    time_slot_code: row.time_slot_code ?? row.timeSlotCode,
    period: row.period,
    start_time: row.start_time ?? row.startTime,
    end_time: row.end_time ?? row.endTime,
    day_of_week: normalizedDow,
    patient_limit: row.patient_limit ?? row.patientLimit,
    remark: row.remark
  }
}

// #B20 修复：metadata 加载 promise 句柄，确保 onEdit 触发时字典已就绪
let _metaLoadPromise = null
// 已加载完成的元数据字典（用于 onSave 中按需补全时直接命中）
const metaLoaded = ref(false)

async function loadAllMeta() {
  // #问题4-A 修复：使用 Promise.allSettled 防止任一 API 失败导致后续逻辑全挂
  //   之前用 Promise.all，任一 reject 会让 Promise.all reject，整个页面挂掉
  //   现在用 Promise.allSettled 让所有 API 完成后再继续，单个失败不影响其他
  const results = await Promise.allSettled([
    api.get('/campuses'),
    api.get('/zones'),
    api.get('/rooms'),
    api.get('/timeSlots'),
    api.get('/clinicTypes'),
    api.get('/doctors')
  ])
  const [campusesRes, zonesRes, roomsRes, timeSlotsRes, clinicTypesRes, doctorsRes] = results
  if (campusesRes.status === 'fulfilled' && campusesRes.value.success) campuses.value = campusesRes.value.data
  if (zonesRes.status === 'fulfilled' && zonesRes.value.success) zones.value = zonesRes.value.data
  if (roomsRes.status === 'fulfilled' && roomsRes.value.success) rooms.value = roomsRes.value.data
  if (timeSlotsRes.status === 'fulfilled' && timeSlotsRes.value.success) timeSlots.value = timeSlotsRes.value.data
  if (clinicTypesRes.status === 'fulfilled' && clinicTypesRes.value.success) clinicTypes.value = clinicTypesRes.value.data
  if (doctorsRes.status === 'fulfilled' && doctorsRes.value.success) doctors.value = doctorsRes.value.data
  metaLoaded.value = true
}

async function onEdit(row) {
  // #B20 修复：编辑已有排班前确保 campus/zone/room/clinicType 等 metadata 已加载，
  //   否则提交时 onSave 里 `campuses.value.find(...)` 找不到、name 补全全空，
  //   后端保存时丢掉这些字段。
  if (!_metaLoadPromise) _metaLoadPromise = loadAllMeta()
  if (!metaLoaded.value) {
    await _metaLoadPromise
  }
  editing.value = rowToEditing(row)
  dialogVisible.value = true
}

/**
 * #P2-22 修复：行 className — Timeline 跳转带 highlight=id 过来时
 *   给那一行加 is-highlighted 类（在 scoped CSS 里有动画）
 *   - 命中：返回 'is-highlighted'
 *   - 不命中：返回 ''
 * element-plus 表格 row-class-name 是函数 (row, rowIndex) => string
 */
function onRowClass({ row }) {
  if (highlightId.value && Number(row.id) === highlightId.value) return 'is-highlighted'
  return ''
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除 ${row.doctor_name} 在 ${row.room_name}（${WEEKDAYS[(row.day_of_week || 1) - 1]} ${row.period}）的排班？`,
      '删除确认', { type: 'warning', confirmButtonText: '确认删除' }
    )
  } catch (_) { return }  // 用户取消
  try {
    const res = await api.delete('/schedules/' + row.id)
    if (res.success) {
      ElMessage.success('已删除')
      loadList()
    } else {
      // #P1-14 修复：失败时明确告诉用户 — 之前静默失败，运营误以为"点了没反应"
      ElMessage.error(res.error || '删除失败')
    }
  } catch (e) {
    ElMessage.error('删除失败：' + (e?.message || '网络错误'))
  }
}

function onDoctorChange(id) {
  const d = doctors.value.find(x => x.id === id)
  if (d) {
    editing.value.doctor_name = d.name
    editing.value.work_id = d.work_id
    editing.value.department = d.department
  }
}

function onCampusChange() {
  editing.value.zone_code = ''
  editing.value.room_id = ''
}
function onZoneChange() { editing.value.room_id = '' }
function onClinicTypeChange() { editing.value.time_slot_code = '' }
function onSlotChange(code) {
  const s = timeSlots.value.find(x => x.code === code)
  if (s) {
    editing.value.period = s.period
    editing.value.start_time = s.start_time
    editing.value.end_time = s.end_time
  }
}

const conflicts = ref([]);
const availableSlots = ref([]);
const recommendations = ref([]);
const checkingConflict = ref(false);

// 用 AbortController + 防抖，避免组件卸载后仍触发 setState 与重复打后端
let conflictAbort = null;
let slotsAbort = null;
let recommendAbort = null;
let mounted = true;
// #34 修复：timer 用闭包变量，不污染 window
let conflictCheckTimer = null;
let recommendTimer = null;

async function checkConflict() {
  if (!mounted) return;
  if (!editing.value.campus_code || !editing.value.room_id || !editing.value.day_of_week || !editing.value.time_slot_code) {
    conflicts.value = [];
    return;
  }
  checkingConflict.value = true;
  if (conflictAbort) conflictAbort.abort();
  conflictAbort = new AbortController();
  try {
    const res = await api.get('/schedules/conflicts', {
      campusCode: editing.value.campus_code,
      roomId: editing.value.room_id,
      dayOfWeek: editing.value.day_of_week,
      timeSlotCode: editing.value.time_slot_code,
      doctorId: editing.value.doctor_id,
      excludeId: editing.value._id || editing.value.id || undefined
    }, { signal: conflictAbort.signal });
    if (!mounted) return;
    conflicts.value = (res && res.success) ? (res.conflicts || []) : [];
  } catch (e) {
    if (e && (e.name === 'CanceledError' || e.code === 'ERR_CANCELED')) return;
    if (!mounted) return;
    conflicts.value = [];
  } finally {
    if (mounted) checkingConflict.value = false;
  }
}

function scheduleCheck() {
  // 300ms 防抖：连续修改表单字段时只触发最后一次
  if (!mounted) return;
  if (conflictCheckTimer) clearTimeout(conflictCheckTimer);
  conflictCheckTimer = setTimeout(checkConflict, 300);
}

async function loadAvailableSlots() {
  if (!mounted) return;
  if (!editing.value.campus_code || !editing.value.room_id || !editing.value.day_of_week) {
    availableSlots.value = [];
    return;
  }
  if (slotsAbort) slotsAbort.abort();
  slotsAbort = new AbortController();
  try {
    const res = await api.get('/schedules/available-slots', {
      campusCode: editing.value.campus_code,
      roomId: editing.value.room_id,
      dayOfWeek: editing.value.day_of_week,
      excludeId: editing.value._id || editing.value.id || undefined
    }, { signal: slotsAbort.signal });
    if (!mounted) return;
    availableSlots.value = (res && res.success) ? (res.slots || []) : [];
  } catch (e) {
    if (e && (e.name === 'CanceledError' || e.code === 'ERR_CANCELED')) return;
    if (!mounted) return;
    availableSlots.value = [];
  }
}

/**
 * 智能推荐：给定 (campus, doctor, day) → 返回 (room, slot) 可用组合
 */
async function loadRecommendations() {
  if (!mounted) return;
  if (!editing.value.campus_code || !editing.value.day_of_week || !editing.value.doctor_id) {
    recommendations.value = [];
    return;
  }
  if (recommendAbort) recommendAbort.abort();
  recommendAbort = new AbortController();
  try {
    const res = await api.get('/schedules/recommend', {
      campusCode: editing.value.campus_code,
      doctorId: editing.value.doctor_id,
      dayOfWeek: editing.value.day_of_week
    }, { signal: recommendAbort.signal });
    if (!mounted) return;
    recommendations.value = (res && res.success) ? (res.recommendations || []) : [];
  } catch (e) {
    if (e && (e.name === 'CanceledError' || e.code === 'ERR_CANCELED')) return;
    if (!mounted) return;
    recommendations.value = [];
  }
}

function applyRecommendation(rec) {
  // 用推荐的 (room, slot) 填充表单
  editing.value.room_id = rec.roomId
  editing.value.room_name = rec.roomName
  editing.value.zone_name = rec.zoneName
  editing.value.time_slot_code = rec.slotCode
  editing.value.period = rec.period
  editing.value.start_time = rec.startTime
  editing.value.end_time = rec.endTime
  ElMessage.success('已应用推荐：' + rec.roomName + ' / ' + rec.slotName)
}

function scheduleRecommend() {
  if (!mounted) return;
  // 400ms 防抖：避免快速切换 doctor 时重复打 recommend 接口
  if (recommendTimer) clearTimeout(recommendTimer);
  recommendTimer = setTimeout(loadRecommendations, 400);
}

// loadAvailableSlots 仅在用户点击"查看空闲时段"按钮时手动触发
// 不在 watcher 里调度（避免每次编辑都打一次 API，但模板不渲染）

watch(() => editing.value, () => {
  scheduleCheck();
  scheduleRecommend();
}, { deep: true });

onBeforeUnmount(() => {
  mounted = false;
  if (conflictAbort) conflictAbort.abort();
  if (slotsAbort) slotsAbort.abort();
  if (recommendAbort) recommendAbort.abort();
  if (conflictCheckTimer) { clearTimeout(conflictCheckTimer); conflictCheckTimer = null; }
  if (recommendTimer) { clearTimeout(recommendTimer); recommendTimer = null; }
});

async function onSave() {
  // formRef.validate 已在 ScheduleFormDialog.onSave 中完成
  saving.value = true
  try {
    // 自动补全 campus_name / zone_name / room_name / clinic_type_name
    const c = campuses.value.find(x => x.code === editing.value.campus_code)
    if (c) editing.value.campus_name = c.name
    const z = zones.value.find(x => x.code === editing.value.zone_code)
    if (z) editing.value.zone_name = z.name
    const r = rooms.value.find(x => x.room_id === editing.value.room_id)
    if (r) editing.value.room_name = r.room_name
    const ct = clinicTypes.value.find(x => x.code === editing.value.clinic_type_code)
    if (ct) editing.value.clinic_type_name = ct.name

    let res
    if (editing.value.id) {
      res = await api.put('/schedules/' + editing.value.id, editing.value)
    } else {
      res = await api.post('/schedules', editing.value)
    }
    if (res.success) {
      ElMessage.success('已保存')
      dialogVisible.value = false
      loadList()
    } else {
      // #P1-14 修复：保存失败明确告诉用户
      ElMessage.error(res.error || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || '网络错误'))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // #P2-22 修复：Timeline 跳转带 highlight=id 过来，给行加 is-highlighted 类
  //   之前：router.push('/schedules', { query: { highlight: b.ids[0] } }) — 跳是跳了，但 Schedules.vue 不识别
  //   之后：route.query.highlight 写入 highlightId, el-table row-class-name 返回 is-highlighted
  if (route.query.highlight) highlightId.value = Number(route.query.highlight)

  // #B20：复用 onEdit 的 metadata 加载句柄，避免重复 fetch。
  // 首次进入时启动加载，onMounted 等待完成。
  if (!_metaLoadPromise) _metaLoadPromise = loadAllMeta()
  await _metaLoadPromise
  if (campuses.value.length > 0) filter.value.campusCode = campuses.value[0].code
  loadList()
})
</script>

<style scoped>
/* 院区切换 Tabs */
.campus-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.campus-tab {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 14px 24px;
  cursor: pointer;
  border: 1.5px solid var(--border-light);
  transition: all var(--duration-base) var(--ease-out);
  box-shadow: var(--shadow-sm);
  min-width: 140px;
  position: relative;
  overflow: hidden;
}
.campus-tab::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 3px;
  background: var(--color-primary);
  transform: scaleX(0);
  transition: transform var(--duration-base) var(--ease-out);
}
.campus-tab:hover {
  border-color: var(--color-primary-light);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.campus-tab.active {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
  color: #fff;
  border-color: var(--color-primary);
  box-shadow: 0 4px 16px rgba(3, 105, 161, 0.3);
}
.campus-tab.active::after { transform: scaleX(1); }
.campus-tab.active .campus-tab-code { color: rgba(255, 255, 255, 0.75); }
.campus-tab-name { font-size: 15px; font-weight: 700; }
.campus-tab-code { font-size: 11px; color: var(--text-muted); margin-top: 3px; letter-spacing: 1px; text-transform: uppercase; }

/* 智能推荐面板（已抽到 ScheduleRecommendPanel.vue） */
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  padding: 18px 20px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
}
.filter-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; margin-right: 4px; }
.filter-stats { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
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

/* 周次分组面板 */
.panel-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  padding: 18px 20px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--duration-base) var(--ease-out);
}
.panel-card:hover {
  box-shadow: var(--shadow-md);
}

.day-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}
.day-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-primary);
  position: relative;
  padding-left: 14px;
  letter-spacing: 0.3px;
}
.day-label::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  width: 4px;
  background: linear-gradient(180deg, var(--color-primary-light), var(--color-primary));
  border-radius: 2px;
}

/* 医生单元格 */
.doctor-cell { display: flex; align-items: center; gap: 10px; }
.doctor-avatar {
  background: var(--gradient-primary);
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}
.doctor-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.doctor-meta { font-size: 11px; color: var(--text-muted); }

/* 空态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-icon { font-size: 64px; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 15px; margin-bottom: 16px; }

/* #P2-22 Timeline 跳转高亮 — 行级动画 + 边框强调 */
:deep(.el-table__row.is-highlighted > td.el-table__cell) {
  background: linear-gradient(90deg, rgba(3, 105, 161, 0.12) 0%, rgba(14, 165, 233, 0.04) 100%) !important;
  box-shadow: inset 3px 0 0 var(--color-primary);
  font-weight: 600;
  animation: row-pulse 1.6s ease-in-out 2;
}
@keyframes row-pulse {
  0%, 100% { background-color: rgba(3, 105, 161, 0.12); }
  50%      { background-color: rgba(3, 105, 161, 0.22); }
}
</style>
