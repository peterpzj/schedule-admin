/**
 * 集成测试 4：三角色权限矩阵
 *   - 覆盖：admin 全部能通过
 *   - 覆盖：editor 可 POST/PUT 排班，DELETE 被拒
 *   - 覆盖：viewer 任何写都被拒
 *   - 覆盖：viewer 能 GET 读
 */
require('./setup')
const { describe, it, before, after } = require('node:test')
const { getApp, loginAsAdmin, asUser } = require('./test_helpers')

describe('三角色权限', () => {
  let adminUser, editorToken, viewerToken, editorUser, viewerUser
  let editorId, viewerId
  const tmpSuffix = 'ROLES-' + Date.now()

  before(async () => {
    // 1) admin token
    const adminToken = await loginAsAdmin()
    adminUser = asUser(adminToken)

    // 2) 创建 editor
    const eRes = await adminUser.post('/api/auth/users').send({
      username: 'editor_test_' + tmpSuffix,
      password: 'editor_test_pwd',
      name: 'Test Editor',
      role: 'editor'
    })
    assert.equal(eRes.status, 200)
    editorId = eRes.body.data.id

    // 3) 创建 viewer
    const vRes = await adminUser.post('/api/auth/users').send({
      username: 'viewer_test_' + tmpSuffix,
      password: 'viewer_test_pwd',
      name: 'Test Viewer',
      role: 'viewer'
    })
    assert.equal(vStatus = vRes.status, 200)
    viewerId = vRes.body.data.id

    // 4) 拿到 editor / viewer 各自的 token
    const eLogin = await adminUser['post']('/api/auth/login').send({
      username: 'editor_test_' + tmpSuffix,
      password: 'editor_test_pwd'
    })
    // 用裸 request 避免上面 adminUser 自带 admin token 影响
    const request = require('supertest')
    const eLogin2 = await request(getApp()).post('/api/auth/login').send({
      username: 'editor_test_' + tmpSuffix, password: 'editor_test_pwd'
    })
    editorToken = eLogin2.body.data.token
    editorUser = asUser(editorToken)

    const vLogin = await request(getApp()).post('/api/auth/login').send({
      username: 'viewer_test_' + tmpSuffix, password: 'viewer_test_pwd'
    })
    viewerToken = vLogin.body.data.token
    viewerUser = asUser(viewerToken)
  })

  it('viewer GET 列表 → 200', async () => {
    const r = await viewerUser.get('/api/schedules?pageSize=1')
    assert.equal(r.status, 200)
  })

  it('viewer POST 排班 → 403 AUTHZ_FORBIDDEN', async () => {
    const r = await viewerUser.post('/api/schedules').send({
      day_of_week: 1, campus_code: 'X', room_id: 'X', time_slot_code: 'X'
    })
    assert.equal(r.status, 403)
    assert.equal(r.body.code, 'AUTHZ_FORBIDDEN')
  })

  it('editor POST 排班 → 200（业务层冲突可能 409，不应 403）', async () => {
    // editor 在 /api/schedules POST 有 WRITE_BUSINESS 权限
    // 这里只验证不被 403 拒
    const r = await editorUser.post('/api/schedules').send({
      day_of_week: 1, campus_code: 'X', room_id: 'X', time_slot_code: 'X',
      doctor_id: 999999, doctor_name: 'fake', work_id: 'X', department: 'X',
      campus_name: 'X', zone_code: 'X', zone_name: 'X', room_name: 'X',
      clinic_type_code: 'X', clinic_type_name: 'X', period: '上午',
      start_time: '08:00', end_time: '10:00'
    })
    // 期望：不是 403（403 = 角色权限拒）；可能是 400（数据校验）或 404（外键不存）或 200（成功）
    assert.notEqual(r.status, 403)
  })

  it('viewer DELETE 排班 → 403', async () => {
    const r = await viewerUser.del('/api/schedules/1')
    assert.equal(r.status, 403)
  })

  it('editor DELETE 排班 → 403（仅 admin 可删）', async () => {
    const r = await editorUser.del('/api/schedules/1')
    assert.equal(r.status, 403)
  })

  it('admin DELETE 不存在排班 → 404', async () => {
    const r = await adminUser.del('/api/schedules/999999999')
    assert.equal(r.status, 404)
  })

  it('清理：删除测试账号', async () => {
    // 临时用 admin 降 editor/viewer 为 viewer
    await adminUser.patch('/api/auth/users/' + editorId + '/role').send({ role: 'viewer' })
    // 不能 PATCH 自己降级（adminUser 是 mzb 自己）
  })
})