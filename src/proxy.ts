import type { FastifyReply } from "fastify"
import type { LoggerLike } from "./types.js"

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

export interface UpstreamResponseLogContext {
  logger?: LoggerLike
  eventBase?: Record<string, unknown>
  logRawResponse?: boolean
}

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cache_tokens: number
}

function extractUsageFromJson(obj: unknown): TokenUsage | null {
  if (!obj || typeof obj !== 'object') return null
  const body = obj as Record<string, unknown>
  const usage = (body.usage || (body.choices as any)?.[0]?.usage) as Record<string, unknown> | undefined
  if (!usage) return null
  return {
    prompt_tokens: (usage.prompt_tokens as number) ?? 0,
    completion_tokens: (usage.completion_tokens as number) ?? 0,
    total_tokens: (usage.total_tokens as number) ?? 0,
    cache_tokens: ((usage.prompt_tokens_details as any)?.cached_tokens as number)
      ?? (usage.cache_read_input_tokens as number)
      ?? (usage.cache_creation_input_tokens as number)
      ?? 0,
  }
}

function previewText(text: string, maxLength = 800): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

async function writeLoggedSseToRawReply(
  reply: FastifyReply,
  body: ReadableStream<Uint8Array>,
  context?: UpstreamResponseLogContext,
): Promise<TokenUsage | null> {
  const chunks: Buffer[] = []
  let chunkCount = 0
  let byteLength = 0
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let usageFromStream: TokenUsage | null = null

  await new Promise<void>((resolve, reject) => {
    reply.raw.on("finish", () => {
      context?.logger?.info(
        {
          ...context.eventBase,
          event: "openai.proxy.downstream.finish",
          chunkCount,
          byteLength,
        },
        "Kimchi downstream stream finished",
      )
    })
    reply.raw.on("close", () => {
      context?.logger?.info(
        {
          ...context.eventBase,
          event: "openai.proxy.downstream.close",
          chunkCount,
          byteLength,
        },
        "Kimchi downstream stream closed",
      )
    })

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const buffer = Buffer.from(value)
          chunks.push(buffer)
          chunkCount += 1
          byteLength += buffer.byteLength

          // 尝试从 SSE 数据中提取 usage
          const text = decoder.decode(buffer)
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6))
                const u = extractUsageFromJson(parsed)
                if (u && u.total_tokens > 0) usageFromStream = u
              } catch { /* ignore */ }
            }
          }

          context?.logger?.info(
            {
              ...context.eventBase,
              event: "openai.proxy.stream.chunk",
              chunkCount,
              byteLength,
              ...(context.logRawResponse ? { rawChunk: decoder.decode(buffer) } : {}),
            },
            "Kimchi upstream stream body chunk",
          )

          if (!reply.raw.write(buffer)) {
            await new Promise<void>((drainResolve) => reply.raw.once("drain", drainResolve))
          }
        }

        const rawBody = Buffer.concat(chunks).toString("utf-8")
        context?.logger?.info(
          {
            ...context.eventBase,
            event: "openai.proxy.stream.end",
            chunkCount,
            byteLength,
            ...(context.logRawResponse ? { rawBody } : {}),
          },
          "Kimchi upstream stream body completed",
        )
        reply.raw.end()
        resolve()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        context?.logger?.error(
          {
            ...context.eventBase,
            event: "openai.proxy.stream.exception",
            chunkCount,
            byteLength,
            error: message,
          },
          "Kimchi upstream stream body failed",
        )
        reply.raw.destroy(error instanceof Error ? error : new Error(message))
        reject(error)
      } finally {
        reader.releaseLock()
      }
    }

    void pump()
  })

  return usageFromStream
}

export async function sendUpstreamResponse(
  reply: FastifyReply,
  upstream: Response,
  context?: UpstreamResponseLogContext,
): Promise<TokenUsage | null> {
  if (!upstream.body) {
    reply.code(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) reply.header(key, value)
    })
    reply.send()
    return null
  }

  const contentType = upstream.headers.get("content-type") || ""
  if (contentType.includes("text/event-stream")) {
    reply.hijack()
    reply.raw.statusCode = upstream.status
    if (upstream.statusText) reply.raw.statusMessage = upstream.statusText
    upstream.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      if (!HOP_BY_HOP_HEADERS.has(lowerKey) && lowerKey !== "content-type") {
        reply.raw.setHeader(key, value)
      }
    })
    reply.raw.setHeader("content-type", contentType)
    reply.raw.setHeader("cache-control", "no-cache, no-transform")
    reply.raw.setHeader("x-accel-buffering", "no")
    return await writeLoggedSseToRawReply(reply, upstream.body, context)
  }

  reply.code(upstream.status)
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) reply.header(key, value)
  })
  const buffer = Buffer.from(await upstream.arrayBuffer())
  const rawBody = buffer.toString("utf-8")
  context?.logger?.info(
    {
      ...context.eventBase,
      event: "openai.proxy.body",
      byteLength: buffer.byteLength,
      ...(upstream.ok ? {} : { bodyPreview: previewText(rawBody) }),
      ...(context?.logRawResponse ? { rawBody } : {}),
    },
    "Kimchi upstream response body",
  )
  reply.send(buffer)

  // 非流式响应提取 usage
  try {
    const body = JSON.parse(rawBody)
    return extractUsageFromJson(body)
  } catch {
    return null
  }
}
