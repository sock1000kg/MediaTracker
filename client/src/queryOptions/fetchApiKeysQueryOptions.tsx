import { getApiKeys } from "@/api/apiKey";
import type { ApiKey } from "@/types/main";
import type { UseQueryOptions } from "@tanstack/react-query";

export const fetchApiKeysQueryOptions = (): UseQueryOptions<ApiKey[], Error> => ({
    queryKey: ["apiKeys"],
    queryFn: getApiKeys,
    refetchOnMount: false
})