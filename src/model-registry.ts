import type { ConfigStore } from './config-store.js'
import type { KimchiModelMetadata, OpenAIModel, OpenAIModelList } from './types.js'

function isActiveModel(model: KimchiModelMetadata): boolean {
  return model.status !== 'sunset' && model.limits.max_output_tokens > 0
}

export class ModelRegistry {
  private store: ConfigStore

  constructor(store: ConfigStore) {
    this.store = store
  }

  enhanceModelList(kimchiModels: KimchiModelMetadata[]): OpenAIModelList {
    const hiddenSlugs = this.store.getHiddenSlugs()
    const aliases = this.store.getAliases()

    const models: OpenAIModel[] = kimchiModels
      .filter(m => isActiveModel(m) && !hiddenSlugs.has(m.slug))
      .map(m => ({
        id: m.slug,
        object: 'model' as const,
        created: 0,
        owned_by: m.provider || 'kimchi',
      }))

    for (const alias of aliases) {
      models.push({
        id: alias.alias,
        object: 'model' as const,
        created: 0,
        owned_by: 'alias',
      })
    }

    return { object: 'list', data: models }
  }

  enhanceOpenAIModelList(upstreamModels: OpenAIModelList): OpenAIModelList {
    const hiddenSlugs = this.store.getHiddenSlugs()
    const aliases = this.store.getAliases()
    const seen = new Set<string>()

    const models: OpenAIModel[] = []
    for (const model of upstreamModels.data) {
      if (!model?.id || hiddenSlugs.has(model.id) || seen.has(model.id)) continue
      seen.add(model.id)
      models.push({
        id: model.id,
        object: 'model',
        created: typeof model.created === 'number' ? model.created : 0,
        owned_by: model.owned_by || 'kimchi',
      })
    }

    for (const alias of aliases) {
      if (hiddenSlugs.has(alias.alias) || seen.has(alias.alias)) continue
      seen.add(alias.alias)
      models.push({
        id: alias.alias,
        object: 'model',
        created: 0,
        owned_by: 'alias',
      })
    }

    return { object: 'list', data: models }
  }

  resolveModel(modelName: string): string {
    return this.store.resolveAlias(modelName)
  }

  checkDefaultModel(modelName: string | undefined): { valid: boolean; error?: string } {
    if (modelName && modelName.trim().length > 0) return { valid: true }

    const defaultModel = this.store.getSetting('default_model')
    if (defaultModel) {
      return { valid: false, error: `model is required, e.g. "${defaultModel}"` }
    }
    return { valid: false, error: 'model is required' }
  }
}
