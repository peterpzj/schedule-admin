/**
 * 异步导入任务队列
 *
 * 背景：5000+ 行的排班导入如果走同步请求，会撞上 30s 网关超时
 *
 * 设计：
 *  - 任务在内存中跟踪（小规模，可换 Redis）；重启后丢失
 *  - 客户端通过 /api/excel/jobs/:id 轮询进度
 *  - 每 100ms 更新一次进度（避免日志风暴）
 *  - 任务支持取消（标记 cancelled，下一轮停止）
 */
const { randomUUID } = require('crypto');
const log = require('./logger');

// #B24 修复占位：importJobs 是内存 Map,多进程/PM2/重启任务丢失
//   完整持久化需建表 + 重构 createJob/getJob/listJobs/cancelJob,暂保持 memory 但加环境变量提示
const STORE_BACKEND = (process.env.STORE_BACKEND || 'memory').toLowerCase();
if (STORE_BACKEND === 'memory' && process.env.NODE_ENV === 'production') {
  log.warn('importJobs.using.memory', { hint: '生产环境推荐实现 importJobs 持久化,当前多实例任务不共享' });
}

const JOBS = new Map(); // id -> { id, status, total, processed, inserted, errors, warnings, startedAt, finishedAt, file, cancelRequested }

function createJob(meta) {
  const id = randomUUID();
  const job = {
    id,
    status: 'pending',  // pending | running | completed | failed | cancelled
    total: 0,
    processed: 0,
    inserted: 0,
    failed: 0,
    errors: [],
    warnings: [],     // FK 预校验等非阻断告警
    startedAt: Date.now(),
    finishedAt: null,
    cancelRequested: false,
    ...meta
  };
  JOBS.set(id, job);
  // 1 小时后自动清理（避免内存膨胀）
  setTimeout(() => JOBS.delete(id), 60 * 60 * 1000).unref?.();
  return job;
}

function getJob(id) {
  return JOBS.get(id);
}

function listJobs() {
  return Array.from(JOBS.values()).slice(-20);
}

function cancelJob(id) {
  const j = JOBS.get(id);
  if (!j) return false;
  j.cancelRequested = true;
  return true;
}

function setProgress(job, processed, total, inserted, failed) {
  if (job.cancelRequested) {
    const e = new Error('cancelled');
    e.cancelled = true;
    throw e;
  }
  job.processed = processed;
  job.total = total;
  if (typeof inserted === 'number') job.inserted = inserted;
  if (typeof failed === 'number') job.failed = failed;
  log.info('import.job.progress', {
    jobId: job.id,
    processed,
    total,
    inserted: job.inserted,
    failed: job.failed
  });
}

function completeJob(job, extra) {
  // #P1-9 配套：支持 details.cancelled — 调用方可在 catch 中显式标记取消状态
  const cancelled = job.cancelRequested || (extra && extra.cancelled === true);
  job.status = cancelled ? 'cancelled' : 'completed';
  job.finishedAt = Date.now();
  Object.assign(job, extra || {});
  log.info('import.job.completed', {
    jobId: job.id,
    status: job.status,
    processed: job.processed,
    inserted: job.inserted,
    failed: job.failed,
    durationMs: job.finishedAt - job.startedAt
  });
}

function failJob(job, err) {
  job.status = 'failed';
  job.finishedAt = Date.now();
  job.errors.push({ msg: err && err.message || String(err) });
  log.error('import.job.failed', { jobId: job.id }, err);
}

module.exports = {
  createJob,
  getJob,
  listJobs,
  cancelJob,
  setProgress,
  completeJob,
  failJob
};
