// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FetchRequest, IngestResource, ParseRequest, ParseResponse } from '@/lib/types'

// --- Ingest ---
export function useParseIngest() {
  return useMutation<ParseResponse, Error, ParseRequest>({
    mutationFn: async (body) => (await api.post<ParseResponse>('/ingest/parse', body)).data,
  })
}

export function useFetchIngest() {
  return useMutation<IngestResource, Error, FetchRequest>({
    mutationFn: async (body) => (await api.post<IngestResource>('/ingest/fetch', body)).data,
  })
}
