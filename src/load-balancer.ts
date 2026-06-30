import type { ConfigStore } from './config-store.js'
import type { Account } from './types.js'

export class LoadBalancer {
  private store: ConfigStore
  private currentIndex = 0
  private currentWeight = 0

  constructor(store: ConfigStore) {
    this.store = store
  }

  selectAccount(): Account | null {
    const accounts = this.store.getAccounts()
    const available = accounts.filter(a => this.isAvailable(a))

    if (available.length === 0) return null

    const totalWeight = available.reduce((sum, a) => sum + a.weight, 0)
    if (totalWeight === 0) return null

    // GCD-based weighted round-robin
    while (true) {
      this.currentIndex = (this.currentIndex + 1) % available.length
      if (this.currentIndex === 0) {
        this.currentWeight = this.currentWeight - 1
        if (this.currentWeight <= 0) {
          this.currentWeight = this.maxWeight(available)
          if (this.currentWeight === 0) return null
        }
      }
      if (available[this.currentIndex].weight >= this.currentWeight) {
        return available[this.currentIndex]
      }
    }
  }

  markSuccess(account: Account): void {
    this.store.recordAccountSuccess(account.id)
  }

  markFailure(account: Account): void {
    this.store.recordAccountFailure(account.id)
  }

  private isAvailable(account: Account): boolean {
    if (account.weight <= 0) return false
    if (account.cooldown_until) {
      if (new Date(account.cooldown_until).getTime() > Date.now()) return false
    }
    return true
  }

  private maxWeight(accounts: Account[]): number {
    let max = 0
    for (const a of accounts) {
      if (a.weight > max) max = a.weight
    }
    return max
  }
}