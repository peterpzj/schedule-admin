/**
 * 字段脚本运行时（#28）
 *
 * 解决"产品/运营想让某个字段在特定场景下做特殊校验/联动，
 * 但前端不愿意每次都改代码发版"的需求。
 *
 * 用法（schema 里）：
 *   {
 *     key: 'remark',
 *     label: '备注',
 *     type: 'text',
 *     script: 'patientLimitField'  // 注册到 fields/_scripts.js 里的脚本 key
 *   }
 *
 * 脚本定义（fields/_scripts.js）：
 *   export const fieldScripts = {
 *     patientLimitField: {
 *       onMount:  ({ field, formData }) => { ... },
 *       validate: async ({ value, formData }) => {
 *         if (formData.patientLimit > 50 && !value) return { ok: false, message: '限号超过 50 时必须填写备注' }
 *         return { ok: true }
 *       },
 *       transform: ({ value }) => value ? value.trim() : value,
 *     }
 *   }
 *
 * 字段组件（fields/_registry.js）：
 *   复杂场景下用 type: 'custom' + component: 'MyComp' 时，
 *   组件名 → Vue 组件对象的映射在这里注册。
 *
 * 安全：
 *  - 脚本是**白名单**而不是 eval：只允许从 fieldScripts 字典里取
 *  - 不存在直接执行用户输入代码的入口，避免 XSS/RCE
 */

import { fieldScripts } from './_scripts'

/**
 * 字段脚本同步执行 / 异步执行入口
 * @param {Object} field  字段 schema（包含 script key）
 * @param {String} hook   钩子名：onMount / validate / transform / onChange
 * @param {Object} ctx    上下文（{ field, formData, value }）
 * @returns {Promise<any>}
 */
export async function runFieldScript(field, hook, ctx) {
  if (!field || !field.script) return undefined
  const bucket = fieldScripts[field.script]
  if (!bucket || typeof bucket[hook] !== 'function') return undefined
  try {
    return await bucket[hook](ctx || {})
  } catch (err) {
    // 字段脚本抛错不应阻塞表单
    // eslint-disable-next-line no-console
    console.warn(`[fieldScript:${field.script}:${hook}] error:`, err)
    return undefined
  }
}

/**
 * 批量同步运行所有字段脚本（用于提交前的统一校验）
 * @param {Array} fields 字段 schema 数组
 * @param {String} hook  钩子名
 * @param {Object} ctx   上下文
 */
export async function runAllFieldScripts(fields, hook, ctx) {
  const out = []
  for (const f of fields || []) {
    const r = await runFieldScript(f, hook, ctx)
    if (r !== undefined) out.push({ key: f.key, result: r })
  }
  return out
}