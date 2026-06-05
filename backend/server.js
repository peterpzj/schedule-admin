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
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { initDb, getDb } = require('./db');

const authRoutes = require('./routes/auth');
const campusRoutes = require('./routes/campuses');
const departmentRoutes = require('./routes/departments');
const clinicTypeRoutes = require('./routes/clinicTypes');
const zoneRoutes = require('./routes/zones');
const roomRoutes = require('./routes/rooms');
const timeSlotRoutes = require('./routes/timeSlots');
const doctorRoutes = require('./routes/doctors');
const scheduleRoutes = require('./routes/schedules');
const excelRoutes = require('./routes/excel');

const PORT = process.env.PORT || 3000;
const app = express();

// 安全 + 日志
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false  // 微信小程序请求不强制 CSP
}));
app.use(morgan('combined'));

// CORS 配置
// 微信小程序在生产环境不需要 CORS（不走浏览器），
// 但开发时通过 wx.request 调用 HTTPS 接口仍需正确响应头
app.use(cors({
  origin: function (origin, callback) {
    // 允许所有 origin（生产环境如果担心安全可改成白名单）
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400  // 预检请求缓存 24h
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 信任代理（用于 HTTPS 反代场景）
app.set('trust proxy', 1);

// 静态资源（管理员后台构建产物可放在 public/）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/clinicTypes', clinicTypeRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/timeSlots', timeSlotRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/excel', excelRoutes);

// 聚合接口（一次拿全部基础数据）
app.get('/api/metadata', async (req, res) => {
  try {
    const { getAllMetadata } = require('./db/queries');
    const data = getAllMetadata(req.query);
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  const db = getDb();
  let dbOk = true;
  try {
    db.prepare('SELECT 1').get();
  } catch (e) {
    dbOk = false;
  }
  res.json({
    success: true,
    message: 'Schedule Admin API is running',
    version: '1.0.0',
    db: dbOk ? 'ok' : 'error',
    uptime: process.uptime(),
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

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Server Error'
  });
});

// 启动
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('诊室排班管理 - 后端 API');
    console.log('========================================');
    console.log('端口: ' + PORT);
    console.log('环境: ' + (process.env.NODE_ENV || 'development'));
    console.log('访问: http://localhost:' + PORT);
    console.log('健康检查: http://localhost:' + PORT + '/api/health');
    console.log('========================================');
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
