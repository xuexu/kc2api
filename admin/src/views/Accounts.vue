<template>
  <div>
    <div class="page-header">
      <h1>账号管理</h1>
      <button class="btn-primary" @click="openCreate">+ 新建账号</button>
    </div>

    <div v-if="accounts.length === 0" class="empty-state">
      <p>暂无账号，点击上方按钮添加。</p>
    </div>

    <table v-else class="card">
      <thead>
        <tr><th>名称</th><th>API Key</th><th>Base URL</th><th>权重</th><th>标签</th><th>状态</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="acc in accounts" :key="acc.id">
          <td><strong>{{ acc.name }}</strong></td>
          <td><code>{{ acc.api_key }}</code></td>
          <td class="url-cell">{{ acc.base_url }}</td>
          <td>{{ acc.weight }}</td>
          <td><span v-for="tag in acc.tags" :key="tag" class="badge badge-gray tag">{{ tag }}</span></td>
          <td><StatusBadge :status="getStatus(acc)" /></td>
          <td class="actions">
            <button class="btn-secondary btn-sm" @click="openEdit(acc)">编辑</button>
            <button class="btn-secondary btn-sm" @click="testAccount(acc)">检测</button>
            <button class="btn-danger btn-sm" @click="confirmDelete(acc)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Modal :show="showModal" :title="editing ? '编辑账号' : '新建账号'" @close="showModal = false" @confirm="save" :loading="saving" confirm-text="保存">
      <div class="form-group">
        <label>名称 *</label>
        <input v-model="form.name" placeholder="如：主账号" />
      </div>
      <div class="form-group">
        <label>API Key *</label>
        <input v-model="form.api_key" type="password" placeholder="sk-..." />
      </div>
      <div class="form-group">
        <label>Base URL</label>
        <input v-model="form.base_url" placeholder="https://llm.kimchi.dev" />
      </div>
      <div class="form-group">
        <label>权重 (0=禁用, 1-100)</label>
        <input v-model.number="form.weight" type="number" min="0" max="100" />
      </div>
      <div class="form-group">
        <label>标签 (逗号分隔)</label>
        <input v-model="tagInput" placeholder="production, us-east" />
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
import StatusBadge from '../components/StatusBadge.vue'

const accounts = ref<any[]>([])
const showModal = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const toastRef = ref<InstanceType<typeof Toast>>()

const form = ref({ name: '', api_key: '', base_url: 'https://llm.kimchi.dev', weight: 1, tags: [] as string[] })
const tagInput = ref('')

onMounted(async () => { accounts.value = await api.getAccounts() })

function getStatus(acc: any): 'ok' | 'error' | 'cooldown' | 'disabled' {
  if (acc.weight === 0) return 'disabled'
  if (acc.cooldown_until && new Date(acc.cooldown_until).getTime() > Date.now()) return 'cooldown'
  return 'ok'
}

function openCreate() {
  editing.value = null
  form.value = { name: '', api_key: '', base_url: 'https://llm.kimchi.dev', weight: 1, tags: [] }
  tagInput.value = ''
  showModal.value = true
}

function openEdit(acc: any) {
  editing.value = acc
  form.value = { name: acc.name, api_key: '', base_url: acc.base_url, weight: acc.weight, tags: acc.tags }
  tagInput.value = acc.tags.join(', ')
  showModal.value = true
}

async function save() {
  saving.value = true
  try {
    const payload: any = {
      name: form.value.name,
      base_url: form.value.base_url,
      weight: form.value.weight,
      tags: tagInput.value.split(',').map((t: string) => t.trim()).filter(Boolean),
    }
    if (form.value.api_key) payload.api_key = form.value.api_key
    if (editing.value) {
      if (!payload.api_key) delete payload.api_key
      await api.updateAccount(editing.value.id, payload)
    } else {
      await api.createAccount(payload)
    }
    showModal.value = false
    accounts.value = await api.getAccounts()
    toastRef.value?.show('保存成功')
  } catch (e: any) {
    toastRef.value?.show(e.message, 'error')
  }
  saving.value = false
}

async function confirmDelete(acc: any) {
  if (!confirm(`确定删除账号「${acc.name}」？`)) return
  await api.deleteAccount(acc.id)
  accounts.value = await api.getAccounts()
  toastRef.value?.show('已删除')
}

async function testAccount(acc: any) {
  const r = await api.testAccount(acc.id)
  toastRef.value?.show(r.ok ? '连接成功' : `连接失败: ${r.error || r.status}`, r.ok ? 'success' : 'error')
}
</script>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; }
.empty-state { text-align: center; padding: 48px; color: var(--color-text-secondary); }
.url-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 6px; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.tag { margin-right: 4px; }
</style>