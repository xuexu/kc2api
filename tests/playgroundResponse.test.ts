import { describe, expect, it } from "vitest"
import { renderPlaygroundHtml } from "../src/playground.js"

describe("playground response visibility", () => {
  it("contains robust stream buffering and response summary markers", () => {
    const html = renderPlaygroundHtml()

    expect(html).toContain("let streamBuffer")
    expect(html).toContain("processSseEvent")
    expect(html).toContain("Raw Response / 调试响应")
    expect(html).toContain("renderAssistantOutput")
  })
})
