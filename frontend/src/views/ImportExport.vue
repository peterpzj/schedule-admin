<template>
  <div class="ie-page view-wrap">

    <el-row :gutter="20">

      <!-- 排班快速导入(重型版 - P1-13) -->
      <el-col :span="24">
        <el-card class="panel" shadow="never">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <AppIcon name="upload" :size="16" />
                排班快速导入（Excel/CSV → 一键上传）
              </span>
              <el-tag size="small" type="success">推荐</el-tag>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="12">
              <div class="tip-card tip-card--info">
                <div class="tip-card__title">使用步骤</div>
                <div class="tip-card__body">
                  <p>1) 点击「下载排班模板」拿到单 sheet Excel（仅排班表）</p>
                  <p>2) 在 Excel 填入排班（首行表头）</p>
                  <p>3) 选文件 → 「上传导入」即可</p>
                  <p>支持 <b>.xlsx / .xls / .csv</b>，单次最多 500 行</p>
                </div>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="quick-upload">
                <el-button type="primary" :icon="Download" @click="onDownloadScheduleTemplate">
                  下载排班模板
                </el-button>
                <el-upload
                  class="quick-upload__picker"
                  :auto-upload="false"
                  :limit="1"
                  :on-change="onScheduleFileChange"
                  :show-file-list="false"
                  accept=".xlsx,.xls,.csv"
                >
                  <el-button :icon="UploadFilled">选择文件</el-button>
                </el-upload>
                <el-button
                  type="success"
                  :icon="Promotion"
                  :disabled="!scheduleFile"
                  :loading="scheduleUploading"
                  @click="onScheduleUpload"
                >
                  上传导入
                </el-button>
                <div v-if="scheduleFile" class="quick-upload__file">
                  📄 {{ scheduleFile.name }}（{{ (scheduleFile.size / 1024).toFixed(1) }} KB）
                </div>
                <div v-if="scheduleResult" class="quick-upload__result" :class="scheduleResult.success ? 'is-success' : 'is-error'">
                  <div v-if="scheduleResult.success">
                    ✓ 成功 {{ scheduleResult.inserted }} 条
                    <span v-if="scheduleResult.conflicts?.length">· 冲突 {{ scheduleResult.conflicts.length }} 条</span>
                    <span v-if="scheduleResult.errors?.length">· 错误 {{ scheduleResult.errors.length }} 条</span>
                  </div>
                  <div v-else>✘ {{ scheduleResult.error }}</div>
                  <el-button v-if="scheduleResult.errors?.length" link size="small" @click="showScheduleErrors = true">
                    查看错误明细
                  </el-button>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <!-- 导入 -->
      <el-col :span="12">
        <el-card class="panel" shadow="never">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">
                <AppIcon name="file" :size="16" />
                导入数据
              </span>
            </div>
          </template>

          <el-steps :space="80" :active="step" finish-status="success" align-center class="steps">
            <el-step title="下载模板" />
            <el-step title="填写数据" />
            <el-step title="上传导入" />
          </el-steps>

          <div class="step-content">
            <!-- 步骤说明 -->
            <div v-if="step === 0" class="step-block">
              <div class="tip-card tip-card--info">
                <div class="tip-card__title">Excel 模板说明</div>
                <div class="tip-card__body">
                  <p>下载标准模板，按格式填写数据。支持 <b>8 个 Sheet</b>：</p>
                  <div class="sheet-list">
                    <div v-for="s in sheets" :key="s.name" class="sheet-item">
                      <span class="sheet-num">{{ s.num }}</span>
                      <span class="sheet-name">{{ s.name }}</span>
                      <span class="sheet-count">{{ s.desc }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <el-button type="primary" class="btn-block" @click="onDownloadTemplate">
                下载标准模板
              </el-button>
              <el-button text class="btn-next" @click="step = 1">我已填好数据，继续 ›</el-button>
            </div>

            <!-- 填写说明 -->
            <div v-if="step === 1" class="step-block">
              <div class="tip-card tip-card--warn">
                <div class="tip-card__title">填写规范</div>
                <div class="tip-card__body">
                  <p><b>必填字段（黄色高亮列）请务必填写</b></p>
                  <p>同一 sheet 内不要有空行</p>
                  <p>建议先导入「院区→科室→诊区→诊室→时段→医生」，最后「排班」</p>
                </div>
              </div>
              <el-button type="primary" class="btn-block" @click="onDownloadTemplate">
                重新下载模板
              </el-button>

              <!-- 导入模式选择 -->
              <div class="mode-selector">
                <div class="mode-selector__title">导入模式（决定已存在数据如何处理）</div>
                <el-radio-group v-model="importMode" class="mode-selector__group">
                  <el-radio-button value="skip">
                    <div class="mode-option">
                      <div class="mode-option__name">跳过已有</div>
                      <div class="mode-option__desc">已存在的不变，只新增。安全默认。</div>
                    </div>
                  </el-radio-button>
                  <el-radio-button value="overwrite">
                    <div class="mode-option">
                      <div class="mode-option__name">覆盖已有</div>
                      <div class="mode-option__desc">存在的会被新数据替换。改基础数据时用。</div>
                    </div>
                  </el-radio-button>
                  <el-radio-button value="replace">
                    <div class="mode-option">
                      <div class="mode-option__name">完全替换</div>
                      <div class="mode-option__desc">清空该表全部数据再导入。危险操作。</div>
                    </div>
                  </el-radio-button>
                </el-radio-group>
                <div v-if="importMode === 'replace'" class="mode-warn">
                  完全替换模式会先清空表再导入。<br>
                  <span v-if="replaceWarnings.length">
                    <b>特别注意</b>：{{ replaceWarnings.join('、') }}<br>
                  </span>
                  建议先导出当前数据作为备份。
                </div>
              </div>

              <div class="upload-zone">
                <el-upload
                  drag
                  :auto-upload="false"
                  :limit="1"
                  :on-change="onFileChange"
                  :show-file-list="false"
                  accept=".xlsx,.xls"
                >
                  <div class="upload-hint">
                    <div class="upload-icon" aria-hidden="true">
                      <AppIcon name="file" :size="40" />
                    </div>
                    <div>将 Excel 拖到此处，或<em>点击选择</em></div>
                    <div class="upload-sub">支持 .xlsx / .xls，单文件最大 10MB</div>
                  </div>
                </el-upload>
                <div v-if="file" class="file-badge">
                  {{ file.name }}（{{ (file.size / 1024).toFixed(1) }} KB）
                  <el-button link type="danger" size="small" @click="file = null">移除</el-button>
                </div>
              </div>
              <div class="btn-row">
                <el-button @click="step = 0">‹ 上一步</el-button>
                <el-button type="primary" :disabled="!file" :loading="loading" @click="onDryRun">试导入</el-button>
                <el-button type="success" :disabled="!file" :loading="loading" @click="onRealImport">正式导入</el-button>
              </div>
            </div>

            <!-- 导入结果 -->
            <div v-if="step === 2" class="step-block">
              <!-- 同步导入结果 -->
              <div v-if="result && !result.jobId" :class="'tip-card ' + (result.success ? 'tip-card--success' : 'tip-card--error')">
                <div class="tip-card__title">{{ result.success ? '导入完成' : '导入失败' }}</div>
                <div class="tip-card__body">
                  <pre class="result-pre">{{ formatResult(result) }}</pre>
                </div>
              </div>

              <!-- 异步任务进度 -->
              <div v-if="asyncJob" class="async-progress">
                <div class="tip-card" :class="asyncJobClass">
                  <div class="tip-card__title">
                    <span v-if="asyncJob.status === 'running'">正在导入…</span>
                    <span v-else-if="asyncJob.status === 'completed'">导入完成</span>
                    <span v-else-if="asyncJob.status === 'failed'">导入失败</span>
                    <span v-else-if="asyncJob.status === 'cancelled'">已取消</span>
                  </div>
                  <div class="tip-card__body">
                    <div class="progress-bar">
                      <div class="progress-bar__fill" :style="{ width: asyncJob.progress + '%' }"></div>
                    </div>
                    <div class="progress-stats">
                      <span>{{ asyncJob.processed }} / {{ asyncJob.total }} 行</span>
                      <span class="progress-pct">{{ asyncJob.progress }}%</span>
                    </div>
                    <div v-if="asyncJob.status === 'completed' || asyncJob.status === 'cancelled' || asyncJob.status === 'failed'" class="progress-summary">
                      <div class="summary-row">
                        <span class="summary-label">新增：</span>
                        <span class="summary-value text-success">{{ totalAdded }} 条</span>
                      </div>
                      <div class="summary-row" v-if="totalUpdated > 0">
                        <span class="summary-label">覆盖：</span>
                        <span class="summary-value text-warning">{{ totalUpdated }} 条</span>
                      </div>
                      <div class="summary-row" v-if="totalDeleted > 0">
                        <span class="summary-label">清空：</span>
                        <span class="summary-value text-danger">{{ totalDeleted }} 条</span>
                      </div>
                      <div class="summary-row">
                        <span class="summary-label">失败：</span>
                        <span class="summary-value text-danger">{{ asyncJob.failed }} 条</span>
                      </div>
                    </div>

                    <!-- 分 sheet 明细 -->
                    <div v-if="asyncJob.summary && Object.keys(asyncJob.summary).length" class="progress-detail">
                      <div class="detail-title">各 sheet 明细：</div>
                      <div v-for="(s, name) in asyncJob.summary" :key="name" class="detail-row">
                        <span class="detail-name">{{ name }}</span>
                        <span class="detail-tags">
                          <span v-if="s.added" class="detail-tag detail-tag--add">+{{ s.added }}</span>
                          <span v-if="s.updated" class="detail-tag detail-tag--upd">≈{{ s.updated }}</span>
                          <span v-if="s.deleted" class="detail-tag detail-tag--del">-{{ s.deleted }}</span>
                          <span v-if="s.skipped" class="detail-tag detail-tag--skip">⏭{{ s.skipped }}</span>
                          <span v-if="s.skipped === true" class="detail-tag detail-tag--warn">已跳过</span>
                        </span>
                      </div>
                    </div>
                    <div v-if="asyncJob.errors && asyncJob.errors.length" class="progress-errors">
                      <div class="errors-title">错误样例（前 5 条）：</div>
                      <ul>
                        <li v-for="(err, i) in asyncJob.errors.slice(0, 5)" :key="i">
                          {{ err.sheet ? '[' + err.sheet + '] ' : '' }}{{ err.msg }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <el-button @click="resetImport">‹ 重新导入</el-button>
              <el-button v-if="result && result.success" type="primary" @click="onExport">导出备份当前数据</el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 导出 -->
      <el-col :span="12">
        <el-card class="panel" shadow="never">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">📤 导出数据</span>
            </div>
          </template>

          <div class="export-info">
            <div class="tip-card tip-card--success">
              <div class="tip-card__title">📦 导出内容</div>
              <div class="tip-card__body">
                <p>导出数据库中所有核心数据为 Excel 文件，包含 8 个 Sheet：</p>
                <div class="sheet-list">
                  <div v-for="s in sheets" :key="s.name" class="sheet-item">
                    <span class="sheet-num">{{ s.num }}</span>
                    <span class="sheet-name">{{ s.name }}</span>
                  </div>
                </div>
                <p class="mt-10">建议<b>每周定期导出备份</b>，防止数据丢失。</p>
              </div>
            </div>
            <div class="export-stats">
              <div class="stat-mini">
                <span class="stat-mini__v">{{ exportStats.campuses }}</span>
                <span class="stat-mini__l">院区</span>
              </div>
              <div class="stat-mini">
                <span class="stat-mini__v">{{ exportStats.doctors }}</span>
                <span class="stat-mini__l">医生</span>
              </div>
              <div class="stat-mini">
                <span class="stat-mini__v">{{ exportStats.rooms }}</span>
                <span class="stat-mini__l">诊室</span>
              </div>
              <div class="stat-mini">
                <span class="stat-mini__v">{{ exportStats.schedules }}</span>
                <span class="stat-mini__l">排班</span>
              </div>
            </div>
            <el-button type="success" class="btn-block" :loading="exporting" @click="onExport">
              📤 导出全部数据（Excel）
            </el-button>
          </div>
        </el-card>
      </el-col>

    </el-row>

    <!-- #P1-13 排班上传错误明细 -->
    <el-dialog
      v-model="showScheduleErrors"
      title="排班上传错误/冲突明细"
      width="640px"
      :close-on-click-modal="false"
    >
      <div v-if="scheduleResult">
        <div v-if="scheduleResult.conflicts?.length" class="err-block">
          <div class="err-block__title">冲突 {{ scheduleResult.conflicts.length }} 条</div>
          <ul class="err-list">
            <li v-for="(c, i) in scheduleResult.conflicts.slice(0, 50)" :key="'c-' + i">
              <span class="err-row">第 {{ c.row }} 行</span> ·
              <span class="err-key">{{ c.key }}</span>
            </li>
          </ul>
          <div v-if="scheduleResult.conflicts.length > 50" class="err-more">…还有 {{ scheduleResult.conflicts.length - 50 }} 条未显示</div>
        </div>
        <div v-if="scheduleResult.errors?.length" class="err-block err-block--danger">
          <div class="err-block__title">错误 {{ scheduleResult.errors.length }} 条</div>
          <ul class="err-list">
            <li v-for="(e, i) in scheduleResult.errors.slice(0, 50)" :key="'e-' + i">
              <span class="err-row">第 {{ e.row }} 行</span> ·
              <span class="err-msg">{{ e.msg }}</span>
            </li>
          </ul>
          <div v-if="scheduleResult.errors.length > 50" class="err-more">…还有 {{ scheduleResult.errors.length - 50 }} 条未显示</div>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="showScheduleErrors = false">关闭</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, UploadFilled, Promotion } from '@element-plus/icons-vue'
import api, { apiDownload, apiUpload, saveBlob } from '@/api'
import AppIcon from '@/components/AppIcon.vue'

const step = ref(0)
const file = ref(null)
const loading = ref(false)
const exporting = ref(false)
const result = ref(null)
const asyncJob = ref(null)  // 异步任务对象

// #P1-13 重型版：排班快速上传状态
const scheduleFile = ref(null)
const scheduleUploading = ref(false)
const scheduleResult = ref(null)
const showScheduleErrors = ref(false)
let pollTimer = null

// 导入模式：'skip' 跳过已有（默认）/ 'overwrite' 覆盖 / 'replace' 完全替换
const importMode = ref('skip')

const sheets = [
  { num: '1', name: '院区', desc: '名称+代码' },
  { num: '2', name: '科室', desc: '名称+代码' },
  { num: '3', name: '门诊类型', desc: '名称+代码' },
  { num: '4', name: '诊区', desc: '院区+诊区' },
  { num: '5', name: '诊室', desc: '编号+归属' },
  { num: '6', name: '时段', desc: '时间+午别' },
  { num: '7', name: '医生', desc: '姓名+科室+职称' },
  { num: '8', name: '排班模板', desc: '周次+医生+诊室' },
]

const exportStats = ref({ campuses: 0, doctors: 0, rooms: 0, schedules: 0 })

// "完全替换"模式的级联警告
const replaceWarnings = computed(function () {
  if (importMode.value !== 'replace') return []
  const warnings = []
  // 后端 TABLE_POLICY 中标记了 cascadeWarn 的表
  warnings.push('医生表会级联删除关联排班')
  warnings.push('诊室/时段/诊区会级联删除关联排班')
  warnings.push('排班表不允许完全替换')
  return warnings
})

// 汇总：分类统计（新增/覆盖/清空）
const totalAdded = computed(function () {
  if (!asyncJob.value || !asyncJob.value.summary) return 0
  return Object.values(asyncJob.value.summary).reduce(function (s, x) {
    return s + (Number(x && x.added) || 0)
  }, 0)
})
const totalUpdated = computed(function () {
  if (!asyncJob.value || !asyncJob.value.summary) return 0
  return Object.values(asyncJob.value.summary).reduce(function (s, x) {
    return s + (Number(x && x.updated) || 0)
  }, 0)
})
const totalDeleted = computed(function () {
  if (!asyncJob.value || !asyncJob.value.summary) return 0
  return Object.values(asyncJob.value.summary).reduce(function (s, x) {
    return s + (Number(x && x.deleted) || 0)
  }, 0)
})

const asyncJobClass = computed(function () {
  if (!asyncJob.value) return ''
  if (asyncJob.value.status === 'completed') return 'tip-card--success'
  if (asyncJob.value.status === 'failed') return 'tip-card--error'
  if (asyncJob.value.status === 'cancelled') return 'tip-card--warn'
  return 'tip-card--info'
})

function formatResult(r) {
  if (r.success) {
    return `导入成功\n总记录数：${r.total || 0}\n成功：${r.inserted || 0} 条`
  }
  return r.error || JSON.stringify(r, null, 2)
}

async function loadExportStats() {
  const [meta, sched] = await Promise.all([
    api.get('/metadata').catch(() => null),
    api.get('/schedules').catch(() => null)
  ])
  if (meta?.success) {
    exportStats.value = {
      campuses: meta.campuses?.length || 0,
      doctors: meta.doctors?.length || 0,
      rooms: meta.rooms?.length || 0,
      schedules: sched?.data?.length || 0
    }
  }
}

function onFileChange(fileObj) {
  file.value = fileObj.raw
  result.value = null
  asyncJob.value = null
  step.value = 2
}

function resetImport() {
  stopPolling()
  file.value = null
  result.value = null
  asyncJob.value = null
  step.value = 1
}

async function onDownloadTemplate() {
  try {
    const blob = await apiDownload('/excel/template')
    saveBlob(blob, '排班数据导入模板.xlsx')
    ElMessage.success('模板下载成功')
  } catch (e) {
    ElMessage.error('模板下载失败：' + (e.message || '未知'))
  }
}

async function doImport(dryRun) {
  if (!file.value) return
  loading.value = true
  result.value = null
  asyncJob.value = null
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('dryRun', dryRun ? 'true' : 'false')
    fd.append('mode', importMode.value)
    const data = await apiUpload('/excel/import', fd)
    // 202 → 文件过大，server 提示用异步
    if (data && data._hint === 'use_async') {
      ElMessage.info('文件较大，已自动切换为异步导入')
      return startAsyncImport(dryRun)
    }
    result.value = data
    if (data.success) {
      const modeLabel = (data.strategy || importMode.value)
      ElMessage.success((dryRun ? '试导入' : '导入') + '完成（' + modeLabel + '）')
    } else {
      ElMessage.error(data.error || '导入失败')
    }
  } catch (e) {
    result.value = { success: false, error: e.message }
    ElMessage.error('导入失败：' + (e.message || '未知'))
  } finally {
    loading.value = false
  }
}

/**
 * 启动异步导入任务：上传 + 启动轮询
 */
async function startAsyncImport(dryRun) {
  loading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('dryRun', dryRun ? 'true' : 'false')
    fd.append('mode', importMode.value)
    const data = await apiUpload('/excel/import-async', fd)
    if (!data.success) {
      ElMessage.error(data.error || '启动导入任务失败')
      return
    }
    asyncJob.value = data
    startPolling(data.jobId)
  } catch (e) {
    ElMessage.error('启动异步导入失败：' + (e.message || '未知'))
  } finally {
    loading.value = false
  }
}

/**
 * 轮询任务进度
 */
function startPolling(jobId) {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const data = await api.get('/excel/jobs/' + jobId)
      if (!data.success) {
        stopPolling()
        ElMessage.error(data.error || '查询任务失败')
        return
      }
      asyncJob.value = data
      if (data.status === 'completed') {
        stopPolling()
        ElMessage.success('导入完成！共 ' + data.inserted + ' 条')
      } else if (data.status === 'failed') {
        stopPolling()
        ElMessage.error('导入失败，请查看详情')
      } else if (data.status === 'cancelled') {
        stopPolling()
        ElMessage.warning('已取消导入')
      }
    } catch (e) {
      console.error('poll failed', e)
    }
  }, 800)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const onDryRun = () => doImport(true)
const onRealImport = async () => {
  // #B23 "完全替换"模式：要求输入表名二次确认，防止误操作清空整表
  if (importMode.value === 'replace') {
    try {
      const { value } = await ElMessageBox.prompt(
        '完全替换将清空目标表所有数据!请输入表名（schedules / doctors / timeSlots / campuses）以确认:',
        '危险操作',
        {
          confirmButtonText: '确认替换',
          cancelButtonText: '取消',
          inputPattern: /^(schedules|doctors|timeSlots|campuses)$/,
          inputErrorMessage: '表名不正确'
        }
      )
      // 用户输入合法表名,继续执行导入
      ElMessage.warning('已确认替换表: ' + value)
      doImport(false)
    } catch (_) {
      // 用户取消
    }
    return
  }
  ElMessageBox.confirm('确认导入数据到数据库？', '提示', { type: 'warning' })
    .then(() => doImport(false))
    .catch(() => {})
}

async function onExport() {
  exporting.value = true
  try {
    const blob = await apiDownload('/excel/export')
    saveBlob(blob, '排班数据备份_' + new Date().toISOString().slice(0, 10) + '.xlsx')
    ElMessage.success('导出成功')
  } catch (e) {
    ElMessage.error('导出失败：' + (e.message || '未知'))
  } finally {
    exporting.value = false
  }
}

// ============ #P1-13 重型版：排班快速上传 ============

/**
 * 下载排班专用单 sheet 模板（推荐）
 * 后端 /api/excel/schedule-template 返回单 sheet「排班」+ 使用说明
 * 比 /excel/template 更轻量,字段专为排班
 */
async function onDownloadScheduleTemplate() {
  try {
    const blob = await apiDownload('/excel/schedule-template')
    saveBlob(blob, '排班模板.xlsx')
    ElMessage.success('排班模板下载成功')
  } catch (e) {
    ElMessage.error('排班模板下载失败：' + (e.message || '未知'))
  }
}

function onScheduleFileChange(file) {
  // el-upload 拿到的是 UploadFile 对象，真实文件在 .raw
  scheduleFile.value = file
  scheduleResult.value = null
}

async function onScheduleUpload() {
  if (!scheduleFile.value || !scheduleFile.value.raw) {
    return ElMessage.warning('请先选择文件')
  }
  if (scheduleFile.value.size > 5 * 1024 * 1024) {
    return ElMessage.error('单文件最大 5MB')
  }
  scheduleUploading.value = true
  scheduleResult.value = null
  try {
    const fd = new FormData()
    fd.append('file', scheduleFile.value.raw)
    const res = await apiUpload('/schedules/batch-upload', fd)
    scheduleResult.value = res
    if (res.success) {
      const c = (res.conflicts || []).length
      const e = (res.errors || []).length
      if (res.inserted > 0) {
        ElMessage.success(`已导入 ${res.inserted} 条${c ? `，${c} 条冲突` : ''}${e ? `，${e} 条错误` : ''}`)
      } else if (c > 0 || e > 0) {
        ElMessage.warning('导入未新增，请检查冲突/错误明细')
      } else {
        ElMessage.info('文件无数据')
      }
    } else {
      ElMessage.error(res.error || '导入失败')
    }
  } catch (e) {
    // api 拦截器已弹过错误提示，这里只记录结果让用户能展开
    scheduleResult.value = { success: false, error: e.message || '上传失败' }
  } finally {
    scheduleUploading.value = false
  }
}

onMounted(loadExportStats)
onUnmounted(stopPolling)
</script>

<style scoped>
/* #P1-13 排班快速上传样式 */
.quick-upload {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
}
.quick-upload__picker { display: inline-block; }
.quick-upload__file {
  width: 100%; font-size: 13px; color: var(--text-secondary);
  background: var(--color-primary-bg); padding: 6px 12px; border-radius: 6px;
  margin-top: 4px;
}
.quick-upload__result {
  width: 100%; font-size: 14px; font-weight: 600; padding: 10px 14px;
  border-radius: 8px; margin-top: 4px;
}
.quick-upload__result.is-success { background: #ecfdf5; color: #047857; }
.quick-upload__result.is-error   { background: #fef2f2; color: #b91c1c; }

.err-block { padding: 12px 16px; background: #fffbeb; border-radius: 8px; margin-bottom: 12px; }
.err-block--danger { background: #fef2f2; }
.err-block__title { font-weight: 700; color: #92400e; margin-bottom: 8px; }
.err-block--danger .err-block__title { color: #b91c1c; }
.err-list { margin: 0; padding-left: 20px; max-height: 320px; overflow-y: auto; }
.err-list li { padding: 3px 0; font-size: 13px; color: var(--text-secondary); }
.err-row { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.err-key { color: #92400e; font-family: var(--font-mono); }
.err-msg { color: #b91c1c; }
.err-more { margin-top: 8px; font-size: 12px; color: var(--text-muted); text-align: center; }
</style>
<style scoped>
/* 模式选择器 */
.mode-selector {
  background: var(--color-primary-bg);
  border: 1px solid rgba(3, 105, 161, 0.15);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin: 12px 0;
}
.mode-selector__title {
  font-size: 13px; font-weight: 700; color: var(--color-primary-dark);
  margin-bottom: 10px;
}
.mode-selector__group {
  display: flex; gap: 8px; width: 100%;
}
.mode-selector__group :deep(.el-radio-button) { flex: 1; }
.mode-selector__group :deep(.el-radio-button__inner) {
  width: 100%; padding: 8px 4px; border-radius: var(--radius-sm) !important;
  background: #fff; border-color: var(--border-light);
}
.mode-selector__group :deep(.el-radio-button__inner:hover) {
  border-color: var(--color-primary-light);
  color: var(--color-primary);
}
.mode-selector__group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: var(--color-primary); border-color: var(--color-primary);
  color: #fff; box-shadow: 0 2px 8px rgba(3, 105, 161, 0.3);
}
.mode-option { display: flex; flex-direction: column; align-items: center; line-height: 1.4; }
.mode-option__name { font-weight: 700; font-size: 12.5px; }
.mode-option__desc { font-size: 10.5px; opacity: 0.75; margin-top: 2px; }
.mode-warn {
  margin-top: 12px; padding: 10px 14px;
  background: #fff7e6; border: 1px solid #ffd591;
  border-radius: var(--radius-sm);
  font-size: 12.5px; color: #ad4e00; line-height: 1.7;
}
.mode-warn b { color: #d4380d; }

/* 异步进度详情 */
.progress-detail {
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.detail-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
.detail-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; padding: 4px 0;
  border-bottom: 1px dashed var(--border-light);
}
.detail-row:last-child { border-bottom: none; }
.detail-name { color: var(--text-primary); font-weight: 500; }
.detail-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.detail-tag {
  display: inline-block; padding: 1px 8px; border-radius: var(--radius-full);
  font-size: 11px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.detail-tag--add { background: #d1fae5; color: #065f46; }
.detail-tag--upd { background: #fef3c7; color: #92400e; }
.detail-tag--del { background: #fee2e2; color: #991b1b; }
.detail-tag--skip { background: var(--bg-muted); color: var(--text-secondary); }
.detail-tag--warn { background: #fff7e6; color: #ad4e00; }

.ie-page { max-width: 1200px; }

.panel {
  border-radius: 16px;
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.panel-header { padding: 0; }
.panel-title { font-size: 16px; font-weight: 700; color: #1a1a1a; }

.steps { margin: 0 0 28px; }
.step-content {}
.step-block { display: flex; flex-direction: column; gap: 16px; }

/* 提示卡 */
.tip-card {
  border-radius: 10px; padding: 16px 20px;
  border-left: 4px solid;
}
.tip-card--info { background: #f0f9ff; border-color: #1890ff; }
.tip-card--warn { background: #fffbe6; border-color: #faad14; }
.tip-card--success { background: #f6ffed; border-color: #52c41a; }
.tip-card--error { background: #fff2f0; border-color: #ff4d4f; }
.tip-card__title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
.tip-card__body { font-size: 13px; color: #555; line-height: 1.8; }
.tip-card__body p { margin: 0 0 4px; }

/* Sheet列表 */
.sheet-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.sheet-item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.sheet-num { background: #2e7d32; color: #fff; border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 700; }
.sheet-name { font-weight: 600; color: #333; min-width: 70px; }
.sheet-count { color: #888; font-size: 12px; }

/* 上传 */
.upload-zone { }
.upload-hint {
  padding: 32px; text-align: center; color: #888;
  font-size: 14px; cursor: pointer;
}
.upload-icon { font-size: 40px; margin-bottom: 8px; }
.upload-hint em { color: #2e7d32; font-style: normal; }
.upload-sub { font-size: 12px; margin-top: 4px; color: #aaa; }
.file-badge {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: #f0f5f1; border-radius: 6px; font-size: 13px;
}
.btn-block { width: 100%; margin-top: 8px; }
.btn-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
.btn-next { width: 100%; margin-top: 8px; color: #2e7d32; }

/* 导出 */
.export-info { display: flex; flex-direction: column; gap: 16px; }
.export-stats { display: flex; gap: 16px; }
.stat-mini {
  flex: 1; background: #f6ffed; border-radius: 8px;
  padding: 12px; text-align: center; border: 1px solid #b7eb8f;
}
.stat-mini__v { display: block; font-size: 22px; font-weight: 800; color: #2e7d32; }
.stat-mini__l { font-size: 11px; color: #888; }

.mt-10 { margin-top: 10px; }
.result-pre { font-size: 12px; background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow: auto; max-height: 300px; margin: 0; }

/* 异步进度 */
.async-progress { margin-bottom: 12px; }
.progress-bar {
  width: 100%; height: 10px; background: var(--bg-muted);
  border-radius: var(--radius-full); overflow: hidden; margin: 12px 0 6px;
}
.progress-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, #0ea5e9 0%, #0369a1 100%);
  border-radius: var(--radius-full);
  transition: width 0.4s var(--ease-out);
  box-shadow: 0 0 8px rgba(14, 165, 233, 0.4);
}
.progress-stats {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;
}
.progress-pct {
  font-weight: 700; color: var(--color-primary); font-variant-numeric: tabular-nums;
}
.progress-summary {
  display: flex; gap: 24px; margin: 8px 0;
  padding: 8px 12px; background: rgba(255,255,255,0.6);
  border-radius: var(--radius-sm);
}
.summary-row { font-size: 13px; }
.summary-label { color: var(--text-muted); }
.summary-value { font-weight: 700; font-variant-numeric: tabular-nums; }
.text-success { color: var(--color-success); }
.text-danger { color: var(--color-danger); }
.progress-errors { margin-top: 8px; }
.errors-title { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.progress-errors ul { margin: 0; padding-left: 18px; font-size: 12px; color: var(--text-secondary); }
.progress-errors li { line-height: 1.7; }
</style>
