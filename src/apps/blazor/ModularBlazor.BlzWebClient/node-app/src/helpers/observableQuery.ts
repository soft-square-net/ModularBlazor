// src/helpers/observableQuery.ts
import { liveQuery } from 'dexie'
import { useObservable } from '@vueuse/rxjs'
import type { Ref } from 'vue'

// Function to enable reactive data retrieval from the database
// https://dexie.org/docs/liveQuery()
// https://vueuse.org/rxjs/useObservable/
export default <T>(
  query: () => Promise<T>,
): Readonly<Ref<T>> => {
  return useObservable(liveQuery(query) as any) as Readonly<Ref<T>>
}