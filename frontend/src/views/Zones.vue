<template>
  <div class="view-wrap">

    <!-- 页面头 -->
    <PageHeader title="诊区管理" subtitle="维护各院区下的诊区信息，诊区代码唯一" icon="Grid" />

    <!-- 过滤栏 -->
    <FilterBar>
      <el-form :inline="true" :model="filter" class="filter-form">
        <el-form-item label="院区">
          <el-select v-model="filter.campus_code" placeholder="全部院区" clearable filterable style="width: 180px" @change="loadList">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 列表 -->
      <!-- #问题2：删除冗余 ID 列 + 加 type="index" "#" -->
      <!-- #问题3：min-width 提到 100+，加 show-overflow-tooltip 防 ID/代码截断 -->
      <el-table v-loading="loading" :data="list" stripe :max-height="500">
        <el-table-column type="index" label="#" width="72" min-width="72" align="center" />
        <el-table-column prop="code" label="诊区代码" min-width="120" show-overflow-tooltip />
        <el-table-column prop="name" label="诊区名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="campus_name" label="所属院区" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag size="small" effect="light">{{ row.campus_name }}</el-tag>
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
    </FilterBar>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing.id ? '编辑诊区' : '新增诊区'" width="560px" :close-on-click-modal="false">
      <el-form :model="editing" :rules="formRules" ref="formRef" label-width="110px" label-position="right">
        <el-form-item label="诊区名称 *" prop="name">
          <el-input v-model="editing.name" placeholder="如：1诊区、2诊区" clearable />
        </el-form-item>
        <el-form-item label="诊区代码 *" prop="code">
          <el-input v-model="editing.code" placeholder="如：YX-Z1（建议院区缩写-序号）" clearable />
        </el-form-item>
        <el-form-item label="所属院区 *" prop="campus_code">
          <el-select v-model="editing.campus_code" placeholder="请选择院区" filterable style="width: 100%" @change="onCampusChange">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name + '（' + c.code + '）'" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="editing.sort_order" :min="0" :max="999" style="width: 100%" />
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Grid } from '@element-plus/icons-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import FilterBar from '@/components/FilterBar.vue'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref({})
const formRef = ref()

const campuses = ref([])
const filter = reactive({ campus_code: '' })
const query = reactive({ page: 1, pageSize: 50 })

const formRules = {
  name: [{ required: true, message: '请输入诊区名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入诊区代码', trigger: 'blur' }],
  campus_code: [{ required: true, message: '请选择所属院区', trigger: 'change' }]
}

function onCampusChange(code) {
  const c = campuses.value.find(x => x.code === code)
  if (c) editing.value.campus_name = c.name
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.get('/zones', { campus_code: filter.campus_code || undefined })
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
  const res = await api.delete('/zones/' + row.id)
  if (res.success) { ElMessage.success('已删除'); loadList() }
}
async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    // 自动补全 campus_name
    if (!editing.value.campus_name && editing.value.campus_code) {
      const c = campuses.value.find(x => x.code === editing.value.campus_code)
      if (c) editing.value.campus_name = c.name
    }
    let res
    if (editing.value.id) {
      res = await api.put('/zones/' + editing.value.id, editing.value)
    } else {
      res = await api.post('/zones', editing.value)
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

onMounted(async () => {
  // #问题4-D 修复：Promise.all 并发拉 campuses + zones，省一个 RTT
  await Promise.all([
    api.get('/campuses').then(r => { if (r.success) campuses.value = r.data }),
    loadList()
  ])
})
</script>

<style scoped>
.filter-form { display: flex; align-items: center; gap: 0; margin-bottom: 12px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; margin-right: 8px; }
</style>