import { normalizeBaseUrl } from './config.js'
import type { FetchLike } from './types.js'

const DEFAULT_KIMCHI_USER_AGENT = 'kimchi/0.1.52'

export interface UpstreamClientOptions {
  requestTimeoutMs?: number
  kimchiUserAgent?: string
  fetchImpl?: FetchLike
}

export class UpstreamClient {
  private readonly timeoutMs: number
  private readonly userAgent: string
  private readonly fetchImpl: FetchLike

  constructor(options: UpstreamClientOptions = {}) {
    this.timeoutMs = options.requestTimeoutMs ?? 120000
    this.userAgent = options.kimchiUserAgent?.trim() || DEFAULT_KIMCHI_USER_AGENT
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  metadataUrl(baseUrl: string): string {
    return `${normalizeBaseUrl(baseUrl)}/v1/models/metadata?include_in_cli=true`
  }

  openAIModelsUrl(baseUrl: string): string {
    return `${normalizeBaseUrl(baseUrl)}/openai/v1/models`
  }

  openAIUrl(baseUrl: string, path: string): string {
    const cleanPath = path.replace(/^\/+/, '')
    const withoutV1 = cleanPath.startsWith('v1/') ? cleanPath.slice(3) : cleanPath
    return `${normalizeBaseUrl(baseUrl)}/openai/v1/${withoutV1}`
  }

  async fetchMetadata(apiKey: string, baseUrl: string): Promise<Response> {
    return this.fetchImpl(this.metadataUrl(baseUrl), {
      method: 'GET',
      headers: this.headers(apiKey),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
  }

  async fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<Response> {
    return this.fetchImpl(this.openAIModelsUrl(baseUrl), {
      method: 'GET',
      headers: this.headers(apiKey),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
  }

  async forward(
    apiKey: string,
    baseUrl: string,
    method: string,
    path: string,
    body: string | undefined,
    contentType?: string,
  ): Promise<Response> {
    return this.fetchImpl(this.openAIUrl(baseUrl, path), {
      method,
      headers: this.headers(apiKey, contentType),
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    })
  }

  private headers(apiKey: string, contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json, text/event-stream',
      'User-Agent': this.userAgent,
    }
    if (contentType) headers['content-type'] = contentType
    return headers
  }
}
