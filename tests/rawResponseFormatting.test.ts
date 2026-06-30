import { describe, expect, it } from "vitest"
import { renderPlaygroundHtml } from "../src/playground.js"

describe("playground raw response formatting", () => {
  it("contains helpers for pretty raw responses and upstream error surfacing", () => {
    const html = renderPlaygroundHtml()

    expect(html).toContain("formatRawResponse")
    expect(html).toContain("formatSseForDisplay")
    expect(html).toContain("surfaceUpstreamError")
    expect(html).toContain("上游错误")
    expect(html).toContain("复制 Raw Response")
    expect(html).toContain("copyRaw")
  })
})
