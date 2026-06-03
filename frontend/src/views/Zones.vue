<template>
  <div>
    <el-card>
      <generic-crud
        endpoint="/zones"
        :columns="columns"
        :form-fields="formFields"
        :fixed-query="fixedQuery"
        @loaded="onLoaded"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import GenericCrud from '@/components/GenericCrud.vue'
import api from '@/api'

const campusList = ref([])
const fixedQuery = ref({})

const columns = [
  { prop: 'id', label: 'ID', minWidth: 60 },
  { prop: 'name', label: '诊区名', sortable: true },
  { prop: 'code', label: '诊区代码', minWidth: 100 },
  { prop: 'campus_name', label: '所属院区', minWidth: 120 },
  { prop: 'campus_code', label: '院区代码', minWidth: 100 },
  { prop: 'sort_order', label: '排序', minWidth: 80 }
]

const formFields = [
  { prop: 'name', label: '诊区名', required: true },
  { prop: 'code', label: '诊区代码', required: true },
  { prop: 'campus_code', label: '院区代码', required: true, type: 'select', options: campusOptions },
  { prop: 'campus_name', label: '院区名称', required: true },
  { prop: 'sort_order', label: '排序', type: 'number' }
]

const campusOptions = ref([])
onMounted(async () => {
  const res = await api.get('/campuses')
  if (res.success) {
    campusList.value = res.data
    campusOptions.value = res.data.map(c => ({ label: c.name, value: c.code }))
  }
})
</script>
