<template>
  <generic-crud
    endpoint="/campuses"
    :columns="columns"
    :form-fields="formFields"
  />
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

const columns = [
  { prop: 'id', label: 'ID', minWidth: 60, sortable: true },
  { prop: 'name', label: '院区名称', sortable: true },
  { prop: 'code', label: '院区代码', minWidth: 100 },
  { prop: 'sort_order', label: '排序', minWidth: 80 }
]

const formFields = [
  { prop: 'name', label: '院区名称', required: true },
  { prop: 'code', label: '院区代码', required: true },
  { prop: 'sort_order', label: '排序', type: 'number' }
]
</script>
