import { describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.js"

async function createTestAccount(app: ReturnType<typeof createApp>) {
  await app.inject({
    method: 'POST',
    url: '/admin/api/accounts',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-key' },
    payload: { name: 'Test', api_key: 'kimchi-key', base_url: 'https://llm.example.test' },
  })
}

describe("stream proxy body", () => {
  it("returns upstream SSE body text to downstream clients", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n'
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream; charset=UTF-8" } })),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [], stream: true },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/event-stream")
    expect(response.headers["cache-control"]).toBe("no-cache, no-transform")
    expect(response.body).toBe(sse)
    await app.close()
  })

  it("does not forward upstream compression headers for streamed bodies", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n'
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () =>
        new Response(sse, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=UTF-8",
            "content-encoding": "br",
            "content-length": "9999",
          },
        }),
      ),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [], stream: true },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/event-stream")
    expect(response.headers["content-encoding"]).toBeUndefined()
    expect(response.headers["content-length"]).not.toBe("9999")
    expect(response.body).toBe(sse)
    await app.close()
  })

  it("logs streamed upstream response summaries without raw body by default", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const sse = [
      'data: {"choices":[{"delta":{"content":"hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\n")
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () =>
        new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream; charset=UTF-8" },
        }),
      ),
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [], stream: true },
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(sse)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.stream.end",
        chunkCount: expect.any(Number),
        byteLength: Buffer.byteLength(sse),
      }),
      "Kimchi upstream stream body completed",
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("rawBody")
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("rawChunk")
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("hello world")
    await app.close()
  })

  it("logs the complete streamed upstream body when raw response logging is enabled", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const sse = [
      'data: {"choices":[{"delta":{"content":"hello"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\n")
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () =>
        new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream; charset=UTF-8" },
        }),
      ),
      logger,
      logRawResponse: true,
    })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [], stream: true },
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(sse)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openai.proxy.stream.end",
        rawBody: sse,
        chunkCount: expect.any(Number),
        byteLength: Buffer.byteLength(sse),
      }),
      "Kimchi upstream stream body completed",
    )
    await app.close()
  })

  it("returns SSE body to a real HTTP client", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n'
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () =>
        new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream; charset=UTF-8" },
        }),
      ),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    await createTestAccount(app)
    await app.listen({ port: 0, host: "127.0.0.1" })
    const address = app.server.address()
    if (!address || typeof address === "string") throw new Error("unexpected server address")

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", messages: [], stream: true }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(await response.text()).toBe(sse)
    await app.close()
  })

})