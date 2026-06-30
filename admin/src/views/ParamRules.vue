<template>
  <div>
    <div class="page-header">
      <h1>参数清洗</h1>
      <button class="btn-primary" @click="openCreate">+ 新建规则</button>
    </div>

    <div v-if="rules.length === 0" class="empty-state">
      <p>暂无清洗规则，点击上方按钮添加。</p>
    </div>

    <table v-else class="card">
      <thead>
        <tr><th>类型</th><th>参数名</th><th>操作详情</th><th>优先级</th><th>状态</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="rule in rules" :key="rule.id">
          <td><span :class="['badge', typeBadge(rule.type)]">{{ typeLabel(rule.type) }}</span></td>
          <td><code>{{ rule.param_name }}</code></td>
          <td class="detail-cell">{{ formatAction(rule) }}</td>
          <td>{{ rule.priority }}</td>
          <td><span v-if="rule.enabled" class="badge badge-green">启用</span><span v-else class="badge badge-gray">禁用</span></td>
          <td class="actions">
            <button class="btn-secondary btn-sm" @click="openEdit(rule)">编辑</button>
            <button class="btn-secondary btn-sm" @click="toggleRule(rule)">{{ rule.enabled ? '禁用' : '启用' }}</button>
            <button class="btn-danger btn-sm" @click="deleteRule(rule)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Modal :show="showModal" :title="editing ? '编辑规则' : '新建规则'" @close="showModal = false" @confirm="save" :loading="saving" confirm-text="保存">
      <div class="form-group">
        <label>类型 *</label>
        <select v-model="form.type">
          <option value="strip">剥离 (Strip)</option>
          <option value="normalize">规范化 (Normalize)</option>
          <option value="inject">注入 (Inject)</option>
        </select>
      </div>
      <div class="form-group">
        <label>参数名 *</label>
        <input v-model="form.param_name" placeholder="如：logit_bias" />
      </div>
      <div class="form-group">
        <label>优先级</label>
        <input v-model.number="form.priority" type="number" placeholder="0" />
      </div>
      <template v-if="form.type === 'normalize'">
        <div class="form-group">
          <label>值类型</label>
          <select v-model="normType">
            <option value="number">数字 (Number)</option>
            <option value="boolean">布尔 (Boolean)</option>
          </select>
        </div>
        <template v-if="normType === 'number'">
          <div class="form-row">
            <div class="form-group"><label>最小值</label><input v-model.number="normMin" type="number" placeholder="0" /></div>
            <div class="form-group"><label>最大值</label><input v-model.number="normMax" type="number" placeholder="2" /></div>
          </div>
        </template>
      </template>
      <template v-if="form.type === 'inject'">
        <div class="form-group">
          <label>注入值 (JSON)</label>
          <input v-model="injectValue" placeholder='如："phase:relay" 或 ["tag1","tag2"]' />
        </div>
      </template>
    </Modal>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'

const rules = ref<any[]>([])
const showModal = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const toastRef = ref<InstanceType<typeof Toast>>()

const form = ref({ type: 'strip' as string, param_name: '', priority: 0 })
const normType = ref('number')
const normMin = ref(0)
const normMax = ref(2)
const injectValue = ref('')

onMounted(async () => { rules.value = await api.getParamRules() })

function typeLabel(t: string) { return ({ strip: '剥离', normalize: '规范化', inject: '注入' } as any)[t] || t }
function typeBadge(t: string) { return ({ strip: 'badge-red', normalize: 'badge-yellow', inject: 'badge-green' } as any)[t] || 'badge-gray' }

function formatAction(rule: any): string {
  if (rule.type === 'strip') return '移除此参数'
  if (rule.type === 'normalize') {
    const a = rule.action_json
    return a.type === 'boolean' ? '强制转为布尔值' : `限制范围 [${a.min ?? '?'}, ${a.max ?? '?'}]`
  }
  if (rule.type === 'inject') return `注入: ${JSON.stringify(rule.action_json.value)}`
  return '-'
}

function openCreate() {
  editing.value = null
  form.value = { type: 'strip', param_name: '', priority: 0 }
  normType.value = 'number'; normMin.value = 0; normMax.value = 2; injectValue.value = ''
  showModal.value = true
}

function openEdit(rule: any) {
  editing.value = rule
  form.value = { type: rule.type, param_name: rule.param_name, priority: rule.priority }
  if (rule.type === 'normalize') {
    normType.value = rule.action_json.type || 'number'
    normMin.value = rule.action_json.min ?? 0; normMax.value = rule.action_json.max ?? 2
  }
  if (rule.type === 'inject') injectValue.value = JSON.stringify(rule.action_json.value)
  showModal.value = true
}

async function save() {
  saving.value = true
  try {
    let actionJson = {}
    if (form.value.type === 'normalize') {
      actionJson = normType.value === 'boolean' ? { type: 'boolean' } : { type: 'number', min: normMin.value, max: normMax.value }
    }
    if (form.value.type === 'inject') {
      try { actionJson = { value: JSON.parse(injectValue.value), condition: 'always' } } catch { actionJson = { value: injectValue.value, condition: 'always' } }
    }
    const payload = { ...form.value, action_json: actionJson }
    if (editing.value) { await api.updateParamRule(editing.value.id, payload) } else { await api.createParamRule(payload) }
    rules.value = await api.getParamRules()
    showModal.value = false
    toastRef.value?.show('保存成功')
  } catch (e: any) { toastRef.value?.show(e.message, 'error') }
  saving.value = false
}

async function toggleRule(rule: any) {
  await api.updateParamRule(rule.id, { enabled: !rule.enabled })
  rules.value = await api.getParamRules()
}

async function deleteRule(rule: any) {
  await api.deleteParamRule(rule.id)
  rules.value = await api.getParamRules()
  toastRef.value?.show('已删除')
}
</script>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; }
.empty-state { text-align: center; padding: 48px; color: var(--color-text-secondary); }
.detail-cell { max-width: 240px; font-size: 13px; color: var(--color-text-secondary); }
.actions { display: flex; gap: 6px; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }
</style>