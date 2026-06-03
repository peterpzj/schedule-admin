<template>
  <div>
    <el-card>
      <el-form :inline="true" :model="filter" class="filter-bar">
        <el-form-item label="院区">
          <el-select v-model="filter.campus_code" placeholder="全部" clearable @change="onFilter" style="width: 160px">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="诊区">
          <el-select v-model="filter.zone_code" placeholder="全部" clearable @change="onFilter" style="width: 140px">
            <el-option v-for="z in filteredZones" :key="z.code" :label="z.name" :value="z.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="门诊类型">
          <el-select v-model="filter.clinic_type_code" placeholder="全部" clearable @change="onFilter" style="width: 140px">
            <el-option v-for="c in clinicTypes" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="周次">
          <el-select v-model="filter.day_of_week" placeholder="全部" clearable @change="onFilter" style="width: 100px">
            <el-option v-for="(d, i) in ['周一','周二','周三','周四','周五','周六','周日']" :key="i+1" :label="d" :value="i+1" />
          </el-select>
        </el-form-item>
        <el-form-item label="医生">
          <el-input v-model="filter.doctorName" placeholder="姓名搜索" clearable @keyup.enter="onFilter" style="width: 140px" />
        </el-form-item>
      </el-form>

      <el-table
        v-loading="loading"
        :data="list"
        stripe
        :max-height="600"
      >
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="doctor_name" label="医生" min-width="100" />
        <el-table-column prop="work_id" label="工号" min-width="80" />
        <el-table-column prop="department" label="科室" min-width="100" />
        <el-table-column prop="campus_name" label="院区" min-width="100" />
        <el-table-column prop="zone_name" label="诊区" min-width="80" />
        <el-table-column prop="room_id" label="诊室" min-width="80" />
        <el-table-column prop="clinic_type_name" label="门诊类型" min-width="100" />
        <el-table-column prop="time_slot_code" label="时段代码" min-width="120" />
        <el-table-column prop="period" label="午别" min-width="60" />
        <el-table-column prop="day_of_week" label="周次" min-width="60" :formatter="dowFmt" />
        <el-table-column prop="start_time" label="开始" min-width="70" />
        <el-table-column prop="end_time" label="结束" min-width="70" />
        <el-table-column prop="patient_limit" label="限号" min-width="60" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :page-size="50"
        :total="total"
        layout="total, prev, pager, next"
        class="pagination"
        @current-change="loadList"
      />
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing.id ? '编辑排班' : '新增排班'" width="600px">
      <el-form :model="editing" label-width="100px">
        <el-form-item label="医生">
          <el-select v-model="editing.doctor_id" placeholder="请选择医生" style="width: 100%">
            <el-option v-for="d in doctors" :key="d.id" :label="`${d.name} (${d.work_id})`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="院区">
          <el-select v-model="editing.campus_code" placeholder="请选择院区" @change="onCampusChange" style="width: 100%">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="诊区">
          <el-select v-model="editing.zone_code" placeholder="请选择诊区" @change="onZoneChange" style="width: 100%">
            <el-option v-for="z in filteredZones" :key="z.code" :label="z.name" :value="z.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="诊室">
          <el-select v-model="editing.room_id" placeholder="请选择诊室" style="width: 100%">
            <el-option v-for="r in filteredRooms" :key="r.room_id" :label="`${r.room_id} (${r.zone_name})`" :value="r.room_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="门诊类型">
          <el-select v-model="editing.clinic_type_code" placeholder="请选择门诊类型" @change="onClinicTypeChange" style="width: 100%">
            <el-option v-for="c in clinicTypes" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="时段">
          <el-select v-model="editing.time_slot_code" placeholder="请选择时段" @change="onSlotChange" style="width: 100%">
            <el-option v-for="t in filteredSlots" :key="t.code" :label="`${t.name} (${t.start_time}-${t.end_time})`" :value="t.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="周次">
          <el-select v-model="editing.day_of_week" placeholder="请选择" style="width: 100%">
            <el-option v-for="(d, i) in ['周一','周二','周三','周四','周五','周六','周日']" :key="i+1" :label="d" :value="i+1" />
          </el-select>
        </el-form-item>
        <el-form-item label="限号数">
          <el-input-number v-model="editing.patient_limit" :min="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editing.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const dialogVisible = ref(false)
const editing = ref({})

const campuses = ref([])
const zones = ref([])
const rooms = ref([])
const timeSlots = ref([])
const clinicTypes = ref([])
const doctors = ref([])

const filter = ref({ campus_code: '', zone_code: '', clinic_type_code: '', day_of_week: '', doctorName: '' })

const filteredZones = computed(() => {
  if (!filter.value.campus_code) return zones.value
  return zones.value.filter(z => z.campus_code === filter.value.campus_code)
})

const filteredRooms = computed(() => {
  return rooms.value.filter(r => r.campus_code === editing.value.campus_code && (!editing.value.zone_code || r.zone_code === editing.value.zone_code))
})

const filteredSlots = computed(() => {
  return timeSlots.value.filter(t => t.campus_code === editing.value.campus_code && (!editing.value.clinic_type_code || t.clinic_type_code === editing.value.clinic_type_code))
})

function dowFmt(row) {
  return ['周一','周二','周三','周四','周五','周六','周日'][row.day_of_week - 1] || ''
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.get('/schedules', filter.value)
    if (res.success) {
      list.value = res.data
      total.value = res.data.length
    }
  } finally {
    loading.value = false
  }
}

function onFilter() { page.value = 1; loadList() }

function onAdd() {
  editing.value = { day_of_week: 1, patient_limit: 30 }
  dialogVisible.value = true
}

function onEdit(row) {
  editing.value = { ...row }
  dialogVisible.value = true
}

async function onDelete(row) {
  await ElMessageBox.confirm(`确定删除 ${row.doctor_name} 的排班？`, '提示', { type: 'warning' })
  const res = await api.delete('/schedules/' + row.id)
  if (res.success) { ElMessage.success('已删除'); loadList() }
}

async function onSave() {
  if (!editing.value.doctor_id) { ElMessage.error('请选择医生'); return }
  saving.value = true
  try {
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
    }
  } finally {
    saving.value = false
  }
}

function onCampusChange() {
  editing.value.zone_code = ''
  editing.value.room_id = ''
}
function onZoneChange() {
  editing.value.room_id = ''
}
function onClinicTypeChange() {
  editing.value.time_slot_code = ''
}

onMounted(async () => {
  await Promise.all([
    api.get('/campuses').then(r => { if (r.success) campuses.value = r.data }),
    api.get('/zones').then(r => { if (r.success) zones.value = r.data }),
    api.get('/rooms').then(r => { if (r.success) rooms.value = r.data }),
    api.get('/timeSlots').then(r => { if (r.success) timeSlots.value = r.data }),
    api.get('/clinicTypes').then(r => { if (r.success) clinicTypes.value = r.data }),
    api.get('/doctors').then(r => { if (r.success) doctors.value = r.data })
  ])
  loadList()
})
</script>

<style scoped>
.filter-bar { margin-bottom: 16px; }
.pagination { margin-top: 20px; justify-content: flex-end; }
</style>
