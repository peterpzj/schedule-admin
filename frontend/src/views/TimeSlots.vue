<template>
  <div>
    <el-card>
      <el-form :inline="true" :model="filter" class="filter-bar">
        <el-form-item label="院区">
          <el-select v-model="filter.campus_code" placeholder="全部" clearable @change="onFilter" style="width: 160px">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
      </el-form>
      <generic-crud
        ref="crudRef"
        endpoint="/timeSlots"
        :columns="columns"
        :form-fields="formFields"
        :fixed-query="filter"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import GenericCrud from '@/components/GenericCrud.vue'
import api from '@/api'

const crudRef = ref()
const campuses = ref([])
const filter = ref({ campus_code: '' })

const columns = [
  { prop: 'id', label: 'ID', minWidth: 60 },
  { prop: 'name', label: '时段名', minWidth: 120 },
  { prop: 'code', label: '代码', minWidth: 120 },
  { prop: 'campus_name', label: '院区', minWidth: 100 },
  { prop: 'clinic_type_name', label: '门诊类型', minWidth: 120 },
  { prop: 'period', label: '午别', minWidth: 80 },
  { prop: 'start_time', label: '开始', minWidth: 80 },
  { prop: 'end_time', label: '结束', minWidth: 80 },
  { prop: 'sort_order', label: '排序', minWidth: 60 }
]

const formFields = [
  { prop: 'name', label: '时段名', required: true },
  { prop: 'code', label: '代码', required: true },
  { prop: 'campus_code', label: '院区代码', required: true, type: 'select', options: campusOptions },
  { prop: 'campus_name', label: '院区名称', required: true },
  { prop: 'clinic_type_code', label: '门诊类型代码', required: true, type: 'select', options: clinicTypeOptions },
  { prop: 'clinic_type_name', label: '门诊类型名称', required: true },
  { prop: 'period', label: '午别', required: true, type: 'select', options: [{ label: '上午', value: '上午' }, { label: '中午', value: '中午' }, { label: '下午', value: '下午' }, { label: '晚上', value: '晚上' }] },
  { prop: 'start_time', label: '开始时间', required: true },
  { prop: 'end_time', label: '结束时间', required: true },
  { prop: 'sort_order', label: '排序', type: 'number' }
]

const campusOptions = ref([])
const clinicTypeOptions = ref([])
onMounted(async () => {
  const [c, ct] = await Promise.all([
    api.get('/campuses'),
    api.get('/clinicTypes')
  ])
  if (c.success) {
    campuses.value = c.data
    campusOptions.value = c.data.map(x => ({ label: x.name, value: x.code }))
  }
  if (ct.success) {
    clinicTypeOptions.value = ct.data.map(x => ({ label: x.name, value: x.code }))
  }
})

function onFilter() {
  crudRef.value?.loadList()
}
</script>
