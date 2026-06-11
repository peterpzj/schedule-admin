<template>
  <div class="view-wrap">

    <!-- 页面头 -->
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title-row">
          <el-icon class="page-title-icon"><component :is="'House'" /></el-icon>
          <h1 class="page-title">诊室管理</h1>
        </div>
        <p class="page-subtitle">维护诊区下的诊室，诊室编号在同一院区内唯一</p>
      </div>
      <div class="page-header-right">
        <el-button type="primary" @click="onAdd">新增诊室</el-button>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="panel">
      <el-form :inline="true" :model="filter" class="filter-form">
        <el-form-item label="院区">
          <el-select v-model="filter.campus_code" placeholder="全部" clearable filterable style="width: 180px" @change="onCampusFilterChange">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="诊区">
          <el-select v-model="filter.zone_code" placeholder="全部" clearable filterable style="width: 180px" @change="onFilter">
            <el-option v-for="z in filteredZones" :key="z.code" :label="z.name" :value="z.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="">
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="list" stripe :max-height="500" empty-text="暂无诊室数据">
        <!-- #问题2：删除冗余 ID 列 + 加 type="index" "#" -->
        <!-- #问题3：min-width 提到 100+，加 show-overflow-tooltip 防 ID/代码截断 -->
        <el-table-column type="index" label="#" width="72" min-width="72" align="center" />
        <el-table-column prop="room_id" label="诊室编号" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-mono">{{ row.room_id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="room_name" label="诊室名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="campus_name" label="院区" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag size="small" type="success" effect="light">{{ row.campus_name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="zone_name" label="诊区" min-width="120" show-overflow-tooltip />
        <el-table-column prop="department" label="归属科室" min-width="130" show-overflow-tooltip />
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
    <el-dialog v-model="dialogVisible" :title="editing.id ? '编辑诊室' : '新增诊室'" width="640px" :close-on-click-modal="false">
      <el-form :model="editing" :rules="formRules" ref="formRef" label-width="110px" label-position="right">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="诊室编号 *" prop="room_id">
              <el-input v-model="editing.room_id" placeholder="如：301" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="诊室名称 *" prop="room_name">
              <el-input v-model="editing.room_name" placeholder="如：301诊室" clearable />
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
            <el-form-item label="所属诊区 *" prop="zone_code">
              <el-select v-model="editing.zone_code" placeholder="请先选院区" filterable style="width: 100%" :disabled="!editing.campus_code" @change="onZoneChange">
                <el-option v-for="z in formZoneOptions" :key="z.code" :label="z.name + '（' + z.code + '）'" :value="z.code" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="归属科室">
              <el-input v-model="editing.department" placeholder="如：内科（选填）" clearable />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { House, Refresh } from '@element-plus/icons-vue'
import api from '@/api'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref({})
const formRef = ref()

const campuses = ref([])
const allZones = ref([])
const filter = reactive({ campus_code: '', zone_code: '' })
const query = reactive({ page: 1, pageSize: 50 })

const filteredZones = computed(() => {
  if (!filter.campus_code) return allZones.value
  return allZones.value.filter(z => z.campus_code === filter.campus_code)
})

// 表单内诊区选项（随院区联动）
const formZoneOptions = computed(() => {
  if (!editing.value.campus_code) return []
  return allZones.value.filter(z => z.campus_code === editing.value.campus_code)
})

const formRules = {
  room_id: [{ required: true, message: '请输入诊室编号', trigger: 'blur' }],
  room_name: [{ required: true, message: '请输入诊室名称', trigger: 'blur' }],
  campus_code: [{ required: true, message: '请选择院区', trigger: 'change' }],
  zone_code: [{ required: true, message: '请选择诊区', trigger: 'change' }]
}

function onCampusChange(code) {
  const c = campuses.value.find(x => x.code === code)
  if (c) editing.value.campus_name = c.name
  editing.value.zone_code = ''
  editing.value.zone_name = ''
}

function onZoneChange(code) {
  const z = allZones.value.find(x => x.code === code)
  if (z) editing.value.zone_name = z.name
}

function onCampusFilterChange() {
  filter.zone_code = ''
  loadList()
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.get('/rooms', {
      campus_code: filter.campus_code || undefined,
      zone_code: filter.zone_code || undefined
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
  editing.value = {}
  dialogVisible.value = true
}
function onEdit(row) {
  editing.value = { ...row }
  dialogVisible.value = true
}
async function onDelete(row) {
  await ElMessageBox.confirm(`确定删除「${row.room_name}（${row.room_id}）」？`, '删除确认', { type: 'warning' })
  const res = await api.delete('/rooms/' + row.id)
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
    if (!editing.value.zone_name && editing.value.zone_code) {
      const z = allZones.value.find(x => x.code === editing.value.zone_code)
      if (z) editing.value.zone_name = z.name
    }
    let res
    if (editing.value.id) {
      res = await api.put('/rooms/' + editing.value.id, editing.value)
    } else {
      res = await api.post('/rooms', editing.value)
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

function onFilter() { loadList() }
function resetFilter() {
  filter.campus_code = ''
  filter.zone_code = ''
  loadList()
}

onMounted(async () => {
  // #问题4-D 修复：3 个 API 并发拉，省 2 个 RTT
  const [c, z] = await Promise.all([api.get('/campuses'), api.get('/zones')])
  if (c.success) campuses.value = c.data
  if (z.success) allZones.value = z.data
  // loadList 不需要等上面（与 rooms 列表独立），并发触发
  loadList()
})
</script>

<style scoped>
.filter-form { display: flex; align-items: center; gap: 0; margin-bottom: 12px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; margin-right: 8px; }
</style>