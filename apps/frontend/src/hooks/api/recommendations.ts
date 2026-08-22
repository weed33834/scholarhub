// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type { RecommendationListResponse } from '@/lib/types'

// --- Recommendations ---
export function useMyRecommendations(limit = 10) {
  return useQuery<RecommendationListResponse>({
    queryKey: keys.recommendations.me(limit),
    queryFn: async () =>
      (await api.get<RecommendationListResponse>('/recommendations/me', {
        params: { limit },
      })).data,
  })
}
