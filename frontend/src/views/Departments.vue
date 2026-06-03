<template>
  <generic-crud
    endpoint="/departments"
    :columns="columns"
    :form-fields="formFields"
  />
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

const columns = [
  { prop: 'id', label: 'ID', minWidth: 60 },
  { prop: 'name', label: '科室名称', sortable: true },
  { prop: 'code', label: '科室代码', minWidth: 120 }
]

const formFields = [
  { prop: 'name', label: '科室名称', required: true },
  { prop: 'code', label: '科室代码', required: true }
]
</script>
