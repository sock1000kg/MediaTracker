import { fetchMedias } from "@/api/media"
import type { Media } from "@/types/main"
import type { UseQueryOptions } from "@tanstack/react-query"

export const fetchMediasQueryOptions = (): UseQueryOptions<Media[], Error> => ({
    queryKey: ["medias"],
    queryFn: fetchMedias,
    refetchOnMount: false,
})