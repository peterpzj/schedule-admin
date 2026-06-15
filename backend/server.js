/**
 * 诊室排班管理 - 后端 API 入口
 *
 * 提供 REST API 给：
 *   1. Web 管理后台（admin-frontend）
 *   2. 微信小程序（替代 WeChat Cloud）
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const path = require('path');
require('dotenv').config();

const { initDb, getDb } = require('./db');

const authRoutes = require('./routes/auth');
const auditRoutes = require('./routes/auditLogs');
const campusRoutes = require('./routes/campuses');
const departmentRoutes = require('./routes/departments');
const clinicTypeRoutes = require('./routes/clinicTypes');
const zoneRoutes = require('./routes/zones');
const roomRoutes = require('./routes/rooms');
const timeSlotRoutes = require('./routes/timeSlots');
const doctorRoutes = require('./routes/doctors');
const scheduleRoutes = require('./routes/schedules');
const excelRoutes = require('./routes/excel');
const { cleanupStaleUploads } = excelRoutes;
const { requireAuth } = require('./middleware/auth');
const { isSecretValid, resolveSecret } = require('./middleware/auth');
const { loginLimiter, createUserLimiter, globalLimiter, scheduleWriteLimiter, excelLimiter } = require('./middleware/rateLimit');
const { metricsMiddleware, getMetrics } = require('./middleware/metrics');
const { requestId } = require('./middleware/requestId');
const { httpLogger } = require('./middleware/httpLogger');
const log = require('./lib/logger');
const { collectMetadata, getAllMetadata } = require('./db/queries');
const { escapeCsv } = require('./lib/csv');
const { ERR, biz, ok, fail, errorMiddleware, asyncHandler } = require('./lib/errors');

const PORT = process.env.PORT || 3000;
const app = express();

// 启动时强校验 JWT_SECRET（未设置或为占位符则进程退出）
resolveSecret();

// 安全 + 日志
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false, // 微信小程序请求不强制 CSP
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 15552000, includeSubDomains: true }, // 180 天，HTTPS 代理后生效
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'sameorigin' }
}));
app.use(requestId());
app.use(httpLogger());

// CORS 配置
// 微信小程序在生产环境不需要 CORS（不走浏览器），
// 但开发时通过 wx.request 调用 HTTPS 接口仍需正确响应头
// 白名单从 .env 读 ALLOWED_ORIGINS，逗号分隔
function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}
const ALLOWED_ORIGINS = new Set(parseAllowedOrigins());
log.info('cors.configured', { origins: ALLOWED_ORIGINS.size ? Array.from(ALLOWED_ORIGINS).join(', ') : '(none configured -> same-origin only)' });

app.use(cors({
  origin: function (origin, callback) {
    // 无 origin（小程序、curl、Postman）放行
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error('CORS: origin not allowed: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400  // 预检请求缓存 24h
}));

app.use(metricsMiddleware());

// 信任代理（用于 HTTPS 反代场景）
app.set('trust proxy', 1);

// #P0-4 修复：全局限流挪到 body parser 之前，避免攻击者用大 body 打爆 json 解析器
//   之前顺序：metrics → json(10mb) → urlencoded → globalLimiter
//   攻击者能发送 10MB 非法 JSON 触发解析错误日志，把磁盘写满；限流根本拦不住
//   现在顺序：metrics → globalLimiter → json(10mb) → urlencoded
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path === '/api/version' || req.path === '/metrics') return next();
  return globalLimiter(req, res, next);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// #P0-5 修复：/uploads 加 dotfiles:deny + index:false + redirect:false
//   之前默认配置允许 .dotfile / 目录索引 / 软链跳转，攻击者可上传 ../../etc/passwd
//   之类的文件名（multer dest 模式可能保留 originalname 的 basename）
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  dotfiles: 'deny',
  index: false,
  redirect: false
}));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/auditLogs', auditRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/clinicTypes', clinicTypeRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/timeSlots', timeSlotRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/excel', excelRoutes);

// ====== 必须在 scheduleRoutes 注册之前声明 ======

// 统计接口（Dashboard 概览用）
app.get('/api/statistics', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const { campus } = req.query;
  const params = [];
  let where = '1=1';
  if (campus) { where += ' AND campus_code = ?'; params.push(campus); }

  // #Audit#15 修复：8 个 SELECT 放进事务，保证一个请求内数据快照一致
  //   之前：跨 SELECT 之间可以插队 — campusStats.total 跟 deptStats.total 相加能差
  //   之后：better-sqlite3 的 transaction() 同步原子执行，外部并发写会被串行化
  const stats = db.transaction(() => {
  const total = db.prepare(`SELECT COUNT(*) as c FROM schedules WHERE ${where}`).get(...params).c;
  const campusStats = db.prepare(`SELECT campus_code as code, campus_name as name, COUNT(*) as count
                                  FROM schedules WHERE ${where}
                                  GROUP BY campus_code, campus_name
                                  ORDER BY count DESC`).all(...params);
  const slotStats = db.prepare(`SELECT period, COUNT(*) as count
                                FROM schedules WHERE ${where}
                                GROUP BY period
                                ORDER BY count DESC`).all(...params);
  const deptStats = db.prepare(`SELECT department, COUNT(DISTINCT doctor_id) as doctorCount, COUNT(*) as count
                                FROM schedules WHERE ${where}
                                GROUP BY department
                                ORDER BY count DESC LIMIT 10`).all(...params);
  const roomStats = db.prepare(`SELECT campus_code as code, campus_name as campus, period, COUNT(*) as count
                                FROM schedules WHERE ${where}
                                GROUP BY campus_code, campus_name, period
                                ORDER BY count DESC`).all(...params);
  const dayStats = db.prepare(`SELECT day_of_week as dayOfWeek, COUNT(*) as count
                              FROM schedules WHERE ${where}
                              GROUP BY day_of_week
                              ORDER BY day_of_week`).all(...params);

  // #问题1-Dashboard 修复：按职称统计（医生属于医院不分院区，按 title 维度）
  //   schedules 没存 title 列，LEFT JOIN doctors 取
  const titleStats = db.prepare(`
    SELECT
      COALESCE(d.title, '未填写') as title,
      COUNT(DISTINCT d.id) as doctorCount,
      COUNT(s.id) as scheduleCount
    FROM doctors d
    LEFT JOIN schedules s ON s.doctor_id = d.id ${campus ? 'AND s.campus_code = ?' : ''}
    GROUP BY d.title
    ORDER BY doctorCount DESC
  `).all(...params);

  // #问题1-Dashboard 修复：按院区→诊区层级聚合（campus → zone 二维）
  const campusZoneStats = db.prepare(`
    SELECT
      campus_code as campusCode,
      campus_name as campusName,
      zone_code as zoneCode,
      zone_name as zoneName,
      COUNT(*) as scheduleCount,
      COUNT(DISTINCT room_id) as roomCount
    FROM schedules
    WHERE 1=1 ${campus ? 'AND campus_code = ?' : ''}
    GROUP BY campus_code, campus_name, zone_code, zone_name
    ORDER BY campus_code, zone_code
  `).all(...params);

  // 基础数据统计
  const meta = getAllMetadata({});
  return {
    totalSchedules: total,
    campusStats,
    slotStats,
    deptStats,
    roomStats,
    dayStats,
    titleStats,        // #问题1：新增，按职称分布
    campusZoneStats,   // #问题1：新增，院区→诊区二级结构
    totalCampuses: meta.campuses.length,
    totalDepartments: meta.departments.length,
    totalDoctors: meta.doctors.length,
    totalRooms: meta.rooms.length,
    totalZones: meta.zones.length,
    totalTimeSlots: meta.timeSlots.length
  };
  })();
  res.json(ok(stats));
}));

// 导出排班为 CSV（流式输出）
app.get('/api/schedules/export', requireAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const { campus, format = 'csv' } = req.query;
  const params = [];
  let where = '1=1';
  if (campus) { where += ' AND campus_code = ?'; params.push(campus); }

  const headers = ['医生', '工号', '科室', '院区代码', '院区', '诊区', '诊室', '门诊类型', '时段', '开始', '结束', '周次', '限号', '备注'];
  const fields = ['doctor_name', 'work_id', 'department', 'campus_code', 'campus_name', 'zone_name', 'room_name', 'clinic_type_name', 'period', 'start_time', 'end_time', 'day_of_week', 'patient_limit', 'remark'];

  if (format === 'json') {
    const rows = db.prepare(`SELECT * FROM schedules WHERE ${where}
                             ORDER BY campus_code, day_of_week, period, doctor_name`).all(...params);
    return res.json(ok({ total: rows.length, rows }));
  }

  // CSV 流式写入：使用 stmt.iterate() 逐行读取，避免一次性加载到内存
  // 写 BOM、headers、流式逐行输出
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment;filename=schedules_' + Date.now() + '.csv');
  res.setHeader('X-Accel-Buffering', 'no');     // 关闭 nginx 缓冲
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders && res.flushHeaders();

  // 写 BOM（Excel 打开 UTF-8 CSV 不乱码）
  res.write('\ufeff');
  res.write(headers.map(escapeCsv).join(',') + '\n');

  const stmt = db.prepare(`SELECT * FROM schedules WHERE ${where}
                           ORDER BY campus_code, day_of_week, period, doctor_name`);
  let count = 0;
  const BATCH = 200;
  let buf = [];
  for (const r of stmt.iterate(...params)) {
    buf.push(fields.map(f => escapeCsv(r[f])).join(','));
    count++;
    if (buf.length >= BATCH) {
      res.write(buf.join('\n') + '\n');
      buf = [];
    }
  }
  if (buf.length > 0) res.write(buf.join('\n') + (count > 0 ? '\n' : ''));
  res.end();
  log.info('schedules.export.csv', { campus: campus || '*', rows: count });
}));

// 排班路由（必须放在 export 路由之后）
app.use('/api/schedules', scheduleRoutes);

// 聚合接口（一次拿全部基础数据）
app.get('/api/metadata', requireAuth, async (req, res) => {
  try {
    // 支持 ?limits[rooms]=50 形式；简单起见读 req.query.limits（对象或字符串）
    const data = collectMetadata(req.query);
    res.json({ success: true, ...data, _truncated: data.warnings && data.warnings.length > 0, warnings: data.warnings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 健康检查



// ====== 指标端点（Prometheus 格式，供外部 scrape）======
app.get('/metrics', (req, res) => {
  try {
    const db = getDb();
    let dbOk = true, dbWritable = false, dbSize = 0;
    try {
      db.prepare('SELECT 1').get();
      const probe = db.transaction(() => {
        const info = db.prepare(
          "INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, ip) VALUES (NULL, '__metrics__', 'metrics_probe', 'system', NULL, '{}', NULL)"
        ).run();
        db.prepare('DELETE FROM audit_logs WHERE id = ?').run(info.lastInsertRowid);
      });
      probe();
      dbWritable = true;
    } catch (_) { dbOk = false; }
    try {
      const fs = require('fs');
      const DB_PATH = process.env.DB_PATH || './data/schedule.db';
      if (fs.existsSync(DB_PATH)) dbSize = fs.statSync(DB_PATH).size;
    } catch (_) {}

    // 限流桶数
    const buckets = {};
    const limiterPairs = [
      ['login', loginLimiter],
      ['createUser', createUserLimiter],
      ['scheduleWrite', scheduleWriteLimiter],
      ['excel', excelLimiter],
      ['global', globalLimiter]
    ];
    for (const pair of limiterPairs) {
      if (pair[1] && pair[1]._buckets) buckets[pair[0]] = pair[1]._buckets.size;
    }

    getMetrics().collectCustom({
      dbConnected: dbOk,
      dbWritable,
      dbSizeBytes: dbSize,
      uptimeSec: Math.round(process.uptime()),
      rateLimitBuckets: buckets
    });

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(getMetrics().render());
  } catch (e) {
    res.status(500).type('text/plain').send('# error: ' + e.message + '\n');
  }
});
app.get('/api/health', (req, res) => {
  const db = getDb();
  let dbOk = true;
  let dbWritable = false;
  try {
    db.prepare('SELECT 1').get();
    // 验证写权限：插入一条临时审计日志并立刻删除
    const probe = db.transaction(() => {
      const info = db.prepare(`INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, ip)
                               VALUES (NULL, '__health__', 'health_probe', 'system', NULL, '{}', NULL)`).run();
      db.prepare('DELETE FROM audit_logs WHERE id = ?').run(info.lastInsertRowid);
    });
    probe();
    dbWritable = true;
  } catch (e) {
    dbOk = false;
    dbWritable = false;
  }
  res.json({
    success: true,
    message: 'Schedule Admin API is running',
    version: '1.0.0',
    db: dbOk ? 'ok' : 'error',
    dbWritable,
    jwtSecretOk: isSecretValid(),
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString()
  });
});

// API 版本信息（给小程序探活用）
app.get('/api/version', (req, res) => {
  res.json({
    success: true,
    name: 'schedule-admin-api',
    version: '1.0.0',
    apiPrefix: '/api',
    miniprogramMinVersion: '3.0.0',
    docs: 'https://github.com/peterpzj/schedule-admin'
  });
});

// #Audit#16 修复：客户端日志接收端点（sendBeacon POST /api/client-log）
//   用途：浏览器 / 小程序前端在 4xx/5xx / console.error 时把上下文外发
//   实现：直接写文件 ./data/client-log.ndjson（按行 JSON），定时 rotate
//   鉴权：不强制（公开端点，靠 IP+UA 限速），但写入容量限制每条 8KB
const fs2 = require('fs');
const CLIENT_LOG_PATH = process.env.CLIENT_LOG_PATH || path.join(__dirname, 'data', 'client-log.ndjson');
const CLIENT_LOG_MAX_BYTES = 8 * 1024; // 8KB
try { fs2.mkdirSync(path.dirname(CLIENT_LOG_PATH), { recursive: true }); } catch (_) {}
const _clientLogLimiter = new Map(); // IP -> { count, resetAt }
function _clientLogAllow(ip) {
  const now = Date.now();
  const win = _clientLogLimiter.get(ip);
  if (!win || now > win.resetAt) {
    _clientLogLimiter.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (win.count >= 60) return false; // 每 IP 每分钟 60 条上限
  win.count++;
  return true;
}
app.post('/api/client-log', (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!_clientLogAllow(ip)) return res.status(429).end();
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { return res.status(400).end(); }
    }
    const line = JSON.stringify({
      ip, ua: req.headers['user-agent'] || '',
      receivedAt: new Date().toISOString(),
      ...body
    });
    if (line.length > CLIENT_LOG_MAX_BYTES) return res.status(413).end();
    fs2.appendFile(CLIENT_LOG_PATH, line + '\n', () => {});
    res.status(204).end();
  } catch (e) {
    res.status(500).end();
  }
});

// 全局错误处理
app.use(errorMiddleware());

// 启动
initDb().then(() => {
  // #P0-2 / #P2-18 修复：多实例部署告警
  //   - 进程内 Map（memory）→ 限流桶 / token 黑名单 / 登录失败桶 重启即清零、跨进程不共享
  //   - 单实例 + 开发环境 用 memory OK
  //   - 生产环境 **强烈建议** STORE_BACKEND=sqlite（或后续换 Redis）
  //   - 不阻断启动（兼容开发），但打 warn 让运维一眼看见
  const backend = (process.env.STORE_BACKEND || 'memory').toLowerCase();
  if (backend === 'memory' && process.env.NODE_ENV === 'production') {
    log.warn('store.using.memory', {
      hint: '生产环境推荐 STORE_BACKEND=sqlite — 否则限流/黑名单/登录失败桶 多实例不共享、重启即清零',
      docs: 'https://github.com/peterpzj/schedule-admin/blob/main/admin/DEPLOY_DONE.md'
    });
  } else if (backend === 'memory') {
    log.info('store.using.memory', { note: '开发环境用内存即可' });
  } else {
    log.info('store.using.shared', { backend });
  }

  // #B26 修复：定时清理孤儿上传文件，每小时一次
  //   之前：只启动时清一次（cleanupStaleUploads() 在 excel.js 启动时跑）
  //   之后：每小时 setInterval 兜底，防止长时间运行累积 /uploads 垃圾
  setInterval(cleanupStaleUploads, 3600 * 1000);

  app.listen(PORT, '0.0.0.0', () => {
    log.info('server.started', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
}).catch(err => {
  log.error('db.init.failed', {}, err);
  process.exit(1);
});
