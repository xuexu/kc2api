import { describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.js"

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
}

async function createTestAccount(app: ReturnType<typeof createApp>) {
  await app.inject({
    method: 'POST',
    url: '/admin/api/accounts',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-key' },
    payload: { name: 'Test', api_key: 'super-secret-kimchi-key', base_url: 'https://llm.example.test' },
  })
}

describe("chat diagnostics logging", () => {
  it("logs chat completion upstream response status, content type, and elapsed time", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: "chatcmpl_1", choices: [{ message: { content: "hello" } }] }),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [{ role: "user", content: "hi" }] },
    })

    expect(response.statusCode).toBe(200)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.request",
        method: "POST",
        path: "/v1/chat/completions",
        upstreamUrl: "https://llm.example.test/openai/v1/chat/completions",
      }),
      "Forwarding OpenAI-compatible request to Kimchi upstream",
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.response",
        status: 200,
        ok: true,
        contentType: expect.stringContaining("application/json"),
        elapsedMs: expect.any(Number),
      }),
      "Kimchi upstream returned OpenAI-compatible response",
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("super-secret-kimchi-key")
    await app.close()
  })

  it("logs non-stream upstream response summaries without raw body by default", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: "chatcmpl_1", choices: [{ message: { content: "secret response text" } }] }),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [{ role: "user", content: "hi" }] },
    })

    expect(response.statusCode).toBe(200)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.body",
        byteLength: expect.any(Number),
      }),
      "Kimchi upstream response body",
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("rawBody")
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("secret response text")
    await app.close()
  })

  it("logs a body preview for non-OK non-stream upstream responses without raw body by default", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: "no registered providers found for the requested model" },
        { status: 400, statusText: "Bad Request" },
      ),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "glm-5.2-fp8", messages: [{ role: "user", content: "hi" }] },
    })

    expect(response.statusCode).toBe(400)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.body",
        byteLength: expect.any(Number),
        bodyPreview: expect.stringContaining("no registered providers"),
      }),
      "Kimchi upstream response body",
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("rawBody")
    await app.close()
  })

  it("logs complete non-stream upstream response body when raw response logging is enabled", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const body = { id: "chatcmpl_1", choices: [{ message: { content: "debug response text" } }] }
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
      logger,
      logRawResponse: true,
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [{ role: "user", content: "hi" }] },
    })

    expect(response.statusCode).toBe(200)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.body",
        byteLength: expect.any(Number),
        rawBody: JSON.stringify(body),
      }),
      "Kimchi upstream response body",
    )
    await app.close()
  })

  it("logs chat completion network failures", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () => {
        throw new Error("socket hang up")
      }),
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "POST", url: "/v1/chat/completions", payload: { model: "m" } })

    expect(response.statusCode).toBe(502)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.exception",
        path: "/v1/chat/completions",
        error: "socket hang up",
        elapsedMs: expect.any(Number),
      }),
      "Kimchi OpenAI-compatible upstream request failed",
    )
    await app.close()
  })
})
