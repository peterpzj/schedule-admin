/**
 * 轻量级指标收集中间件（无第三方依赖）
 *
 * - 进程级指标：uptime / 内存 / CPU
 * - HTTP 指标：每条路由的 QPS / 状态码分布 / 响应时间分桶
 * - 业务指标：DB 状态、限流桶数
 *
 * 输出格式：Prometheus 文本格式（与 Prometheus / Grafana Agent / 各类 exporter 兼容）
 * 端点：GET /metrics
 * 注意：/metrics 不计入自身统计（避免递归）
 */

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]; // ms

class Metrics {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.labels = new Map();
    this.buckets = DEFAULT_BUCKETS;
    this._startCpu = process.cpuUsage();
    this._startTime = Date.now();
  }

  incCounter(name, labels, value) {
    const v = value === undefined ? 1 : value;
    const key = this._key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + v);
    if (labels) this.labels.set(key, labels);
  }

  setGauge(name, labels, value) {
    const key = this._key(name, labels);
    this.gauges.set(key, value);
    if (labels) this.labels.set(key, labels);
  }

  observeHistogram(name, labels, value) {
    const key = this._key(name, labels);
    let h = this.histograms.get(key);
    if (!h) {
      h = { buckets: new Map(), count: 0, sum: 0, min: Infinity, max: -Infinity };
      this.histograms.set(key, h);
      if (labels) this.labels.set(key, labels);
    }
    h.count++;
    h.sum += value;
    if (value < h.min) h.min = value;
    if (value > h.max) h.max = value;
    for (const b of this.buckets) {
      if (value <= b) h.buckets.set(b, (h.buckets.get(b) || 0) + 1);
    }
  }

  _key(name, labels) {
    if (!labels || Object.keys(labels).length === 0) return name;
    return name + '{' + Object.keys(labels).sort().map(k => k + '="' + String(labels[k]).replace(/"/g, '\\"') + '"').join(',') + '}';
  }

  collectProcessMetrics() {
    const mem = process.memoryUsage();
    this.setGauge('process_uptime_seconds', null, (Date.now() - this._startTime) / 1000);
    this.setGauge('process_resident_memory_bytes', null, mem.rss);
    this.setGauge('process_heap_total_bytes', null, mem.heapTotal);
    this.setGauge('process_heap_used_bytes', null, mem.heapUsed);
    this.setGauge('process_external_bytes', null, mem.external);

    const cpu = process.cpuUsage(this._startCpu);
    this.setGauge('process_cpu_user_seconds_total', null, cpu.user / 1e6);
    this.setGauge('process_cpu_system_seconds_total', null, cpu.system / 1e6);
  }

  collectCustom(snapshot) {
    if (!snapshot) return;
    if (snapshot.dbConnected !== undefined) this.setGauge('db_connected', null, snapshot.dbConnected ? 1 : 0);
    if (snapshot.dbWritable !== undefined) this.setGauge('db_writable', null, snapshot.dbWritable ? 1 : 0);
    if (snapshot.dbSizeBytes !== undefined) this.setGauge('db_size_bytes', null, snapshot.dbSizeBytes);
    if (snapshot.uptimeSec !== undefined) this.setGauge('service_uptime_seconds', null, snapshot.uptimeSec);
    if (snapshot.rateLimitBuckets) {
      for (const entry of Object.entries(snapshot.rateLimitBuckets)) {
        this.setGauge('rate_limit_buckets', { name: entry[0] }, entry[1]);
      }
    }
  }

  render() {
    this.collectProcessMetrics();
    const lines = [];
    const counterByName = this._groupBy(this.counters);
    for (const entry of counterByName) {
      const name = entry[0];
      const items = entry[1];
      lines.push('# TYPE ' + name + ' counter');
      for (const it of items) lines.push(it.key + ' ' + it.value);
    }
    const gaugeByName = this._groupBy(this.gauges);
    for (const entry of gaugeByName) {
      const name = entry[0];
      const items = entry[1];
      lines.push('# TYPE ' + name + ' gauge');
      for (const it of items) lines.push(it.key + ' ' + it.value);
    }
    const histByName = this._groupBy(this.histograms);
    for (const entry of histByName) {
      const name = entry[0];
      const items = entry[1];
      lines.push('# TYPE ' + name + ' histogram');
      for (const it of items) {
        const h = it.value;
        for (const b of this.buckets) {
          const c = h.buckets.get(b) || 0;
          lines.push(name + '_bucket{le="' + b + '"} ' + c);
        }
        lines.push(name + '_bucket{le="+Inf"} ' + h.count);
        lines.push(name + '_count ' + h.count);
        lines.push(name + '_sum ' + h.sum.toFixed(2));
      }
    }
    return lines.join('\n') + '\n';
  }

  _groupBy(map) {
    const out = new Map();
    for (const entry of map) {
      const key = entry[0];
      const value = entry[1];
      const name = key.split('{')[0];
      if (!out.has(name)) out.set(name, []);
      out.get(name).push({ key, value });
    }
    return out;
  }
}

const metrics = new Metrics();

function metricsMiddleware() {
  return function (req, res, next) {
    if (req.path === '/metrics') return next();
    const start = process.hrtime.bigint();
    res.on('finish', function () {
      const ns = Number(process.hrtime.bigint() - start);
      const ms = ns / 1e6;
      // 路由标签 cardinality 防护：
      //   - 命中路由：用 Express 匹配出来的 pattern（如 /api/schedules/:id）
      //   - 未命中路由（404 / 405）：用 __unmatched__ 兜底，避免攻击者用
      //     随机路径把 metric label 撑爆
      let route;
      if (req.route && req.route.path) {
        // 拼上挂载点的前缀（如 /api）
        const base = (req.baseUrl || '');
        route = (base + req.route.path) || req.route.path;
      } else {
        route = '__unmatched__';
      }
      const labels = { method: req.method, route: route, status: String(res.statusCode) };
      metrics.incCounter('http_requests_total', labels);
      metrics.observeHistogram('http_request_duration_ms', { method: req.method, route: route }, ms);
    });
    next();
  };
}

function getMetrics() {
  return metrics;
}

module.exports = {
  metricsMiddleware: metricsMiddleware,
  getMetrics: getMetrics
};
