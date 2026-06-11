<template>
  <div class="view-wrap">

    <!-- 页面头 -->
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title-row">
          <el-icon class="page-title-icon"><component :is="'Clock'" /></el-icon>
          <h1 class="page-title">时段管理</h1>
        </div>
        <p class="page-subtitle">维护各院区+门诊类型的门诊时段（如上午/下午/夜班），含时间范围</p>
      </div>
      <div class="page-header-right">
        <el-button type="primary" @click="onAdd">新增时段</el-button>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="panel">
      <el-form :inline="true" :model="filter" class="filter-form">
        <el-form-item label="院区">
          <el-select v-model="filter.campus_code" placeholder="全部" clearable filterable style="width: 180px" @change="loadList">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="门诊类型">
          <el-select v-model="filter.clinic_type_code" placeholder="全部" clearable filterable style="width: 180px" @change="loadList">
            <el-option v-for="ct in clinicTypes" :key="ct.code" :label="ct.name" :value="ct.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="">
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="list" stripe :max-height="500" empty-text="暂无时段数据">
        <!-- #问题2：删除冗余 ID 列 + 加 type="index" "#" -->
        <!-- #问题3：min-width 提到 100+，加 show-overflow-tooltip 防代码截断 -->
        <el-table-column type="index" label="#" width="72" min-width="72" align="center" />
        <el-table-column prop="code" label="时段代码" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-mono text-sm">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="时段名称" min-width="130" show-overflow-tooltip />
        <el-table-column prop="campus_name" label="院区" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag size="small" type="success" effect="light">{{ row.campus_name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="clinic_type_name" label="门诊类型" min-width="130" show-overflow-tooltip />
        <el-table-column prop="period" label="午别" min-width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="periodTagType(row.period)" effect="light">{{ row.period }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间范围" min-width="160">
          <template #default="{ row }">
            <span class="font-mono text-sm">{{ row.start_time }} – {{ row.end_time }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="80" align="center" />
        <el-table-column label="操作" width="140" fixed="right" align="center">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="onEdit(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        :background="true"
        layout="total, prev, pager, next"
        class="pagination"
        @current-change="loadList"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing.id ? '编辑时段' : '新增时段'" width="640px" :close-on-click-modal="false">
      <el-form :model="editing" :rules="formRules" ref="formRef" label-width="120px" label-position="right">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="时段名称 *" prop="name">
              <el-input v-model="editing.name" placeholder="如：上午1段" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="时段代码 *" prop="code">
              <el-input v-model="editing.code" placeholder="如：YX-TESE-AM1" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="所属院区 *" prop="campus_code">
              <el-select v-model="editing.campus_code" placeholder="请选择院区" filterable style="width: 100%" @change="onCampusChange">
                <el-option v-for="c in campuses" :key="c.code" :label="c.name + '（' + c.code + '）'" :value="c.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="门诊类型 *" prop="clinic_type_code">
              <el-select v-model="editing.clinic_type_code" placeholder="请选择门诊类型" filterable style="width: 100%" @change="onClinicTypeChange">
                <el-option v-for="ct in clinicTypes" :key="ct.code" :label="ct.name + '（' + ct.code + '）'" :value="ct.code" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="午别 *" prop="period">
              <el-select v-model="editing.period" placeholder="请选择午别" style="width: 100%">
                <el-option label="上午" value="上午" />
                <el-option label="中午" value="中午" />
                <el-option label="下午" value="下午" />
                <el-option label="晚上" value="晚上" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="editing.sort_order" :min="0" :max="999" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="开始时间 *" prop="start_time">
              <el-time-select
                v-model="editing.start_time"
                placeholder="选择时间"
                style="width: 100%"
                :step="'00:30'"
                start="06:00"
                end="23:00"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间 *" prop="end_time">
              <el-time-select
                v-model="editing.end_time"
                placeholder="选择时间"
                style="width: 100%"
                :step="'00:30'"
                start="06:00"
                end="23:59"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, Refresh } from '@element-plus/icons-vue'
import api from '@/api'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref({})
const formRef = ref()

const campuses = ref([])
const clinicTypes = ref([])
const filter = reactive({ campus_code: '', clinic_type_code: '' })
const query = reactive({ page: 1, pageSize: 50 })

const PERIOD_TAG = { '上午': 'success', '中午': 'warning', '下午': '', '晚上': 'info' }
function periodTagType(p) { return PERIOD_TAG[p] || 'info' }

const formRules = {
  name: [{ required: true, message: '请输入时段名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入时段代码', trigger: 'blur' }],
  campus_code: [{ required: true, message: '请选择院区', trigger: 'change' }],
  clinic_type_code: [{ required: true, message: '请选择门诊类型', trigger: 'change' }],
  period: [{ required: true, message: '请选择午别', trigger: 'change' }],
  start_time: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  end_time: [{ required: true, message: '请选择结束时间', trigger: 'change' }]
}

function onCampusChange(code) {
  const c = campuses.value.find(x => x.code === code)
  if (c) editing.value.campus_name = c.name
}

function onClinicTypeChange(code) {
  const ct = clinicTypes.value.find(x => x.code === code)
  if (ct) editing.value.clinic_type_name = ct.name
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.get('/timeSlots', {
      campus_code: filter.campus_code || undefined,
      clinic_type_code: filter.clinic_type_code || undefined
    })
    if (res.success) {
      list.value = res.data || []
      total.value = res.total || list.value.length
    }
  } finally {
    loading.value = false
  }
}

function onAdd() {
  editing.value = { sort_order: 0 }
  dialogVisible.value = true
}
function onEdit(row) {
  editing.value = { ...row }
  dialogVisible.value = true
}
async function onDelete(row) {
  await ElMessageBox.confirm(`确定删除「${row.name}（${row.code}）」？`, '删除确认', { type: 'warning' })
  const res = await api.delete('/timeSlots/' + row.id)
  if (res.success) { ElMessage.success('已删除'); loadList() }
}
async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    if (!editing.value.campus_name && editing.value.campus_code) {
      const c = campuses.value.find(x => x.code === editing.value.campus_code)
      if (c) editing.value.campus_name = c.name
    }
    if (!editing.value.clinic_type_name && editing.value.clinic_type_code) {
      const ct = clinicTypes.value.find(x => x.code === editing.value.clinic_type_code)
      if (ct) editing.value.clinic_type_name = ct.name
    }
    let res
    if (editing.value.id) {
      res = await api.put('/timeSlots/' + editing.value.id, editing.value)
    } else {
      res = await api.post('/timeSlots', editing.value)
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

function resetFilter() {
  filter.campus_code = ''
  filter.clinic_type_code = ''
  loadList()
}

onMounted(async () => {
  const [c, ct] = await Promise.all([api.get('/campuses'), api.get('/clinicTypes')])
  if (c.success) campuses.value = c.data
  if (ct.success) clinicTypes.value = ct.data
  loadList()
})
</script>