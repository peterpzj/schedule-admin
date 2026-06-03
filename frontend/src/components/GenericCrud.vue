<template>
  <div class="generic-crud">
    <!-- 顶部操作栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="query.q"
          placeholder="搜索..."
          clearable
          :prefix-icon="Search"
          style="width: 240px"
          @keyup.enter="onSearch"
        />
        <el-button type="primary" :icon="Search" @click="onSearch">搜索</el-button>
        <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      </div>
      <el-button type="primary" :icon="Plus" @click="onAdd">新增</el-button>
    </div>

    <!-- 列表 -->
    <el-table
      v-loading="loading"
      :data="list"
      stripe
      :max-height="tableMaxHeight"
    >
      <el-table-column type="index" label="#" width="60" />
      <el-table-column
        v-for="col in columns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :min-width="col.minWidth || 120"
        :sortable="col.sortable"
        :formatter="col.formatter"
      />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="onEdit(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="query.page"
      v-model:page-size="query.pageSize"
      :total="total"
      :page-sizes="[20, 50, 100, 200]"
      layout="total, sizes, prev, pager, next, jumper"
      class="pagination"
      @current-change="loadList"
      @size-change="loadList"
    />

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editing.id ? '编辑' : '新增'"
      width="600px"
      @closed="onDialogClosed"
    >
      <el-form ref="formRef" :model="editing" :rules="formRules" label-width="100px">
        <el-form-item
          v-for="field in formFields"
          :key="field.prop"
          :label="field.label"
          :prop="field.prop"
        >
          <el-input v-if="field.type !== 'number' && field.type !== 'select'" v-model="editing[field.prop]" />
          <el-input-number v-else-if="field.type === 'number'" v-model="editing[field.prop]" :min="0" />
          <el-select v-else v-model="editing[field.prop]" placeholder="请选择">
            <el-option v-for="opt in field.options" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
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
import { ref, reactive, computed, onMounted, watch, h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import api from '@/api'

const props = defineProps({
  endpoint: { type: String, required: true },
  columns: { type: Array, required: true },
  formFields: { type: Array, required: true },
  rules: { type: Object, default: () => ({}) },
  fixedQuery: { type: Object, default: () => ({}) }
})

const list = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref({})
const formRef = ref()

const query = reactive({
  page: 1,
  pageSize: 50,
  q: ''
})

// 把 formFields 转为表单规则
const formRules = computed(() => {
  const r = {}
  props.formFields.forEach(f => {
    if (f.required !== false) {
      r[f.prop] = [{ required: true, message: '请输入' + f.label, trigger: 'blur' }]
    }
  })
  return { ...r, ...props.rules }
})

async function loadList() {
  loading.value = true
  try {
    const res = await api.get(props.endpoint, { ...query, ...props.fixedQuery })
    if (res.success) {
      list.value = res.data
      total.value = res.total
    }
  } finally {
    loading.value = false
  }
}

function onSearch() { query.page = 1; loadList() }

function onAdd() {
  editing.value = {}
  dialogVisible.value = true
}

function onEdit(row) {
  editing.value = { ...row }
  dialogVisible.value = true
}

async function onDelete(row) {
  await ElMessageBox.confirm(`确定删除「${row.name || row.id}」？`, '提示', { type: 'warning' })
  const res = await api.delete(props.endpoint + '/' + row.id)
  if (res.success) {
    ElMessage.success('已删除')
    loadList()
  }
}

async function onSave() {
  await formRef.value.validate()
  saving.value = true
  try {
    if (editing.value.id) {
      const res = await api.put(props.endpoint + '/' + editing.value.id, editing.value)
      if (res.success) ElMessage.success('已更新')
    } else {
      const res = await api.post(props.endpoint, editing.value)
      if (res.success) ElMessage.success('已新增')
    }
    dialogVisible.value = false
    loadList()
  } finally {
    saving.value = false
  }
}

function onDialogClosed() {
  editing.value = {}
}

onMounted(loadList)
defineExpose({ loadList, refresh: loadList })
</script>

<style scoped>
.toolbar { display: flex; justify-content: space-between; margin-bottom: 16px; }
.toolbar-left { display: flex; gap: 8px; }
.pagination { margin-top: 20px; justify-content: flex-end; }
:deep(.el-table) { border-radius: 8px; }
</style>
