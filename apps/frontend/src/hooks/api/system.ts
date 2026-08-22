// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type { HealthResponse, ModuleInfo } from '@/lib/types'

// --- Modules + Health ---
export function useModules() {
  return useQuery<ModuleInfo[]>({
    queryKey: keys.modules(),
    queryFn: async () => (await api.get<ModuleInfo[]>('/modules')).data,
    staleTime: 5 * 60_000,
  })
}

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: keys.health(),
    queryFn: async () => (await api.get<HealthResponse>('/health')).data,
    staleTime: 30_000,
  })
}
