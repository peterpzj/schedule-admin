<template>
  <generic-crud
    endpoint="/clinicTypes"
    :columns="columns"
    :form-fields="formFields"
  />
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

const columns = [
  { prop: 'id', label: 'ID', minWidth: 60 },
  { prop: 'name', label: '门诊类型', sortable: true },
  { prop: 'code', label: '类型代码', minWidth: 120 },
  { prop: 'sort_order', label: '排序', minWidth: 80 }
]

const formFields = [
  { prop: 'name', label: '门诊类型', required: true },
  { prop: 'code', label: '类型代码', required: true },
  { prop: 'sort_order', label: '排序', type: 'number' }
]
</script>
