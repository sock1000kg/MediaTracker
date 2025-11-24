import { fetchMediaTypes } from "@/api/mediaType"
import type { MediaType } from "@/types/mainTypes"
import type { UseQueryOptions } from "@tanstack/react-query"

export const fetchMediaTypesQueryOptions = (): UseQueryOptions<MediaType[], Error> => ({
    queryKey: ["mediaTypes"],
    queryFn: fetchMediaTypes,
    refetchOnMount: false,
})