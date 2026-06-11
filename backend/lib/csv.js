/**
 * CSV 工具
 * - escapeCsv(v): 防引号 / 换行 / 公式注入
 *
 * 公式注入防护（CWE-1236）：
 *   Excel / LibreOffice 在打开 CSV 时，会把以 = + - @ 开头的单元格
 *   当成公式执行。攻击者可注入 =cmd|... 或 =HYPERLINK(...) 偷数据。
 *   防护做法：值若以这 4 个字符之一开头，前面加单引号 ' 强制当文本。
 */

/**
 * 转义单个 CSV 字段（含公式注入防护）
 * @param {*} v
 * @returns {string}
 */
function escapeCsv(v) {
  if (v == null) return '';
  let s = String(v);
  // 公式注入防护：把 = + - @ 开头的值前置单引号
  if (s.length > 0 && '=+-@'.indexOf(s[0]) !== -1) {
    s = "'" + s;
  }
  // 已有双引号需要重复
  s = s.replace(/"/g, '""');
  return '"' + s + '"';
}

module.exports = { escapeCsv };
