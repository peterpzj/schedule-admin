/**
 * 字段脚本注册表（#28）
 *
 * 通过 key 引用（field.script = 'xxx'），不在 schema 里直接写代码：
 *   - 避免 XSS / RCE（永远 eval 用户输入）
 *   - 集中管理，审计 / 复用方便
 *   - IDE 友好（vscode 不会标记 JS 字符串为"未知"）
 *
 * 一个脚本可挂多个钩子：
 *   - onMount   组件挂载时
 *   - validate  字段值校验：返回 { ok: false, message: '...' } 表示失败
 *   - transform 值变换：返回新值（一般用于提交前的 trim/normalize）
 *   - onChange  值变化时
 *
 * 编写时优先用现有 EL 组件能力 + formData 依赖；只有需要动态逻辑时才写脚本。
 */
export const fieldScripts = {
  /**
   * 示例：限号字段，>50 时要求备注必填
   */
  patientLimitField: {
    validate: async ({ value, formData }) => {
      const lim = Number(formData && formData.patientLimit)
      if (lim > 50 && !value) {
        return { ok: false, message: '限号超过 50 时必须填写备注' }
      }
      return { ok: true }
    }
  },

  /**
   * 示例：周次变化时清空时段下拉（联动）
   */
  clearSlotOnDayChange: {
    onChange: async ({ value, formData }) => {
      if (formData && formData.timeSlotCode) formData.timeSlotCode = ''
      return { ok: true }
    }
  },

  /**
   * 示例：手机号格式化（提交前）
   */
  phoneFormatter: {
    transform: ({ value }) => {
      if (!value) return value
      const s = String(value).replace(/\D/g, '')
      return s.length === 11 ? s : value
    }
  }
}