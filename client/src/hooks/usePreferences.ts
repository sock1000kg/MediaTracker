import { useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchMeQueryOptions } from "@/queryOptions/fetchMeQueryOptions"
import { updatePreferences } from "@/api/user"
import { mergePreferences } from "@/lib/preferences"
import type { Preferences, PreferencesPatch, UserProfile } from "@/types/user"

const EMPTY: Preferences = {}

export const PREFS_MUTATION_KEY = ["updatePreferences"] as const

export function usePreferences() {
  const queryClient = useQueryClient()
  const { data: me, isSuccess } = useQuery({ ...fetchMeQueryOptions(), retry: 1 })
  const prefs: Preferences = me?.preferences ?? EMPTY

  const mutation = useMutation({
    mutationKey: PREFS_MUTATION_KEY,
    mutationFn: (patch: PreferencesPatch) => updatePreferences(patch),
    onMutate: async (patch) => {
      // No cached `me` yet: don't cancel the in-flight fetch, and skip the optimistic update
      const previous = queryClient.getQueryData<UserProfile>(["me"])
      if (previous) {
        await queryClient.cancelQueries({ queryKey: ["me"] })
        queryClient.setQueryData<UserProfile>(["me"], {
          ...previous,
          preferences: mergePreferences(previous.preferences, patch),
        })
      }
      return { previous }
    },
    onError: (err, _patch, ctx) => {
      console.warn("Could not save preferences:", err instanceof Error ? err.message : err)
      if (ctx?.previous) queryClient.setQueryData(["me"], ctx.previous)
    },
    onSuccess: (serverPrefs) => {
      // If `me` isn't cached yet, onSettled's invalidation loads it (with these prefs)
      queryClient.setQueryData<UserProfile | undefined>(["me"], (old) =>
        old ? { ...old, preferences: serverPrefs } : old
      )
    },
    onSettled: (_data, error, _patch, ctx) => {
      if (error || !ctx?.previous) queryClient.invalidateQueries({ queryKey: ["me"] })
    },
  })

  const { mutate } = mutation
  const updatePrefs = useCallback((patch: PreferencesPatch) => mutate(patch), [mutate])

  return { prefs, isLoaded: isSuccess, updatePrefs }
}
