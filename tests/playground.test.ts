import { describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"

describe("model playground", () => {
  it("serves the playground HTML with model testing controls", async () => {
    const app = createApp({ adminApiKey: "test-admin-key", dbPath: ":memory:" })

    const response = await app.inject({ method: "GET", url: "/playground" })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-type"]).toContain("text/html")
    expect(response.body).toContain("Kimchi2API Model Playground")
    expect(response.body).toContain('id="model"')
    expect(response.body).toContain('id="send"')
    expect(response.body).toContain("/v1/models")
    expect(response.body).toContain("/v1/chat/completions")
    await app.close()
  })

  it("redirects the root page to the playground", async () => {
    const app = createApp({ adminApiKey: "test-admin-key", dbPath: ":memory:" })

    const response = await app.inject({ method: "GET", url: "/" })

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe("/playground")
    await app.close()
  })

  it("serves the playground page even when downstream API auth is enabled", async () => {
    const app = createApp({ adminApiKey: "test-admin-key", publicApiKey: "public-key", dbPath: ":memory:" })

    const playground = await app.inject({ method: "GET", url: "/playground" })
    const api = await app.inject({ method: "GET", url: "/v1/models" })

    expect(playground.statusCode).toBe(200)
    expect(api.statusCode).toBe(401)
    await app.close()
  })
})
