import { describe, expect, it } from "vitest"
import { renderPlaygroundHtml } from "../src/playground.js"

describe("playground broad stream parsing", () => {
  it("contains extractors for common non-choices streaming payload shapes", () => {
    const html = renderPlaygroundHtml()

    expect(html).toContain("extractTextFromContentParts")
    expect(html).toContain("parsed.delta?.text")
    expect(html).toContain("parsed.content_block_delta")
    expect(html).toContain("parsed.type === \"response.output_text.delta\"")
    expect(html).toContain("parsed.data?.choices")
    expect(html).toContain("streamJsonEvents")
    expect(html).toContain("未解析到标准文本字段")
  })
})
