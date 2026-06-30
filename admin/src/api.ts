const BASE = '/admin/api'

function getAuthHeaders(): Record<string, string> {
  const key = localStorage.getItem('admin_api_key') || ''
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return data as T
}

export const api = {
  getAccounts: () => request<any[]>('GET', '/accounts'),
  createAccount: (data: any) => request<any>('POST', '/accounts', data),
  updateAccount: (id: string, data: any) => request<any>('PUT', `/accounts/${id}`, data),
  deleteAccount: (id: string) => request<any>('DELETE', `/accounts/${id}`),
  testAccount: (id: string) => request<any>('POST', `/accounts/${id}/test`),

  getAliases: () => request<any[]>('GET', '/aliases'),
  createAlias: (data: any) => request<any>('POST', '/aliases', data),
  deleteAlias: (id: string) => request<any>('DELETE', `/aliases/${id}`),

  getHiddenModels: () => request<string[]>('GET', '/hidden-models'),
  addHiddenModel: (slug: string) => request<any>('POST', '/hidden-models', { slug }),
  removeHiddenModel: (slug: string) => request<any>('DELETE', `/hidden-models/${slug}`),

  getSettings: () => request<any>('GET', '/settings'),
  updateSetting: (key: string, value: string) => request<any>('PUT', `/settings/${key}`, { value }),

  getParamRules: () => request<any[]>('GET', '/param-rules'),
  createParamRule: (data: any) => request<any>('POST', '/param-rules', data),
  updateParamRule: (id: string, data: any) => request<any>('PUT', `/param-rules/${id}`, data),
  deleteParamRule: (id: string) => request<any>('DELETE', `/param-rules/${id}`),

  getUpstreamModels: () => request<any[]>('GET', '/upstream-models'),
  getHealth: () => request<any[]>('GET', '/health'),
}