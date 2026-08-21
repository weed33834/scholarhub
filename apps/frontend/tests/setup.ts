import '@testing-library/jest-dom/vitest'

// Node >= 24 暴露了一个残缺的内置 localStorage（缺少 clear 等方法），
// 在 vitest jsdom 环境中会遮蔽 jsdom 自带的 Web Storage 实现，
// 导致依赖 localStorage.clear() 的测试抛 TypeError。
// 这里用规范兼容的内存实现替换两个 storage 全局，保证跨 Node 版本一致。
function installMemoryStorage(name: 'localStorage' | 'sessionStorage'): void {
  const existing = globalThis[name] as Storage | undefined
  if (existing && typeof existing.clear === 'function') return

  const store = new Map<string, string>()
  const shim: Storage = {
    get length(): number {
      return store.size
    },
    key(index: number): string | null {
      return [...store.keys()][index] ?? null
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value))
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    clear(): void {
      store.clear()
    },
  }
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: shim,
  })
}

installMemoryStorage('localStorage')
installMemoryStorage('sessionStorage')
