import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import Accounts from './views/Accounts.vue'
import Models from './views/Models.vue'
import ParamRules from './views/ParamRules.vue'
import Logs from './views/Logs.vue'
import Playground from './views/Playground.vue'
import Settings from './views/Settings.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard },
    { path: '/accounts', component: Accounts },
    { path: '/models', component: Models },
    { path: '/params', component: ParamRules },
    { path: '/logs', component: Logs },
    { path: '/playground', component: Playground },
    { path: '/settings', component: Settings },
  ],
})