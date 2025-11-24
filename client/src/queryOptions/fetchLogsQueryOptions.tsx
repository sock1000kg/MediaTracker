import { fetchLogs } from "@/api/logs"
import type { Log } from "@/types/mainTypes"
import type { UseQueryOptions } from "@tanstack/react-query"

export const fetchLogsQueryOptions = (): UseQueryOptions<Log[], Error> => ({
    queryKey: ["logs"],
    queryFn: fetchLogs,
    refetchOnMount: false
})