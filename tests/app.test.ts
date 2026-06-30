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
    payload: { name: 'Test', api_key: 'kimchi-key', base_url: 'https://llm.example.test' },
  })
}

describe("OpenAI-compatible app", () => {
  it("returns /v1/models from Kimchi metadata by default", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        models: [
          {
            slug: "deepseek-v4-flash",
            display_name: "DeepSeek V4 Flash",
            provider: "ai-enabler",
            reasoning: false,
            input_modalities: ["text"],
            is_serverless: true,
            limits: { context_window: 131072, max_output_tokens: 4096 },
          },
          {
            slug: "sunset-model",
            display_name: "Sunset",
            provider: "kimchi",
            reasoning: false,
            input_modalities: ["text"],
            is_serverless: true,
            limits: { context_window: 1, max_output_tokens: 0 },
          },
        ],
      }),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "GET", url: "/v1/models" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      object: "list",
      data: [
        { id: "deepseek-v4-flash", object: "model", created: 0, owned_by: "ai-enabler" },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://llm.example.test/v1/models/metadata?include_in_cli=true",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer kimchi-key" }),
      }),
    )
    await app.close()
  })

  it("can return /v1/models from the upstream OpenAI-compatible model list when configured", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: "deepseek-v4-flash", object: "model", created: 0, owned_by: "ai-enabler" },
          { id: "glm-5.2-fp8", object: "model", created: 0, owned_by: "ai-enabler" },
        ],
      }),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
      modelListSource: "openai",
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "GET", url: "/v1/models" })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      object: "list",
      data: [
        { id: "deepseek-v4-flash", object: "model", created: 0, owned_by: "ai-enabler" },
        { id: "glm-5.2-fp8", object: "model", created: 0, owned_by: "ai-enabler" },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://llm.example.test/openai/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer kimchi-key" }),
      }),
    )
    await app.close()
  })

  it("requires downstream bearer token when publicApiKey is configured", async () => {
    const app = createApp({
      adminApiKey: "test-admin-key",
      publicApiKey: "public-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(),
    })

    const rejected = await app.inject({ method: "GET", url: "/v1/models" })
    const accepted = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { authorization: "Bearer public-key" },
    })

    expect(rejected.statusCode).toBe(401)
    expect(rejected.json().error.type).toBe("authentication_error")
    // Without an account, accepted will be 502 (no available account)
    expect(accepted.statusCode).toBe(502)
    await app.close()
  })

  it("forwards chat completions to Kimchi OpenAI upstream", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: "chatcmpl_1", object: "chat.completion", choices: [] }),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
    })
    await createTestAccount(app)

    const body = { model: "openai/gpt-4.1", messages: [{ role: "user", content: "hi" }] }
    const response = await app.inject({ method: "POST", url: "/v1/chat/completions", payload: body })

    expect(response.statusCode).toBe(200)
    expect(response.json().id).toBe("chatcmpl_1")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://llm.example.test/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"model":"openai/gpt-4.1"'),
        headers: expect.objectContaining({
          Authorization: "Bearer kimchi-key",
          "content-type": "application/json",
          "User-Agent": expect.stringMatching(/^kimchi\//),
        }),
      }),
    )
    await app.close()
  })

  it("adds Kimchi CLI-compatible headers and tags to chat requests", async () => {
    let forwardedBody: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (_url, init) => {
      forwardedBody = JSON.parse(String(init?.body))
      return jsonResponse({ id: "chatcmpl_1", object: "chat.completion", choices: [] })
    })
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
    })
    await createTestAccount(app)

    await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "deepseek-v4-flash", messages: [{ role: "user", content: "hi" }], stream: true },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://llm.example.test/openai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.stringMatching(/^kimchi\//),
        }),
      }),
    )
    expect(forwardedBody?.tags).toEqual(expect.arrayContaining(["model:deepseek-v4-flash", "phase:relay"]))
    await app.close()
  })

  it("strips kimchi-dev model prefix before forwarding to the Kimchi OpenAI endpoint", async () => {
    let forwardedBody: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (_url, init) => {
      forwardedBody = JSON.parse(String(init?.body))
      return jsonResponse({ id: "chatcmpl_1", object: "chat.completion", choices: [] })
    })
    const app = createApp({ adminApiKey: "test-admin-key", dbPath: ":memory:", fetchImpl: fetchMock })
    await createTestAccount(app)

    await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "kimchi-dev/deepseek-v4-flash", messages: [] },
    })

    expect(forwardedBody?.model).toBe("deepseek-v4-flash")
    expect(forwardedBody?.tags).toEqual(expect.arrayContaining(["model:deepseek-v4-flash"]))
    await app.close()
  })

  it("proxies streaming responses without changing the event body", async () => {
    const streamBody = "data: {\"id\":\"chunk\"}\n\ndata: [DONE]\n\n"
    const fetchMock = vi.fn(async () =>
      new Response(streamBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    )
    const app = createApp({ adminApiKey: "test-admin-key", dbPath: ":memory:", fetchImpl: fetchMock })
    await createTestAccount(app)

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "m", messages: [], stream: true },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/event-stream")
    expect(response.body).toBe(streamBody)
    await app.close()
  })

  it("turns upstream network failures into OpenAI-style 502 errors", async () => {
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () => {
        throw new Error("ECONNRESET")
      }),
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "POST", url: "/v1/chat/completions", payload: { model: "m" } })

    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({
      error: {
        message: "Kimchi upstream request failed: ECONNRESET",
        type: "upstream_error",
        code: "kimchi_upstream_error",
      },
    })
    await app.close()
  })
})
