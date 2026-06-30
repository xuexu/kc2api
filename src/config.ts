import type { ModelListSource, RelayConfig } from './types.js'

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function readModelListSource(value: string | undefined): ModelListSource {
  return value?.trim().toLowerCase() === 'openai' ? 'openai' : 'metadata'
}

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  const value = baseUrl?.trim() || 'https://llm.kimchi.dev'
  return value.replace(/\/+$/, '')
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  return {
    port: readNumber(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    adminApiKey: env.ADMIN_API_KEY || 'changeme',
    publicApiKey: env.PUBLIC_API_KEY || undefined,
    requestTimeoutMs: readNumber(env.REQUEST_TIMEOUT_MS, 120000),
    logRawResponse: readBoolean(env.KIMCHI_LOG_RAW_RESPONSE),
    modelListSource: readModelListSource(env.KIMCHI_MODEL_LIST_SOURCE),
    dbPath: env.DB_PATH || './kimchi2api.db',
    kimchiUserAgent: env.KIMCHI_USER_AGENT || undefined,
  }
}
