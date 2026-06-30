import { describe, expect, it } from "vitest"
import { kimchiMetadataToOpenAIModels } from "../src/openaiModels.js"
import type { KimchiModelMetadata } from "../src/types.js"

describe("kimchiMetadataToOpenAIModels", () => {
  it("converts active Kimchi metadata into OpenAI model list format", () => {
    const metadata: KimchiModelMetadata[] = [
      {
        slug: "anthropic/claude-sonnet-4",
        display_name: "Claude Sonnet 4",
        provider: "anthropic",
        reasoning: true,
        input_modalities: ["text", "image"],
        is_serverless: true,
        limits: { context_window: 200000, max_output_tokens: 8192 },
        status: "active",
      },
      {
        slug: "old/sunset",
        display_name: "Old Model",
        provider: "old-provider",
        reasoning: false,
        input_modalities: ["text"],
        is_serverless: true,
        limits: { context_window: 1000, max_output_tokens: 0 },
        status: "sunset",
      },
    ]

    expect(kimchiMetadataToOpenAIModels(metadata)).toEqual({
      object: "list",
      data: [
        {
          id: "anthropic/claude-sonnet-4",
          object: "model",
          created: 0,
          owned_by: "anthropic",
        },
      ],
    })
  })
})
