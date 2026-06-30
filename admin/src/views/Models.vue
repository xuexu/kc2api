<template>
  <div>
    <div class="page-header">
      <h1>模型管理</h1>
    </div>

    <div class="tabs">
      <button :class="['tab', { active: tab === 'aliases' }]" @click="tab = 'aliases'">别名</button>
      <button :class="['tab', { active: tab === 'hidden' }]" @click="tab = 'hidden'">隐藏模型</button>
      <button :class="['tab', { active: tab === 'default' }]" @click="tab = 'default'">默认模型</button>
    </div>

    <!-- 别名 -->
    <div v-if="tab === 'aliases'">
      <div class="tab-header">
        <button class="btn-primary" @click="showAliasModal = true">+ 新建别名</button>
      </div>
      <table v-if="aliases.length" class="card">
        <thead><tr><th>别名</th><th>目标模型</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="a in aliases" :key="a.id">
            <td><code>{{ a.alias }}</code></td>
            <td>{{ a.target }}</td>
            <td><button class="btn-danger btn-sm" @click="deleteAlias(a)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">暂无别名</p>
    </div>

    <!-- 隐藏模型 -->
    <div v-if="tab === 'hidden'">
      <div class="tab-header">
        <span class="tab-hint">勾选以隐藏模型，/v1/models 将不再返回该模型</span>
      </div>
      <div class="model-list card">
        <label v-for="m in upstreamModels" :key="m.slug" class="model-item">
          <input type="checkbox" :checked="hiddenSet.has(m.slug)" @change="toggleHidden(m.slug)" />
          <span class="model-name">{{ m.display_name }}</span>
          <code class="model-slug">{{ m.slug }}</code>
        </label>
        <p v-if="upstreamModels.length === 0" class="empty-state">加载中...</p>
      </div>
    </div>

    <!-- 默认模型 -->
    <div v-if="tab === 'default'">
      <div class="tab-header">
        <span class="tab-hint">下游请求未指定 model 时，返回错误提示并建议此模型</span>
      </div>
      <div class="card" style="padding: 20px;">
        <div class="form-group">
          <label>默认模型</label>
          <select v-model="defaultModel">
            <option value="">-- 未设置 --</option>
            <optgroup label="上游模型">
              <option v-for="m in upstreamModels" :key="m.slug" :value="m.slug">{{ m.display_name }} ({{ m.slug }})</option>
            </optgroup>
            <optgroup v-if="aliases.length" label="别名">
              <option v-for="a in aliases" :key="a.id" :value="a.alias">{{ a.alias }}</option>
            </optgroup>
          </select>
        </div>
        <button class="btn-primary" @click="saveDefault" :disabled="saving">保存</button>
      </div>
    </div>

    <!-- 别名弹窗 -->
    <Modal :show="showAliasModal" title="新建别名" @close="showAliasModal = false" @confirm="createAlias" :loading="saving" confirm-text="创建">
      <div class="form-group">
        <label>别名 *</label>
        <input v-model="aliasForm.alias" placeholder="如：gpt-4" />
      </div>
      <div class="form-group">
        <label>目标模型 *</label>
        <select v-model="aliasForm.target">
          <option value="">-- 选择模型 --</option>
          <option v-for="m in upstreamModels" :key="m.slug" :value="m.slug">{{ m.display_name }} ({{ m.slug }})</option>
        </select>
      </div>
    </Modal>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'

const tab = ref<'aliases' | 'hidden' | 'default'>('aliases')
const aliases = ref<any[]>([])
const hiddenSet = ref<Set<string>>(new Set())
const upstreamModels = ref<any[]>([])
const defaultModel = ref('')
const saving = ref(false)
const showAliasModal = ref(false)
const aliasForm = ref({ alias: '', target: '' })
const toastRef = ref<InstanceType<typeof Toast>>()

onMounted(async () => {
  const [a, h, m, s] = await Promise.all([
    api.getAliases(), api.getHiddenModels(), api.getUpstreamModels(), api.getSettings(),
  ])
  aliases.value = a
  hiddenSet.value = new Set(h)
  upstreamModels.value = m
  defaultModel.value = s.default_model
})

async function createAlias() {
  saving.value = true
  try {
    await api.createAlias(aliasForm.value)
    aliases.value = await api.getAliases()
    showAliasModal.value = false
    aliasForm.value = { alias: '', target: '' }
    toastRef.value?.show('别名已创建')
  } catch (e: any) {
    toastRef.value?.show(e.message, 'error')
  }
  saving.value = false
}

async function deleteAlias(a: any) {
  await api.deleteAlias(a.id)
  aliases.value = await api.getAliases()
  toastRef.value?.show('已删除')
}

async function toggleHidden(slug: string) {
  if (hiddenSet.value.has(slug)) {
    await api.removeHiddenModel(slug)
    hiddenSet.value.delete(slug)
  } else {
    await api.addHiddenModel(slug)
    hiddenSet.value.add(slug)
  }
}

async function saveDefault() {
  saving.value = true
  await api.updateSetting('default_model', defaultModel.value)
  toastRef.value?.show('已保存')
  saving.value = false
}
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; }
.tabs { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid var(--color-border); }
.tab { padding: 10px 20px; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -2px; font-size: 14px; font-weight: 500; color: var(--color-text-secondary); border-radius: 0; }
.tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.tab-header { margin-bottom: 16px; }
.tab-hint { font-size: 13px; color: var(--color-text-secondary); }
.empty-state { text-align: center; padding: 32px; color: var(--color-text-secondary); }
.model-list { padding: 0; overflow: hidden; }
.model-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--color-border); cursor: pointer; }
.model-item:last-child { border-bottom: none; }
.model-item:hover { background: var(--color-bg); }
.model-name { font-weight: 500; }
.model-slug { font-size: 12px; color: var(--color-text-secondary); margin-left: auto; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
</style>