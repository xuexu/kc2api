import { type FastifyInstance } from 'fastify'
import { authenticateAdmin, openAIError } from './auth.js'
import type { ConfigStore } from './config-store.js'
import type { UpstreamClient } from './upstream.js'
import type { LoggerLike } from './types.js'

export function registerAdminRoutes(
  app: FastifyInstance,
  store: ConfigStore,
  upstream: UpstreamClient,
  adminApiKey: string,
  logger: LoggerLike,
): void {
  // 管理鉴权中间件
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/admin/api/')) return
    authenticateAdmin(request, reply, adminApiKey)
  })

  // ====== 账号 ======
  app.get('/admin/api/accounts', async (_req, reply) => {
    const accounts = store.getAccounts().map(a => ({
      ...a,
      api_key: maskApiKey(a.api_key),
    }))
    reply.send(accounts)
  })

  app.post('/admin/api/accounts', async (request, reply) => {
    const body = request.body as any
    if (!body.name || !body.api_key) {
      return reply.code(400).send(openAIError('name and api_key are required', 'invalid_request_error', 'missing_fields'))
    }
    try {
      const account = store.createAccount({
        name: body.name,
        api_key: body.api_key,
        base_url: body.base_url,
        weight: body.weight,
        tags: body.tags,
      })
      reply.code(201).send({ ...account, api_key: maskApiKey(account.api_key) })
    } catch (e: any) {
      reply.code(500).send(openAIError(e.message, 'internal_error', 'create_failed'))
    }
  })

  app.put('/admin/api/accounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as any
    try {
      const account = store.updateAccount(id, body)
      reply.send({ ...account, api_key: maskApiKey(account.api_key) })
    } catch (e: any) {
      const code = e.message.includes('not found') ? 404 : 500
      reply.code(code).send(openAIError(e.message, 'internal_error', code === 404 ? 'not_found' : 'update_failed'))
    }
  })

  app.delete('/admin/api/accounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      store.deleteAccount(id)
      reply.code(204).send()
    } catch (e: any) {
      reply.code(404).send(openAIError(e.message, 'internal_error', 'not_found'))
    }
  })

  app.post('/admin/api/accounts/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string }
    const account = store.getAccount(id)
    if (!account) {
      return reply.code(404).send(openAIError('Account not found', 'internal_error', 'not_found'))
    }
    try {
      const response = await upstream.fetchMetadata(account.api_key, account.base_url)
      reply.send({ ok: response.ok, status: response.status })
    } catch (e: any) {
      reply.send({ ok: false, status: 0, error: e.message })
    }
  })

  // 导出账号
  app.get('/admin/api/accounts/export/all', async (_req, reply) => {
    const accounts = store.getAccounts()
    reply.header('content-type', 'application/json')
    reply.header('content-disposition', 'attachment; filename="kimchi2api-accounts.json"')
    reply.send(accounts)
  })

  // 导入账号
  app.post('/admin/api/accounts/import', async (request, reply) => {
    const body = request.body as any
    if (!Array.isArray(body)) {
      return reply.code(400).send(openAIError('Expected a JSON array of accounts', 'invalid_request_error', 'invalid_body'))
    }
    const results: { name: string; status: 'created' | 'skipped' | 'error'; error?: string }[] = []
    for (const item of body) {
      if (!item.name || !item.api_key) {
        results.push({ name: item.name || '(unknown)', status: 'error', error: 'name and api_key required' })
        continue
      }
      try {
        // 检查是否已存在同名账号
        const existing = store.getAccounts().find(a => a.name === item.name)
        if (existing) {
          results.push({ name: item.name, status: 'skipped', error: 'already exists' })
          continue
        }
        store.createAccount({
          name: item.name,
          api_key: item.api_key,
          base_url: item.base_url,
          weight: item.weight,
          tags: item.tags,
        })
        results.push({ name: item.name, status: 'created' })
      } catch (e: any) {
        results.push({ name: item.name, status: 'error', error: e.message })
      }
    }
    reply.send({ imported: results.filter(r => r.status === 'created').length, skipped: results.filter(r => r.status === 'skipped').length, errors: results.filter(r => r.status === 'error').length, results })
  })

  // ====== 别名 ======
  app.get('/admin/api/aliases', async (_req, reply) => {
    reply.send(store.getAliases())
  })

  app.post('/admin/api/aliases', async (request, reply) => {
    const body = request.body as any
    if (!body.alias || !body.target) {
      return reply.code(400).send(openAIError('alias and target are required', 'invalid_request_error', 'missing_fields'))
    }
    try {
      const alias = store.createAlias(body.alias, body.target)
      reply.code(201).send(alias)
    } catch (e: any) {
      reply.code(409).send(openAIError(e.message, 'internal_error', 'duplicate'))
    }
  })

  app.delete('/admin/api/aliases/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      store.deleteAlias(id)
      reply.code(204).send()
    } catch (e: any) {
      reply.code(404).send(openAIError(e.message, 'internal_error', 'not_found'))
    }
  })

  // ====== 隐藏模型 ======
  app.get('/admin/api/hidden-models', async (_req, reply) => {
    const slugs = store.getHiddenSlugs()
    reply.send(Array.from(slugs))
  })

  app.post('/admin/api/hidden-models', async (request, reply) => {
    const body = request.body as any
    if (!body.slug) {
      return reply.code(400).send(openAIError('slug is required', 'invalid_request_error', 'missing_fields'))
    }
    try {
      store.addHiddenModel(body.slug)
      reply.code(201).send({ slug: body.slug })
    } catch (e: any) {
      reply.code(409).send(openAIError(e.message, 'internal_error', 'duplicate'))
    }
  })

  app.delete('/admin/api/hidden-models/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    try {
      store.removeHiddenModel(slug)
      reply.code(204).send()
    } catch (e: any) {
      reply.code(404).send(openAIError(e.message, 'internal_error', 'not_found'))
    }
  })

  // ====== 设置 ======
  app.get('/admin/api/settings', async (_req, reply) => {
    reply.send({
      default_model: store.getSetting('default_model'),
    })
  })

  app.put('/admin/api/settings/:key', async (request, reply) => {
    const { key } = request.params as { key: string }
    const body = request.body as any
    store.setSetting(key, body.value ?? '')
    reply.send({ key, value: store.getSetting(key) })
  })

  // ====== 清洗规则 ======
  app.get('/admin/api/param-rules', async (_req, reply) => {
    reply.send(store.getParamRules())
  })

  app.post('/admin/api/param-rules', async (request, reply) => {
    const body = request.body as any
    if (!body.type || !body.param_name) {
      return reply.code(400).send(openAIError('type and param_name are required', 'invalid_request_error', 'missing_fields'))
    }
    try {
      const rule = store.createRule({
        type: body.type,
        param_name: body.param_name,
        action_json: body.action_json,
        priority: body.priority,
      })
      reply.code(201).send(rule)
    } catch (e: any) {
      reply.code(500).send(openAIError(e.message, 'internal_error', 'create_failed'))
    }
  })

  app.put('/admin/api/param-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as any
    try {
      const rule = store.updateRule(id, body)
      reply.send(rule)
    } catch (e: any) {
      const code = e.message.includes('not found') ? 404 : 500
      reply.code(code).send(openAIError(e.message, 'internal_error', code === 404 ? 'not_found' : 'update_failed'))
    }
  })

  app.delete('/admin/api/param-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      store.deleteRule(id)
      reply.code(204).send()
    } catch (e: any) {
      reply.code(404).send(openAIError(e.message, 'internal_error', 'not_found'))
    }
  })

  // ====== 上游模型列表 ======
  app.get('/admin/api/upstream-models', async (_req, reply) => {
    const accounts = store.getAccounts()
    if (accounts.length === 0) {
      return reply.send([])
    }
    const account = accounts[0]
    try {
      const response = await upstream.fetchMetadata(account.api_key, account.base_url)
      if (!response.ok) {
        return reply.send([])
      }
      const body = (await response.json()) as any
      const models = (body.models || []).map((m: any) => ({
        slug: m.slug,
        display_name: m.display_name,
        provider: m.provider,
      }))
      reply.send(models)
    } catch {
      reply.send([])
    }
  })

  // ====== 调用日志 ======
  app.get('/admin/api/logs', async (request, reply) => {
    const query = request.query as Record<string, string>
    const accountId = query.account_id
    const limit = parseInt(query.limit || '100', 10)
    const offset = parseInt(query.offset || '0', 10)
    const logs = store.getCallLogs({ account_id: accountId, limit, offset })
    const total = store.getCallLogCount(accountId)
    reply.send({ logs, total, limit, offset })
  })

  // ====== 统计 ======
  app.get('/admin/api/stats', async (_req, reply) => {
    reply.send(store.getStats())
  })

  // ====== 健康检查 ======
  app.get('/admin/api/health', async (_req, reply) => {
    const accounts = store.getAccounts()
    const results = await Promise.all(
      accounts.map(async (a) => {
        try {
          const response = await upstream.fetchMetadata(a.api_key, a.base_url)
          return { id: a.id, name: a.name, ok: response.ok, status: response.status }
        } catch (e: any) {
          return { id: a.id, name: a.name, ok: false, status: 0, error: e.message }
        }
      }),
    )
    reply.send(results)
  })
}

function maskApiKey(key: string): string {
  if (key.length <= 7) return '***'
  return `${key.slice(0, 3)}***${key.slice(-4)}`
}