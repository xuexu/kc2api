import type { KimchiModelMetadata, OpenAIModelList } from "./types.js"

function isActiveModel(model: KimchiModelMetadata): boolean {
  return model.status !== "sunset" && model.limits.max_output_tokens > 0
}

export function kimchiMetadataToOpenAIModels(models: KimchiModelMetadata[]): OpenAIModelList {
  return {
    object: "list",
    data: models.filter(isActiveModel).map((model) => ({
      id: model.slug,
      object: "model" as const,
      created: 0,
      owned_by: model.provider || "kimchi",
    })),
  }
}
