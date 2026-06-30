import { describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.js"

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
}

async function createTestAccount(app: ReturnType<typeof createApp>, baseUrl = "https://llm.example.test") {
  await app.inject({
    method: 'POST',
    url: '/admin/api/accounts',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-key' },
    payload: { name: 'Test', api_key: 'super-secret-kimchi-key', base_url: baseUrl },
  })
}

describe("model diagnostics logging", () => {
  it("logs metadata model list request URL, upstream status, elapsed time, and model count by default", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
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
        ],
      }),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "GET", url: "/v1/models" })

    expect(response.statusCode).toBe(200)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "models.metadata.request",
        url: "https://llm.example.test/v1/models/metadata?include_in_cli=true",
      }),
      "Fetching Kimchi model metadata",
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "models.metadata.response",
        status: 200,
        ok: true,
        modelCount: 1,
        openAIModelCount: 1,
        elapsedMs: expect.any(Number),
      }),
      "Fetched Kimchi model metadata",
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("super-secret-kimchi-key")
    await app.close()
  })

  it("logs OpenAI-compatible model list diagnostics when configured", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
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
      logger,
      modelListSource: "openai",
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "GET", url: "/v1/models" })

    expect(response.statusCode).toBe(200)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "models.openai.request",
        url: "https://llm.example.test/openai/v1/models",
      }),
      "Fetching Kimchi OpenAI-compatible model list",
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "models.openai.response",
        status: 200,
        ok: true,
        modelCount: 2,
        elapsedMs: expect.any(Number),
      }),
      "Fetched Kimchi OpenAI-compatible model list",
    )
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("super-secret-kimchi-key")
    await app.close()
  })

  it("logs upstream error status and response body preview without leaking authorization", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "bad api key" } }, { status: 401, statusText: "Unauthorized" }),
    )
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: fetchMock,
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "GET", url: "/v1/models" })

    expect(response.statusCode).toBe(401)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "models.metadata.upstream_error",
        status: 401,
        statusText: "Unauthorized",
        bodyPreview: expect.stringContaining("bad api key"),
        elapsedMs: expect.any(Number),
      }),
      "Kimchi model metadata request returned non-OK status",
    )
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("super-secret-kimchi-key")
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("Authorization")
    await app.close()
  })

  it("logs network failures while fetching model metadata", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const app = createApp({
      adminApiKey: "test-admin-key",
      dbPath: ":memory:",
      fetchImpl: vi.fn(async () => {
        throw new Error("ENOTFOUND llm.kimchi.dev")
      }),
      logger,
    })
    await createTestAccount(app)

    const response = await app.inject({ method: "GET", url: "/v1/models" })

    expect(response.statusCode).toBe(502)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "models.metadata.exception",
        error: "ENOTFOUND llm.kimchi.dev",
        elapsedMs: expect.any(Number),
      }),
      "Kimchi model metadata request failed",
    )
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("super-secret-kimchi-key")
    await app.close()
  })
})
