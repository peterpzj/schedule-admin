/**
 * 诊室表单 schema（演示 FieldRenderer + GenericCrud 的全部能力）
 *
 * 在 view 中这样使用：
 *   import { roomFormFields, roomColumns } from '@/schemas/exampleRooms'
 *   <generic-crud endpoint="/rooms" entity-name="诊室" :columns="roomColumns" :form-fields="roomFormFields" />
 */
import api from '@/api'

// 静态 options：直接写在 schema 里
const STATUS_OPTIONS = [
  { label: '空闲', value: '空闲' },
  { label: '占用', value: '占用' },
  { label: '维修', value: '维修' }
]

// 动态 options：首次渲染时 fetch
async function loadCampuses() {
  const r = await api.get('/campuses')
  return r.success ? r.data : []
}

async function loadZones(campusCode) {
  const r = await api.get('/zones', { campusCode: campusCode })
  return r.success ? r.data : []
}

export const roomColumns = [
  { prop: 'id', label: 'ID', minWidth: 60, sortable: true },
  { prop: 'roomId', label: '诊室编号', minWidth: 100 },
  { prop: 'roomName', label: '诊室名称', minWidth: 120 },
  { prop: 'campusName', label: '院区', minWidth: 100 },
  { prop: 'zoneName', label: '诊区', minWidth: 100 },
  { prop: 'department', label: '所属科室', minWidth: 120 },
  { prop: 'capacity', label: '容量', width: 80, align: 'right' },
  {
    prop: 'status',
    label: '状态',
    width: 80,
    align: 'center',
    formatter: function (row) { return row.status || '空闲' },
    tag: function (row) {
      const s = row.status || '空闲'
      if (s === '占用') return 'danger'
      if (s === '维修') return 'warning'
      return 'success'
    }
  }
]

export const roomFormFields = [
  {
    prop: 'roomId',
    label: '诊室编号',
    type: 'text',
    required: true,
    placeholder: '如 R001',
    maxLength: 16
  },
  {
    prop: 'roomName',
    label: '诊室名称',
    type: 'text',
    required: true,
    placeholder: '如 301诊室'
  },
  {
    prop: 'campusCode',
    label: '院区',
    type: 'select',
    required: true,
    optionsUrl: '/campuses',
    valueKey: 'code',
    labelKey: 'name',
    hint: '院区决定可选的诊区'
  },
  {
    prop: 'zoneCode',
    label: '诊区',
    type: 'select',
    required: true,
    optionsUrl: '/zones',
    // 简化：未实现联动；实际项目可监听 campusCode 变化重新 fetch
    hint: '请先选择院区'
  },
  {
    prop: 'department',
    label: '所属科室',
    type: 'select',
    required: true,
    optionsUrl: '/departments',
    valueKey: 'name',
    labelKey: 'name'
  },
  {
    prop: 'capacity',
    label: '容量',
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 1
  },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    required: true,
    options: STATUS_OPTIONS,
    defaultValue: '空闲'
  },
  {
    prop: 'openTime',
    label: '开放时间',
    type: 'daterange',
    valueFormat: 'YYYY-MM-DD',
    hint: '可选：仅在某段时间内开放'
  },
  {
    prop: 'note',
    label: '备注',
    type: 'textarea',
    rows: 3,
    required: false,
    maxLength: 500
  }
]

export const _internal = { loadCampuses: loadCampuses, loadZones: loadZones }
