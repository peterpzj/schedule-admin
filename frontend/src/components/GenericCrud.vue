<template>
  <div class="generic-crud">
    <!-- 表格容器 -->
    <div class="table-container">
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="query.q"
          placeholder="搜索关键字..."
          clearable
          :prefix-icon="Search"
          style="width: 260px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
        <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      </div>
      <div class="toolbar-right">
        <slot name="extra" />
        <el-button type="primary" :icon="Plus" @click="onAdd">新增</el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="list"
      stripe
      :max-height="tableMaxHeight"
      :empty-text="loading ? '加载中...' : '暂无数据'"
      class="responsive-cards"
    >
      <!-- #列宽从 56 → 72，避免两位数/三位数被软换行（white-space:nowrap 在全局 styles/global.css 兜底） -->
      <el-table-column type="index" label="#" width="72" min-width="72" align="center" :label-class-name="'col-label-index'" />
      <el-table-column
        v-for="col in columns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :min-width="col.minWidth || 110"
        :width="col.width"
        :sortable="col.sortable"
        :formatter="col.formatter"
        :align="col.align || 'left'"
        :class-name="'col-' + col.prop"
        :label-class-name="'col-label-' + col.prop"
        show-overflow-tooltip
      >
        <template v-if="col.tag" #default="{ row }">
          <el-tag :type="col.tag(row)" effect="light" size="small">{{ col.formatter ? col.formatter(row) : row[col.prop] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="onEdit(row)">
            <el-icon><Edit /></el-icon>编辑
          </el-button>
          <el-button size="small" link type="danger" @click="onDelete(row)">
            <el-icon><Delete /></el-icon>删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="query.page"
      v-model:page-size="query.pageSize"
      :total="total"
      :page-sizes="[20, 50, 100, 200]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      class="pagination"
      @current-change="loadList"
      @size-change="loadList"
    />
    </div><!-- /table-container -->

    <el-dialog
      v-model="dialogVisible"
      :title="editing.id ? '编辑' + entityName : '新增' + entityName"
      width="640px"
      :close-on-click-modal="false"
      @closed="onDialogClosed"
    >
      <el-form
        ref="formRef"
        :model="editing"
        :rules="formRules"
        label-width="110px"
        label-position="right"
      >
        <el-form-item
          v-for="field in visibleFormFields"
          :key="field.prop"
          :label="field.label + (field.required !== false ? ' *' : '')"
          :prop="field.prop"
        >
          <FieldRenderer :field="field" v-model="editing[field.prop]" :disabled="field.disabled || field.readOnly" />
          <span v-if="field.hint" class="field-hint">{{ field.hint }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :icon="Check" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Delete, Check } from '@element-plus/icons-vue'
import api from '@/api'
import FieldRenderer from '@/components/FieldRenderer.vue'
import { useDebouncedFn } from '@/composables/useDebouncedFn'

const props = defineProps({
  endpoint:    { type: String, required: true },
  entityName:  { type: String, default: '记录' },
  columns:     { type: Array, required: true },
  formFields:  { type: Array, required: true },
  rules:       { type: Object, default: () => ({}) },
  fixedQuery:  { type: Object, default: () => ({}) }
})

const list = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const editing = ref({})
const formRef = ref()

const query = reactive({ page: 1, pageSize: 20, q: '' })

const tableMaxHeight = computed(function () {
  if (typeof window === 'undefined') return 600
  return Math.max(400, window.innerHeight - 320)
})

// 过滤 hidden=true 的字段（动态隐藏用）
const visibleFormFields = computed(function () {
  return props.formFields.filter(function (f) { return !f.hidden; });
})

const formRules = computed(function () {
  const r = {}
  props.formFields.forEach(function (f) {
    if (f.required !== false) {
      r[f.prop] = [{ required: true, message: '请输入' + f.label, trigger: 'blur' }]
    }
    if (f.rules && Array.isArray(f.rules)) r[f.prop] = (r[f.prop] || []).concat(f.rules)
  })
  return Object.assign({}, r, props.rules)
})

async function loadList() {
  loading.value = true
  try {
    const res = await api.get(props.endpoint, Object.assign({}, query, props.fixedQuery))
    if (res.success) {
      list.value = res.data || []
      total.value = res.total || 0
    }
  } finally {
    loading.value = false
  }
}

// 防抖版 loadList — 用于搜索输入框，输入即搜索（350ms 静默后触发）
const debouncedSearch = useDebouncedFn(function () {
  query.page = 1
  loadList()
}, 350)

function onSearch() { query.page = 1; loadList() }

// 监听搜索关键字：实时防抖搜索
watch(() => query.q, function () {
  debouncedSearch()
})

function onAdd() {
  const init = {}
  props.formFields.forEach(function (f) { if (f.defaultValue !== undefined) init[f.prop] = f.defaultValue })
  editing.value = init
  dialogVisible.value = true
}

function onEdit(row) { editing.value = Object.assign({}, row); dialogVisible.value = true }

async function onDelete(row) {
  const name = row.name || row.title || row.doctorName || row.username || row.id
  await ElMessageBox.confirm('确定删除「' + name + '」？此操作不可恢复。', '删除确认', {
    type: 'warning',
    confirmButtonText: '确认删除',
    cancelButtonText: '取消'
  })
  const res = await api.delete(props.endpoint + '/' + row.id)
  if (res.success) { ElMessage.success('已删除'); loadList() }
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

function onDialogClosed() { editing.value = {} }

onMounted(loadList)
defineExpose({ loadList, refresh: loadList })
</script>

<style scoped>
.field-hint { display: block; color: var(--text-muted); font-size: 12px; margin-top: 4px; }

.generic-crud {
  background: var(--bg-base);
  border-radius: var(--radius-lg);
  padding: 20px;
}

/* 工具栏 - 卡片式设计 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  flex-wrap: wrap;
  gap: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 14px 18px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-light);
  transition: box-shadow var(--duration-base) var(--ease-out);
}
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 10px; }
.toolbar .el-input__wrapper { border-radius: var(--radius-md) !important; }

/* 表格容器 */
.table-container {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table-container :deep(.el-table) {
  border-radius: 0;
}
.table-container :deep(.el-table th) {
  background: var(--bg-muted) !important;
}

/* 分页 */
.pagination {
  margin-top: 14px;
  justify-content: flex-end;
  display: flex;
  background: var(--bg-card);
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);
}
</style>
