import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import Database from 'better-sqlite3'
import { authenticateDownstream, openAIError } from './auth.js'
import { sendUpstreamResponse } from './proxy.js'
import { renderPlaygroundHtml } from './playground.js'
import { registerAdminRoutes } from './admin-routes.js'
import { ConfigStore, runMigrations } from './config-store.js'
import { LoadBalancer } from './load-balancer.js'
import { ModelRegistry } from './model-registry.js'
import { ParamCleaner } from './param-cleaner.js'
import type { CreateAppOptions, KimchiModelsMetadataResponse, LoggerLike, OpenAIModelList } from './types.js'
import { UpstreamClient } from './upstream.js'
import { existsSync } from 'fs'
import { resolve } from 'path'

const consoleLogger: LoggerLike = {
  info: (data, message) => console.log(`${message} ${JSON.stringify(data)}`),
  warn: (data, message) => console.warn(`${message} ${JSON.stringify(data)}`),
  error: (data, message) => console.error(`${message} ${JSON.stringify(data)}`),
}

function stringifyPayload(payload: unknown): string | undefined {
  if (payload === undefined || payload === null) return undefined
  if (typeof payload === 'string') return payload
  if (Buffer.isBuffer(payload)) return payload.toString('utf-8')
  return JSON.stringify(payload)
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}

function previewText(text: string, maxLength = 800): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)
}

function normalizeKimchiModelId(model: unknown): string | undefined {
  if (typeof model !== 'string') return undefined
  const trimmed = model.trim()
  return trimmed.startsWith('kimchi-dev/') ? trimmed.slice('kimchi-dev/'.length) : trimmed
}

function mergeKimchiTags(existing: unknown, model: string | undefined): string[] | undefined {
  const tags: string[] = []
  if (model) tags.push(`model:${model}`)
  tags.push('phase:relay')
  if (Array.isArray(existing)) {
    for (const tag of existing) {
      if (typeof tag === 'string' && tag.trim()) tags.push(tag.trim())
    }
  }
  const unique = [...new Set(tags)]
  return unique.length > 0 ? unique : undefined
}

function prepareOpenAICompatiblePayload(payload: unknown): unknown {
  if (!isPlainRecord(payload)) return payload
  const normalizedModel = normalizeKimchiModelId(payload.model)
  if (!normalizedModel) return payload
  return {
    ...payload,
    model: normalizedModel,
    tags: mergeKimchiTags(payload.tags, normalizedModel),
  }
}

function summarizeChatPayload(payload: unknown): Record<string, unknown> {
  if (!isPlainRecord(payload)) return { bodyType: typeof payload }
  return {
    model: typeof payload.model === 'string' ? payload.model : undefined,
    stream: typeof payload.stream === 'boolean' ? payload.stream : undefined,
    messageCount: Array.isArray(payload.messages) ? payload.messages.length : undefined,
    maxTokens: payload.max_tokens,
    temperature: payload.temperature,
    tags: Array.isArray(payload.tags) ? payload.tags : undefined,
  }
}

export function createApp(options: CreateAppOptions): FastifyInstance {
  const app = Fastify({ logger: false })
  const upstream = new UpstreamClient({
    requestTimeoutMs: options.requestTimeoutMs,
    kimchiUserAgent: options.kimchiUserAgent,
    fetchImpl: options.fetchImpl,
  })
  const logger = options.logger ?? consoleLogger
  const modelListSource = options.modelListSource ?? 'metadata'

  // 初始化 SQLite
  const dbPath = options.dbPath ?? './kimchi2api.db'
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  runMigrations(db)

  const store = new ConfigStore(db)
  const loadBalancer = new LoadBalancer(store)
  const modelRegistry = new ModelRegistry(store)
  const paramCleaner = new ParamCleaner(store)

  app.register(cors, { origin: true })

  // 静态文件托管管理前端
  const adminDist = resolve('dist/admin')
  if (existsSync(adminDist)) {
    app.register(fastifyStatic, {
      root: adminDist,
      prefix: '/admin/',
      decorateReply: false,
    })
  }

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/' || request.url === '/playground' || request.url === '/health') return
    if (request.url === '/admin' || request.url.startsWith('/admin/')) return
    authenticateDownstream(request, reply, options.publicApiKey, options.adminApiKey)
  })

  app.get('/', async (_request, reply) => {
    reply.redirect('/playground', 302)
  })

  app.get('/admin', async (_request, reply) => {
    reply.redirect('/admin/', 302)
  })

  app.get('/playground', async (_request, reply) => {
    reply.type('text/html; charset=utf-8').send(renderPlaygroundHtml())
  })

  app.get('/health', async () => ({ ok: true }))

  // 注册管理 API
  registerAdminRoutes(app, store, upstream, options.adminApiKey, logger)

  // ====== 增强的 /v1/models ======
  app.get('/v1/models', async (_request, reply) => {
    const startedAt = performance.now()

    const account = loadBalancer.selectAccount()
    if (!account) {
      reply.code(502).send(openAIError('No available upstream account', 'upstream_error', 'no_available_account'))
      return
    }

    if (modelListSource === 'openai') {
      const modelsUrl = upstream.openAIModelsUrl(account.base_url)
      logger.info(
        { event: 'models.openai.request', url: modelsUrl, account: account.name },
        'Fetching Kimchi OpenAI-compatible model list',
      )
      try {
        const response = await upstream.fetchOpenAIModels(account.api_key, account.base_url)
        if (!response.ok) {
          const bodyPreview = previewText(await response.text())
          logger.warn(
            {
              event: 'models.openai.upstream_error',
              url: modelsUrl,
              status: response.status,
              statusText: response.statusText,
              bodyPreview,
              elapsedMs: elapsedSince(startedAt),
            },
            'Kimchi OpenAI-compatible model list request returned non-OK status',
          )
          reply.code(response.status).send(openAIError(`Kimchi upstream returned ${response.status}`, 'upstream_error', 'kimchi_upstream_error'))
          return
        }
        const body = (await response.json()) as OpenAIModelList
        if (!Array.isArray(body?.data)) {
          logger.warn(
            {
              event: 'models.openai.invalid_shape',
              url: modelsUrl,
              status: response.status,
              elapsedMs: elapsedSince(startedAt),
            },
            'Kimchi OpenAI-compatible model list response had invalid shape',
          )
          reply.code(502).send(openAIError('Kimchi upstream returned invalid model list', 'upstream_error', 'kimchi_upstream_error'))
          return
        }

        const openAIModels = modelRegistry.enhanceOpenAIModelList(body)
        logger.info(
          {
            event: 'models.openai.response',
            url: modelsUrl,
            status: response.status,
            ok: response.ok,
            modelCount: openAIModels.data.length,
            elapsedMs: elapsedSince(startedAt),
          },
          'Fetched Kimchi OpenAI-compatible model list',
        )
        reply.send(openAIModels)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(
          { event: 'models.openai.exception', url: modelsUrl, error: message, elapsedMs: elapsedSince(startedAt) },
          'Kimchi OpenAI-compatible model list request failed',
        )
        reply.code(502).send(openAIError(`Kimchi upstream request failed: ${message}`, 'upstream_error', 'kimchi_upstream_error'))
      }
      return
    }

    const modelsUrl = upstream.metadataUrl(account.base_url)
    logger.info(
      { event: 'models.metadata.request', url: modelsUrl, account: account.name },
      'Fetching Kimchi model metadata',
    )
    try {
      const response = await upstream.fetchMetadata(account.api_key, account.base_url)
      if (!response.ok) {
        const bodyPreview = previewText(await response.text())
        logger.warn(
          {
            event: 'models.metadata.upstream_error',
            url: modelsUrl,
            status: response.status,
            statusText: response.statusText,
            bodyPreview,
            elapsedMs: elapsedSince(startedAt),
          },
          'Kimchi model metadata request returned non-OK status',
        )
        reply.code(response.status).send(openAIError(`Kimchi upstream returned ${response.status}`, 'upstream_error', 'kimchi_upstream_error'))
        return
      }
      const body = (await response.json()) as KimchiModelsMetadataResponse
      if (!Array.isArray(body?.models)) {
        logger.warn(
          {
            event: 'models.metadata.invalid_shape',
            url: modelsUrl,
            status: response.status,
            elapsedMs: elapsedSince(startedAt),
          },
          'Kimchi model metadata response had invalid shape',
        )
        reply.code(502).send(openAIError('Kimchi upstream returned invalid model metadata', 'upstream_error', 'kimchi_upstream_error'))
        return
      }

      const openAIModels = modelRegistry.enhanceModelList(body.models)
      logger.info(
        {
          event: 'models.metadata.response',
          url: modelsUrl,
          status: response.status,
          ok: response.ok,
          modelCount: body.models.length,
          openAIModelCount: openAIModels.data.length,
          elapsedMs: elapsedSince(startedAt),
        },
        'Fetched Kimchi model metadata',
      )
      reply.send(openAIModels)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(
        { event: 'models.metadata.exception', url: modelsUrl, error: message, elapsedMs: elapsedSince(startedAt) },
        'Kimchi model metadata request failed',
      )
      reply.code(502).send(openAIError(`Kimchi upstream request failed: ${message}`, 'upstream_error', 'kimchi_upstream_error'))
    }
  })

  // ====== 增强的 /v1/* ======
  app.all('/v1/*', async (request, reply) => {
    const startedAt = performance.now()

    // 1. 别名解析
    let payload = request.body
    if (isPlainRecord(payload) && typeof payload.model === 'string') {
      const resolved = modelRegistry.resolveModel(payload.model)
      payload = { ...payload, model: resolved }
    }

    // 2. 默认模型检查
    const modelName = isPlainRecord(payload) && typeof payload.model === 'string' ? payload.model : undefined
    const check = modelRegistry.checkDefaultModel(modelName)
    if (!check.valid) {
      reply.code(400).send(openAIError(check.error!, 'invalid_request_error', 'model_required'))
      return
    }

    // 3. 参数清洗
    if (isPlainRecord(payload)) {
      payload = paramCleaner.clean(payload as Record<string, unknown>)
    }

    // 4. 准备 payload（兼容 Kimchi 格式）
    const preparedPayload = prepareOpenAICompatiblePayload(payload)

    // 5. 负载均衡选择账号
    const account = loadBalancer.selectAccount()
    if (!account) {
      reply.code(502).send(openAIError('No available upstream account', 'upstream_error', 'no_available_account'))
      return
    }

    const upstreamUrl = upstream.openAIUrl(account.base_url, request.url)
    try {
      logger.info(
        {
          event: 'openai.proxy.request',
          method: request.method,
          path: request.url,
          upstreamUrl,
          account: account.name,
          request: request.url.startsWith('/v1/chat/completions') ? summarizeChatPayload(preparedPayload) : undefined,
        },
        'Forwarding OpenAI-compatible request to Kimchi upstream',
      )
      const body = stringifyPayload(preparedPayload)
      const contentType = typeof request.headers['content-type'] === 'string' ? request.headers['content-type'] : 'application/json'
      const response = await upstream.forward(account.api_key, account.base_url, request.method, request.url, body, body === undefined ? undefined : contentType)

      const logPayload = {
        event: 'openai.proxy.response',
        method: request.method,
        path: request.url,
        upstreamUrl,
        account: account.name,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type') ?? '',
        elapsedMs: elapsedSince(startedAt),
      }
      if (response.ok) {
        logger.info(logPayload, 'Kimchi upstream returned OpenAI-compatible response')
        loadBalancer.markSuccess(account)
      } else {
        logger.warn(logPayload, 'Kimchi upstream returned non-OK OpenAI-compatible response')
        if (response.status >= 500) {
          loadBalancer.markFailure(account)
        }
      }

      // 记录调用日志
      const elapsed = elapsedSince(startedAt)
      let totalTokens = 0, promptTokens = 0, completionTokens = 0, cacheTokens = 0

      const usage = await sendUpstreamResponse(reply, response, {
        logger,
        eventBase: {
          method: request.method,
          path: request.url,
          upstreamUrl,
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
        },
        logRawResponse: options.logRawResponse === true,
      })
      if (usage) {
        totalTokens = usage.total_tokens
        promptTokens = usage.prompt_tokens
        completionTokens = usage.completion_tokens
        cacheTokens = usage.cache_tokens
      }

      store.insertCallLog({
        account_id: account.id,
        account_name: account.name,
        method: request.method,
        path: request.url,
        model: modelName ?? null,
        status_code: response.status,
        elapsed_ms: elapsed,
        total_tokens: totalTokens,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cache_tokens: cacheTokens,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      loadBalancer.markFailure(account)

      // 记录失败日志
      store.insertCallLog({
        account_id: account.id,
        account_name: account.name,
        method: request.method,
        path: request.url,
        model: modelName ?? null,
        status_code: 0,
        elapsed_ms: elapsedSince(startedAt),
        total_tokens: 0,
      })

      logger.error(
        {
          event: 'openai.proxy.exception',
          method: request.method,
          path: request.url,
          upstreamUrl,
          account: account.name,
          error: message,
          elapsedMs: elapsedSince(startedAt),
        },
        'Kimchi OpenAI-compatible upstream request failed',
      )
      reply.code(502).send(openAIError(`Kimchi upstream request failed: ${message}`, 'upstream_error', 'kimchi_upstream_error'))
    }
  })

  return app
}
