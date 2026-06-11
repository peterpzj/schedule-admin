<template>
  <div class="view-wrap">
    <!-- 页面头 -->
    <PageHeader title="操作日志" subtitle="记录后台所有操作行为，便于审计追溯" icon="Ticket">
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
    </PageHeader>

    <!-- 过滤栏 -->
    <FilterBar>
      <el-form :inline="true" :model="filter" class="filter-form">
        <el-form-item label="操作人">
          <el-input v-model="filter.username" placeholder="用户名" clearable style="width: 160px" @keyup.enter="loadList" @clear="loadList" />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filter.action" placeholder="全部操作" clearable filterable style="width: 160px" @change="loadList">
            <el-option v-for="a in actionOptions" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作对象">
          <el-input v-model="filter.entity" placeholder="如 users, schedules" clearable style="width: 160px" @keyup.enter="loadList" @clear="loadList" />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 240px"
            @change="onDateChange"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="loadList">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </FilterBar>

    <!-- 日志列表 -->
    <div class="panel">
      <el-table
        v-loading="loading"
        :data="list"
        stripe
        :max-height="600"
        :empty-text="loading ? '加载中...' : '暂无操作记录'"
      >
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="created_at" label="时间" min-width="160">
          <template #default="{ row }">
            <span class="font-mono text-sm">{{ formatTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="操作人" min-width="120">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-cell-avatar">{{ (row.username || '?').slice(0, 1).toUpperCase() }}</div>
              <span>{{ row.username }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="140">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" size="small" effect="light">
              {{ actionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="entity" label="对象" min-width="100">
          <template #default="{ row }">
            <span class="text-secondary">{{ row.entity || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="entity_id" label="对象ID" min-width="80" align="center">
          <template #default="{ row }">{{ row.entity_id || '—' }}</template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" min-width="130">
          <template #default="{ row }">
            <span class="font-mono text-sm text-muted">{{ row.ip || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="details" label="详情" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.details" class="text-sm">{{ formatDetails(row.details) }}</span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        :background="true"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="loadList"
        @size-change="loadList"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import FilterBar from '@/components/FilterBar.vue'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const dateRange = ref([])

const filter = reactive({ username: '', action: '', entity: '' })

const query = reactive({ page: 1, pageSize: 20 })

const actionOptions = [
  { value: 'login', label: '登录' },
  { value: 'logout', label: '登出' },
  { value: 'change_password', label: '改密' },
  { value: 'create_user', label: '创建账号' },
  { value: 'import', label: '导入' },
  { value: 'import_dry_run', label: '试导入' },
  { value: 'export', label: '导出' }
]

function actionLabel(a) {
  return { login: '登录', logout: '登出', change_password: '改密', create_user: '创建账号', import: '导入', import_dry_run: '试导入', export: '导出' }[a] || a
}

function actionTagType(a) {
  if (a === 'login' || a === 'logout') return 'info'
  if (a === 'create_user' || a === 'import') return 'success'
  if (a === 'change_password') return 'warning'
  if (a === 'export') return ''
  return 'info'
}

function formatTime(t) {
  if (!t) return '—'
  return t.replace(' ', 'T').slice(0, 19).replace('T', ' ')
}

function formatDetails(d) {
  if (!d) return ''
  if (typeof d === 'string') {
    try { d = JSON.parse(d) } catch (_) {}
  }
  if (typeof d === 'object') {
    return Object.entries(d).map(([k, v]) => `${k}=${v}`).join(', ')
  }
  return String(d)
}

function onDateChange(val) {
  if (val) {
    filter.startDate = val[0]
    filter.endDate = val[1]
  } else {
    filter.startDate = ''
    filter.endDate = ''
  }
  loadList()
}

async function loadList() {
  loading.value = true
  try {
    const params = {
      page: query.page,
      pageSize: query.pageSize,
      username: filter.username,
      action: filter.action,
      entity: filter.entity,
      startDate: filter.startDate,
      endDate: filter.endDate
    }
    const res = await api.get('/auditLogs', params)
    if (res.success) {
      list.value = res.data || []
      total.value = res.total || 0
    }
  } finally {
    loading.value = false
  }
}

function resetFilter() {
  filter.username = ''
  filter.action = ''
  filter.entity = ''
  filter.startDate = ''
  filter.endDate = ''
  dateRange.value = []
  query.page = 1
  loadList()
}

onMounted(loadList)
</script>

<style scoped>
.filter-form { display: flex; flex-wrap: wrap; align-items: center; gap: 0; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; margin-right: 8px; }

.user-cell { display: flex; align-items: center; gap: 8px; }
.user-cell-avatar {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.page-title-row { display: flex; align-items: center; gap: 10px; }
.page-title-icon { font-size: 22px; color: var(--color-primary); }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.page-subtitle { font-size: 12px; color: var(--text-muted); margin: 2px 0 0; }
/* page-header 样式已抽到 PageHeader.vue */
</style>