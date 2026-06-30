import { describe, expect, it } from "vitest"
import { renderPlaygroundHtml } from "../src/playground.js"

describe("playground raw stream fallback", () => {
  it("contains fallback logic for non-JSON and whitespace-prefixed SSE data", () => {
    const html = renderPlaygroundHtml()

    expect(html).toContain("trimStart().startsWith(\"data:\")")
    expect(html).toContain("streamTextEvents")
    expect(html).toContain("looksLikeJson")
    expect(html).toContain("原始流内容")
  })
})
