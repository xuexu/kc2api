import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import Accounts from './views/Accounts.vue'
import Models from './views/Models.vue'
import ParamRules from './views/ParamRules.vue'
import Logs from './views/Logs.vue'
import Playground from './views/Playground.vue'
import Login from './views/Login.vue'
import Settings from './views/Settings.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', component: Login, meta: { public: true } },
    { path: '/dashboard', component: Dashboard },
    { path: '/accounts', component: Accounts },
    { path: '/models', component: Models },
    { path: '/params', component: ParamRules },
    { path: '/logs', component: Logs },
    { path: '/playground', component: Playground },
    { path: '/settings', component: Settings },
  ],
})

router.beforeEach(async (to, _from, next) => {
  // 公开页面直接放行
  if (to.meta.public) return next()

  const key = localStorage.getItem('admin_api_key')
  if (!key) return next('/login')

  // 验证密钥是否有效
  try {
    const res = await fetch('/admin/api/accounts', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.status === 401) {
      localStorage.removeItem('admin_api_key')
      return next('/login')
    }
    next()
  } catch {
    next()
  }
})