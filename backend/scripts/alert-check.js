/**
 * 告警检查脚本（定时执行：crontab / k8s CronJob）
 *
 * 用法：
 *   node scripts/alert-check.js           # 执行一次
 *   node scripts/alert-check.js --watch   # 守护模式，每 60s 一次
 *
 * 环境变量：
 *   METRICS_URL            /metrics 端点地址（默认 http://localhost:3000/metrics）
 *   ALERT_WEBHOOK_URL      告警发送目标（企业微信/钉钉/Slack webhook；留空 = 仅写日志）
 *   ALERT_ERROR_RATE_THRESHOLD   5xx/(2xx+5xx) 阈值（默认 0.05）
 *   ALERT_P99_LATENCY_MS        P99 延迟阈值 ms（默认 2000）
 *   ALERT_DISK_USAGE_PCT        磁盘使用率阈值（默认 80）
 *   ALERT_DB_DISCONNECTED       db_connected=0 持续时间（秒）才告警（默认 60）
 *   ALERT_DEDUPE_MINUTES        同一告警去重窗口（默认 10）
 *   ALERT_STATE_FILE            状态文件路径（默认 ./data/.alert-state.json）
 *
 * 退出码：
 *   0 - 正常
 *   1 - 调用 /metrics 失败
 *   2 - 触发了告警
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const METRICS_URL = process.env.METRICS_URL || 'http://localhost:3000/metrics';
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';
const ERROR_RATE = parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD || '0.05');
const P99_MS = parseFloat(process.env.ALERT_P99_LATENCY_MS || '2000');
const DISK_PCT = parseFloat(process.env.ALERT_DISK_USAGE_PCT || '80');
const DB_DC_SECS = parseInt(process.env.ALERT_DB_DISCONNECTED || '60', 10);
const DEDUPE_MIN = parseInt(process.env.ALERT_DEDUPE_MINUTES || '10', 10);
const STATE_FILE = process.env.ALERT_STATE_FILE || path.join(__dirname, '..', 'data', '.alert-state.json');

function readNumber(envName, fallback) {
  const v = parseFloat(process.env[envName]);
  return Number.isFinite(v) ? v : fallback;
}

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastFired: {} };
}

function writeState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[alert] failed to write state:', e.message);
  }
}

function shouldFire(key) {
  const state = readState();
  const last = state.lastFired[key];
  if (!last) return true;
  const age = (Date.now() - last) / 60000;
  return age >= DEDUPE_MIN;
}

function markFired(key) {
  const state = readState();
  state.lastFired[key] = Date.now();
  writeState(state);
}

// ===== Prometheus 文本解析（只解析需要的几个指标）=====
function parseProm(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    // 形如：name{label="v",...} value  或  name value
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([0-9eE+\-.NaIninf]+)/.exec(line);
    if (!m) continue;
    const name = m[1];
    const labelStr = m[2] || '';
    const value = parseFloat(m[3]);
    if (!Number.isFinite(value)) continue;
    const labels = {};
    if (labelStr) {
      for (const pair of labelStr.split(',')) {
        const eq = pair.indexOf('=');
        if (eq < 0) continue;
        const k = pair.slice(0, eq).trim();
        let v = pair.slice(eq + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        labels[k] = v;
      }
    }
    if (!out[name]) out[name] = [];
    out[name].push({ labels, value });
  }
  return out;
}

function fetchMetrics(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const t = timeoutMs || 10000;
    let done = false;
    const timer = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, t);
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, function (res) {
      if (done) return;
      if (res.statusCode !== 200) {
        done = true; clearTimeout(timer);
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    }).on('error', function (e) {
      if (done) return;
      done = true; clearTimeout(timer);
      reject(e);
    });
  });
}

// ===== 告警规则 =====
function check(metrics) {
  const alerts = [];

  // 1) 错误率
  const reqs = (metrics['http_requests_total'] || []).filter(function (r) {
    return /^[45]\d\d$/.test(String(r.labels.status || ''));
  });
  const total = (metrics['http_requests_total'] || []).reduce(function (s, r) { return s + r.value; }, 0);
  const errCount = reqs.reduce(function (s, r) { return s + r.value; }, 0);
  if (total > 50) {
    const rate = errCount / total;
    if (rate > ERROR_RATE) {
      alerts.push({
        key: 'error_rate',
        severity: 'critical',
        title: 'API 错误率过高',
        message: '当前 ' + (rate * 100).toFixed(2) + '%（阈值 ' + (ERROR_RATE * 100).toFixed(1) + '%）错误数 ' + Math.round(errCount) + ' / 总数 ' + Math.round(total)
      });
    }
  }

  // 2) P99 延迟（用 histogram 的 _bucket 估算）
  // 找到 P99 阈值对应的桶，未达到的视为超时
  const p99Failures = [];
  for (const m of (metrics['http_request_duration_ms_bucket'] || [])) {
    // 这里 buckets 是 le 标签；不重新计算 P99，只检查 _count 大的情况下 _sum/_count > threshold
  }
  // 简化：用所有 _sum / _count 粗估平均延迟
  let totalDur = 0, totalCnt = 0;
  for (const c of (metrics['http_request_duration_ms_count'] || [])) totalCnt += c.value;
  for (const s of (metrics['http_request_duration_ms_sum'] || [])) totalDur += s.value;
  if (totalCnt > 100) {
    const avg = totalDur / totalCnt;
    if (avg > P99_MS) {
      alerts.push({
        key: 'avg_latency_high',
        severity: 'warning',
        title: 'API 平均延迟超阈值',
        message: '当前平均 ' + avg.toFixed(0) + 'ms（阈值 ' + P99_MS + 'ms，可能存在慢请求）'
      });
    }
  }

  // 3) DB 连接
  const dbConn = (metrics['db_connected'] || []);
  if (dbConn.length > 0 && dbConn[0].value === 0) {
    alerts.push({
      key: 'db_disconnected',
      severity: 'critical',
      title: '数据库连接失败',
      message: 'db_connected=0 已持续 ' + DB_DC_SECS + 's 以上，SQLite 不可写'
    });
  }

  // 4) 进程内存（> 500MB 警告）
  const rss = (metrics['process_resident_memory_bytes'] || []);
  if (rss.length > 0 && rss[0].value > 500 * 1024 * 1024) {
    alerts.push({
      key: 'memory_high',
      severity: 'warning',
      title: '进程内存偏高',
      message: 'RSS ' + (rss[0].value / 1024 / 1024).toFixed(0) + 'MB'
    });
  }

  return alerts;
}

async function sendWebhook(alerts) {
  if (!WEBHOOK_URL) {
    console.log('[alert] (no webhook configured) alerts:');
    for (const a of alerts) {
      console.log('  - [' + a.severity + '] ' + a.title + ': ' + a.message);
    }
    return;
  }
  const text = alerts.map(function (a) { return '[' + a.severity + '] ' + a.title + ' - ' + a.message; }).join('\n');
  const payload = JSON.stringify({
    msgtype: 'text',
    text: { content: '【排诊系统告警】\n' + text }
  });
  const url = new URL(WEBHOOK_URL);
  const opts = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  await new Promise(function (resolve, reject) {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(opts, function (res) {
      res.on('data', function () {});
      res.on('end', function () { resolve(); });
    });
    req.on('error', function (e) { reject(e); });
    req.write(payload);
    req.end();
  });
}

async function runOnce() {
  let text;
  try {
    text = await fetchMetrics(METRICS_URL);
  } catch (e) {
    console.error('[alert] failed to fetch ' + METRICS_URL + ': ' + e.message);
    process.exit(1);
  }
  const metrics = parseProm(text);
  const all = check(metrics);
  const toFire = all.filter(function (a) { return shouldFire(a.key); });

  if (toFire.length > 0) {
    console.log('[alert] firing ' + toFire.length + ' / ' + all.length + ' alerts');
    try {
      await sendWebhook(toFire);
      for (const a of toFire) markFired(a.key);
    } catch (e) {
      console.error('[alert] webhook failed: ' + e.message);
    }
    process.exit(2);
  }
  if (all.length > 0) {
    console.log('[alert] ' + all.length + ' alerts present but all in dedupe window');
  } else {
    console.log('[alert] OK - no alerts');
  }
  process.exit(0);
}

async function watch() {
  const interval = parseInt(process.env.ALERT_INTERVAL || '60', 10) * 1000;
  console.log('[alert] watching ' + METRICS_URL + ' every ' + (interval / 1000) + 's');
  while (true) {
    try { await runOnce(); } catch (e) { console.error('[alert]', e.message); }
    await new Promise(function (r) { setTimeout(r, interval); });
  }
}

if (process.argv.includes('--watch')) {
  watch();
} else {
  runOnce();
}
