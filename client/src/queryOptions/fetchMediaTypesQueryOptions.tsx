import { fetchMediaTypes } from "@/api/mediaType"
import type { MediaType } from "@/types/media"
import type { UseQueryOptions } from "@tanstack/react-query"

export const fetchMediaTypesQueryOptions = (): UseQueryOptions<MediaType[], Error> => ({
    queryKey: ["mediasTypes"],
    queryFn: fetchMediaTypes,
    refetchOnMount: false,
})