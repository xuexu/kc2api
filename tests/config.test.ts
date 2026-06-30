import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"

describe("loadConfig", () => {
  it("uses metadata as the default model list source", () => {
    const config = loadConfig({})

    expect(config.modelListSource).toBe("metadata")
  })

  it("allows OpenAI-compatible model list source via environment", () => {
    const config = loadConfig({ KIMCHI_MODEL_LIST_SOURCE: "openai" })

    expect(config.modelListSource).toBe("openai")
  })

  it("falls back to metadata for unknown model list source values", () => {
    const config = loadConfig({ KIMCHI_MODEL_LIST_SOURCE: "full" })

    expect(config.modelListSource).toBe("metadata")
  })
})
