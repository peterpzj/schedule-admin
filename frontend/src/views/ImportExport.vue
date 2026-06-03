<template>
  <div class="import-export">
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card header="导入 Excel">
          <el-alert
            title="导入说明"
            type="info"
            :closable="false"
            show-icon
          >
            <p>1. 点击「下载模板」获取标准 Excel 模板</p>
            <p>2. 按模板格式填写数据（每行一条记录）</p>
            <p>3. 选择文件上传，先「试导入」预览结果</p>
            <p>4. 确认无误后再「正式导入」写入数据库</p>
            <p>5. sheet 名固定为「1-院区」「2-科室」...「8-排班」</p>
          </el-alert>

          <el-button type="primary" :icon="Download" @click="onDownloadTemplate" class="mt-20">下载模板</el-button>

          <el-upload
            class="mt-20"
            drag
            :auto-upload="false"
            :limit="1"
            :on-change="onFileChange"
            :show-file-list="false"
            accept=".xlsx,.xls,.csv"
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
            <template #tip>
              <div class="el-upload__tip">支持 .xlsx / .xls / .csv，单文件最大 10MB</div>
            </template>
          </el-upload>

          <div v-if="file" class="file-info">
            <el-icon><Document /></el-icon>
            <span>{{ file.name }}（{{ (file.size / 1024).toFixed(1) }} KB）</span>
            <el-button text @click="file = null">移除</el-button>
          </div>

          <div class="action-row">
            <el-button :disabled="!file" :loading="loading" @click="onDryRun">试导入</el-button>
            <el-button type="primary" :disabled="!file" :loading="loading" @click="onRealImport">正式导入</el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card header="导出 Excel">
          <el-alert
            title="导出说明"
            type="success"
            :closable="false"
            show-icon
          >
            <p>导出当前数据库中所有基础数据和排班（8 个 sheet）</p>
            <p>建议每周备份一次，避免数据丢失</p>
          </el-alert>
          <el-button type="success" :icon="Download" @click="onExport" class="mt-20">导出全部数据</el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-card header="导入结果" class="mt-20" v-if="importResult">
      <pre class="result-pre">{{ JSON.stringify(importResult, null, 2) }}</pre>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, UploadFilled, Document } from '@element-plus/icons-vue'
import api from '@/api'

const file = ref(null)
const loading = ref(false)
const importResult = ref(null)

function onFileChange(fileObj) {
  file.value = fileObj.raw
  importResult.value = null
}

async function onDownloadTemplate() {
  const res = await api.get('/excel/template', {}, { responseType: 'blob' }).catch(() => null)
  if (!res) {
    ElMessage.error('下载失败')
    return
  }
  downloadBlob(res, 'schedule_template.xlsx')
}

async function onExport() {
  const res = await api.get('/excel/export', {}, { responseType: 'blob' }).catch(() => null)
  if (!res) {
    ElMessage.error('导出失败')
    return
  }
  const filename = res.headers?.['content-disposition']?.match(/filename="?([^"]+)"?/)?.[1]
    || '排班数据备份.xlsx'
  downloadBlob(res, decodeURIComponent(filename))
}

async function onDryRun() {
  if (!file.value) return
  await doImport(true)
}

async function onRealImport() {
  if (!file.value) return
  await ElMessageBox.confirm('确认要导入这些数据到数据库？', '提示', { type: 'warning' })
  await doImport(false)
}

async function doImport(dryRun) {
  loading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('dryRun', dryRun ? 'true' : 'false')
    const res = await api.post('/excel/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    if (res.success) {
      importResult.value = res
      ElMessage.success(dryRun ? '试导入完成，请检查下方结果' : '导入成功')
    }
  } finally {
    loading.value = false
  }
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(new Blob([blob]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
}
import { ElMessageBox } from 'element-plus'
</script>

<style scoped>
.import-export { max-width: 1200px; }
.mt-20 { margin-top: 20px; }
.action-row { display: flex; gap: 12px; margin-top: 16px; }
.file-info { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 8px 12px; background: #f0f5f1; border-radius: 6px; }
.result-pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; max-height: 400px; overflow: auto; font-size: 12px; }
</style>
