<template>
  <div>
    <el-card>
      <el-form :inline="true" :model="filter" class="filter-bar">
        <el-form-item label="院区">
          <el-select v-model="filter.campus_code" placeholder="全部" clearable @change="onFilterChange" style="width: 160px">
            <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="诊区">
          <el-select v-model="filter.zone_code" placeholder="全部" clearable @change="onFilterChange" style="width: 160px">
            <el-option v-for="z in filteredZones" :key="z.code" :label="z.name" :value="z.code" />
          </el-select>
        </el-form-item>
      </el-form>

      <generic-crud
        ref="crudRef"
        endpoint="/rooms"
        :columns="columns"
        :form-fields="formFields"
        :fixed-query="filter"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import GenericCrud from '@/components/GenericCrud.vue'
import api from '@/api'

const crudRef = ref()
const campuses = ref([])
const zones = ref([])
const filter = ref({ campus_code: '', zone_code: '' })

const filteredZones = computed(() => {
  if (!filter.value.campus_code) return zones.value
  return zones.value.filter(z => z.campus_code === filter.value.campus_code)
})

const columns = [
  { prop: 'id', label: 'ID', minWidth: 60 },
  { prop: 'room_id', label: '诊室编号', minWidth: 100 },
  { prop: 'room_name', label: '诊室名称', minWidth: 120 },
  { prop: 'campus_name', label: '院区', minWidth: 100 },
  { prop: 'zone_name', label: '诊区', minWidth: 100 },
  { prop: 'department', label: '归属科室', minWidth: 120 }
]

const formFields = [
  { prop: 'room_id', label: '诊室编号', required: true },
  { prop: 'room_name', label: '诊室名称', required: true },
  { prop: 'campus_code', label: '院区代码', required: true, type: 'select', options: campusOptions },
  { prop: 'campus_name', label: '院区名称', required: true },
  { prop: 'zone_code', label: '诊区代码', required: true, type: 'select', options: zoneOptions },
  { prop: 'zone_name', label: '诊区名称', required: true },
  { prop: 'department', label: '归属科室' }
]

const campusOptions = ref([])
const zoneOptions = ref([])
onMounted(async () => {
  const [c, z] = await Promise.all([
    api.get('/campuses'),
    api.get('/zones')
  ])
  if (c.success) {
    campuses.value = c.data
    campusOptions.value = c.data.map(x => ({ label: x.name, value: x.code }))
  }
  if (z.success) zones.value = z.data
})

function updateZoneOptions() {
  zoneOptions.value = filteredZones.value.map(z => ({ label: z.name, value: z.code }))
}

import { watch } from 'vue'
watch(filteredZones, updateZoneOptions, { immediate: true })

function onFilterChange() {
  crudRef.value?.loadList()
}
</script>

<style scoped>
.filter-bar { margin-bottom: 16px; }
</style>
