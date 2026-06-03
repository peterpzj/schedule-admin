<template>
  <generic-crud
    endpoint="/doctors"
    :columns="columns"
    :form-fields="formFields"
  />
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

const columns = [
  { prop: 'id', label: 'ID', minWidth: 60 },
  { prop: 'name', label: '姓名', sortable: true },
  { prop: 'work_id', label: '工号', minWidth: 100 },
  { prop: 'department', label: '科室', minWidth: 120, sortable: true },
  { prop: 'title', label: '职称', minWidth: 100 },
  { prop: 'other_title', label: '其他职称', minWidth: 120 },
  { prop: 'primary_campus', label: '主院区', minWidth: 100 }
]

const formFields = [
  { prop: 'name', label: '姓名', required: true },
  { prop: 'work_id', label: '工号', required: true },
  { prop: 'department', label: '科室', required: true },
  { prop: 'title', label: '职称' },
  { prop: 'other_title', label: '其他职称' },
  { prop: 'primary_campus', label: '主院区代码' }
]
</script>
