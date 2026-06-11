# GenericCrud + FieldRenderer Schema 指南

> 适用于 schedule-admin 前端

## 概览

- `components/GenericCrud.vue` - 列表 + 增删改查的通用容器
- `components/FieldRenderer.vue` - 表单项渲染器，支持 12 种类型
- `schemas/*.js` - 把列定义 + 表单定义集中到一个文件，view 只引用

## 12 种字段类型

| type | 控件 | 适用 |
|------|------|------|
| `text`（默认） | el-input | 短文本 |
| `password` | el-input type=password | 密码 |
| `number` | el-input-number | 数字（带 min/max/step） |
| `textarea` | el-input type=textarea | 长文本 |
| `select` | el-select | 单选下拉 |
| `multiselect` | el-select multiple | 多选下拉 |
| `cascader` | el-cascader | 级联选择 |
| `date` | el-date-picker type=date | 日期 |
| `datetime` | el-date-picker type=datetime | 日期+时间 |
| `daterange` | el-date-picker type=daterange | 日期范围 |
| `switch` | el-switch | 布尔开关 |
| `autocomplete` | el-autocomplete | 联想输入 |
| `static` | span | 只读展示 |

## 字段属性

```js
{
  prop: 'fieldName',         // 必填，字段名
  label: '显示名',            // 必填
  type: 'select',            // 可选，默认 text
  required: true,            // 默认 true；false 则不加 * 也不强制必填
  placeholder: '提示文案',
  defaultValue: 1,           // 新增时自动填
  disabled: false,           // 全局禁用
  readOnly: true,            // 同 disabled
  hidden: false,             // 整个字段不渲染
  hint: '字段下方灰色提示',
  rules: [{ ... }]           // 额外的 Element Plus 校验规则
}
```

### 各类型专属属性

```js
// number
{ type: 'number', min: 0, max: 100, step: 1, precision: 2 }

// select / multiselect
{
  type: 'select',
  options: [{label, value}],       // 静态
  // 或
  optionsUrl: '/api/campuses',     // 动态
  valueKey: 'code',               // 默认 'value'
  labelKey: 'name',               // 默认 'label'
  filterable: true,               // 默认 true，可搜索
  clearable: true                 // 默认 true
}

// cascader
{
  type: 'cascader',
  options: [...],                 // 静态或异步
  cascaderProps: { checkStrictly: true }
}

// date / datetime / daterange
{
  type: 'date',
  valueFormat: 'YYYY-MM-DD'       // 默认 'YYYY-MM-DD'
}

// switch
{
  type: 'switch',
  activeValue: 1,                 // 默认 true
  inactiveValue: 0,               // 默认 false
  activeText: '启用',
  inactiveText: '禁用'
}

// autocomplete
{
  type: 'autocomplete',
  suggestions: function(query, cb) { cb([...]); }
}
```

## 快速上手

### 1) 最简配置

```vue
<!-- views/Articles.vue -->
<template>
  <generic-crud
    endpoint="/articles"
    entity-name="文章"
    :columns="columns"
    :form-fields="formFields"
  />
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

const columns = [
  { prop: 'id', label: 'ID', width: 60 },
  { prop: 'title', label: '标题', minWidth: 200 },
  { prop: 'author', label: '作者' }
]

const formFields = [
  { prop: 'title', label: '标题', required: true },
  { prop: 'author', label: '作者', required: true }
]
</script>
```

### 2) 用 schema 文件（推荐）

```js
// schemas/articles.js
export const articleColumns = [...]
export const articleFormFields = [
  {
    prop: 'title', label: '标题', type: 'text', required: true,
    rules: [{ min: 5, max: 100, message: '5-100 字' }]
  },
  {
    prop: 'category', label: '分类', type: 'select', required: true,
    optionsUrl: '/categories', valueKey: 'id', labelKey: 'name'
  },
  {
    prop: 'tags', label: '标签', type: 'multiselect',
    optionsUrl: '/tags'
  },
  {
    prop: 'publishAt', label: '发布时间', type: 'datetime',
    defaultValue: null
  },
  {
    prop: 'isTop', label: '置顶', type: 'switch', defaultValue: false
  }
]
```

```vue
<!-- views/Articles.vue -->
<script setup>
import GenericCrud from '@/components/GenericCrud.vue'
import { articleColumns, articleFormFields } from '@/schemas/articles'
</script>

<template>
  <generic-crud
    endpoint="/articles"
    entity-name="文章"
    :columns="articleColumns"
    :form-fields="articleFormFields"
  />
</template>
```

## 完整示例

参见 `src/schemas/exampleRooms.js`，包含 select / multiselect / date / switch / textarea 等。

## 高级用法

### 动态隐藏字段

```js
formFields = [
  { prop: 'name', label: '名称' },
  { prop: 'campus', label: '院区', type: 'select' },
  { prop: 'zone', label: '诊区', type: 'select' /* hidden: true 动态控制 */ }
]
```

`hidden: true` 让字段在表单中不渲染，但保留在 schema 里方便其他逻辑用。

### 联动选项

`optionsUrl` 支持依赖其他字段的值。在 `schemas/exampleRooms.js` 里有简化版示例（commented TODO）。生产可监听 `editing[field.prop]` 变化重新 fetch。

### 自定义规则

```js
{
  prop: 'email',
  label: '邮箱',
  type: 'text',
  rules: [
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ]
}
```

### 列上格式化

```js
columns = [
  {
    prop: 'status',
    label: '状态',
    formatter: function (row) { return STATUS_MAP[row.status] || '未知' },
    tag: function (row) {  // 可选：彩色标签
      return row.status === 'active' ? 'success' : 'danger'
    }
  }
]
```

## 与 P0/P1 其他改进的协同

- 后端的 `/api/metadata` 可作为统一的 options 端点（一次 fetch 拿全部元数据）
- 数据库迁移（4.1）保证 schema 与后端字段同步
- 结构化日志（4.2）会记录每次 CRUD 的 audit，便于排查

## 后续可扩展点（P2 候选）

- [ ] 联动 optionsUrl：监听依赖字段自动 refetch
- [ ] 字段权限（readonly/hidden 按 role 控制）
- [ ] 行内编辑（不弹窗，直接改单元格）
- [ ] 批量删除
- [ ] 导出当前过滤结果
