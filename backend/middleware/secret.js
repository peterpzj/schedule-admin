/**
 * JWT_SECRET 校验 + 多密钥解析（支持平滑轮换）
 *
 * 轮换流程：
 *   1. 生成新密钥 -> 写入 JWT_SECRET_NEW
 *   2. 重启服务 -> 签发用 NEW，验签允许 NEW + CURRENT
 *   3. 等 24h 让所有旧 token 自然过期
 *   4. 把 CURRENT 移到 PREVIOUS，NEW 改名为 CURRENT
 *   5. 清空 PREVIOUS（可选保留一段时间）
 *
 * 占位符集合 + 最小长度校验都在这里。auth.js 引用本模块。
 */
const DEFAULT_PLACEHOLDERS = new Set([
  '', 'change-me', 'please-change-me', 'changeme',
  'please-change-this-to-a-strong-random-secret-key-2026',
  'please-change-this-to-a-strong-random-secret-key-min-32-chars'
]);
const MIN_SECRET_LENGTH = 32;

// 内存缓存：避免每次请求重新读 env
let _current = null;       // { value, kv }
let _previous = null;      // { value, kv } | null
let _newSecret = null;     // 启动期临时，用于轮换
let _resolved = false;

function readEnvKey(name) {
  const v = process.env[name];
  if (!v) return null;
  if (DEFAULT_PLACEHOLDERS.has(v)) return null;
  if (v.length < MIN_SECRET_LENGTH) {
    console.warn('[secret] ' + name + ' 长度不足 ' + MIN_SECRET_LENGTH + ' 字符，已忽略');
    return null;
  }
  return v;
}

function isSecretValid(secret) {
  // 无参时检查当前已解析的 current 密钥（用于 /api/health 探活）
  if (secret === undefined) {
    if (!_resolved) {
      try { resolveSecret() } catch (_) { return false }
    }
    return !!(getCurrentSecret() && getCurrentSecret().length >= MIN_SECRET_LENGTH)
  }
  return !!(secret && !DEFAULT_PLACEHOLDERS.has(secret) && secret.length >= MIN_SECRET_LENGTH);
}

function validateSecret(secret) {
  if (!secret || DEFAULT_PLACEHOLDERS.has(secret) || secret.length < MIN_SECRET_LENGTH) {
    const err = new Error('JWT_SECRET 未设置或仍为占位符/长度不足');
    err.code = 'JWT_SECRET_INVALID';
    err.detail = {
      provided: secret ? 'len=' + secret.length : 'empty',
      minLength: MIN_SECRET_LENGTH
    };
    throw err;
  }
  return secret;
}

/**
 * 启动期失败：把 placeholder 列表 + 长度要求打到 stderr
 * 退出码 78 = EX_CONFIG（sys/exitCodes.h），表示配置错误
 * 调用方应捕获后用 process.exit(78)
 */
function fatalIfInvalid(secret, envName = 'JWT_SECRET') {
  if (secret && !DEFAULT_PLACEHOLDERS.has(secret) && secret.length >= MIN_SECRET_LENGTH) return;
  const lines = [
    '',
    '================================================================',
    ' FATAL: ' + envName + ' is missing, placeholder, or too short',
    '----------------------------------------------------------------',
    ' provided : ' + (secret ? 'length=' + secret.length : '(empty)'),
    ' minLength: ' + MIN_SECRET_LENGTH,
    ' reject   : default placeholders (' + Array.from(DEFAULT_PLACEHOLDERS).join(', ') + ')',
    '',
    ' FIX:',
    '   echo "JWT_SECRET_CURRENT=$(openssl rand -base64 48)" >> .env',
    '   # or export JWT_SECRET_CURRENT=$(openssl rand -base64 48)',
    '   # then restart the process',
    '================================================================',
    ''
  ];
  // 打到 stderr（运维收集），不用 logger 以防 logger 本身依赖 secret
  process.stderr.write(lines.join('\n'));
}

/**
 * 解析 .env 中的所有密钥，返回 { current, previous }。
 * - 优先使用 JWT_SECRET_CURRENT（如未设置则回退 JWT_SECRET 兼容旧配置）
 * - 旧 token 验签用 JWT_SECRET_PREVIOUS
 * - JWT_SECRET_NEW 存在但未升级时仅做 warn（避免误启用）
 *
 * 行为：
 *  - 任何模式下缺少有效 current 密钥 → 抛 JWT_SECRET_INVALID（auth.js 捕获并 process.exit(1)）
 *  - 开发模式下若显式声明 ALLOW_DEV_SECRET=placeholder 才放宽（仅用于单元测试）
 */
function resolveSecret() {
  if (_resolved) return { current: _current, previous: _previous };

  const currentRaw = readEnvKey('JWT_SECRET_CURRENT') || readEnvKey('JWT_SECRET');
  const previousRaw = readEnvKey('JWT_SECRET_PREVIOUS');
  const newRaw = readEnvKey('JWT_SECRET_NEW');

  // 严格失败：无任何 current 密钥时直接抛错
  if (!currentRaw) {
    throw Object.assign(
      new Error('JWT_SECRET_CURRENT（或 JWT_SECRET）未设置，或仍为占位符 / 长度不足 ' + MIN_SECRET_LENGTH),
      { code: 'JWT_SECRET_INVALID', detail: {
        minLength: MIN_SECRET_LENGTH,
        hint: '请用 `openssl rand -base64 48` 生成并写入 .env'
      }}
    );
  }

  _current = { value: currentRaw, kv: 1 };
  _previous = previousRaw ? { value: previousRaw, kv: 0 } : null;
  _newSecret = newRaw;

  if (_newSecret) {
    console.warn('[secret] 检测到 JWT_SECRET_NEW，将在下次重启后用于签发。' +
      '请确认在 _previous 也保留旧值后重启，并跑完轮换流程。');
  }
  if (_previous) {
    console.log('[secret] 已加载 previous 密钥（用于兼容旧 token 验签）');
  }

  _resolved = true;
  return { current: _current, previous: _previous };
}

function getCurrentSecret() {
  if (!_resolved) resolveSecret();
  return _current.value;
}

function getPreviousSecret() {
  if (!_resolved) resolveSecret();
  return _previous ? _previous.value : null;
}

function getCurrentKv() {
  if (!_resolved) resolveSecret();
  return _current.kv;
}

/**
 * 按 token 的 kv 字段挑选验签密钥。
 *   - 缺省视为兼容旧版本（kv 字段不存在） -> 用 current
 *   - kv === current.kv  -> current
 *   - kv === previous.kv -> previous
 *   - 其他 -> null（拒绝）
 */
function pickSecretForVerify(payload) {
  if (!_resolved) resolveSecret();
  const kv = payload && typeof payload.kv === 'number' ? payload.kv : null;
  if (kv === null || kv === _current.kv) return _current.value;
  if (_previous && kv === _previous.kv) return _previous.value;
  return null;
}

// 测试钩子
function _resetForTest() {
  _current = null;
  _previous = null;
  _newSecret = null;
  _resolved = false;
}

module.exports = {
  DEFAULT_PLACEHOLDERS,
  MIN_SECRET_LENGTH,
  isSecretValid,
  validateSecret,
  fatalIfInvalid,
  resolveSecret,
  getCurrentSecret,
  getPreviousSecret,
  getCurrentKv,
  pickSecretForVerify,
  _resetForTest
};
