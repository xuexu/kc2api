export type KimchiInputModality = "text" | "image"

export interface KimchiModelMetadata {
  slug: string
  display_name: string
  provider: string
  reasoning: boolean
  input_modalities: KimchiInputModality[]
  is_serverless: boolean
  limits: {
    context_window: number
    max_output_tokens: number
  }
  status?: "active" | "sunset" | "deprecated"
  replacement?: string
}

export interface KimchiModelsMetadataResponse {
  models: KimchiModelMetadata[]
}

export interface OpenAIModel {
  id: string
  object: "model"
  created: number
  owned_by: string
}

export interface OpenAIModelList {
  object: "list"
  data: OpenAIModel[]
}

export type ModelListSource = 'metadata' | 'openai'

// ========== 方案 B 新增类型 ==========

export interface Account {
  id: string
  name: string
  api_key: string
  base_url: string
  weight: number
  tags: string[]
  fail_count: number
  cooldown_until: string | null
  created_at: string
  updated_at: string
}

export interface CreateAccountInput {
  name: string
  api_key: string
  base_url?: string
  weight?: number
  tags?: string[]
}

export interface ModelAlias {
  id: string
  alias: string
  target: string
  created_at: string
}

export interface ParamRule {
  id: string
  type: 'strip' | 'normalize' | 'inject'
  param_name: string
  action_json: Record<string, unknown>
  priority: number
  enabled: boolean
  created_at: string
}

export interface CreateParamRuleInput {
  type: 'strip' | 'normalize' | 'inject'
  param_name: string
  action_json?: Record<string, unknown>
  priority?: number
}

export interface CallLog {
  id: string
  account_id: string
  account_name: string
  method: string
  path: string
  model: string | null
  status_code: number
  elapsed_ms: number
  total_tokens: number
  prompt_tokens: number
  completion_tokens: number
  cache_tokens: number
  created_at: string
}

export interface RelayConfig {
  port: number
  host: string
  adminApiKey: string
  publicApiKey?: string
  requestTimeoutMs: number
  logRawResponse: boolean
  modelListSource: ModelListSource
  dbPath: string
  kimchiUserAgent?: string
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface LoggerLike {
  info: (data: Record<string, unknown>, message: string) => void
  warn: (data: Record<string, unknown>, message: string) => void
  error: (data: Record<string, unknown>, message: string) => void
}

export interface CreateAppOptions {
  adminApiKey: string
  publicApiKey?: string
  requestTimeoutMs?: number
  logRawResponse?: boolean
  modelListSource?: ModelListSource
  dbPath?: string
  kimchiUserAgent?: string
  fetchImpl?: FetchLike
  logger?: LoggerLike
}
