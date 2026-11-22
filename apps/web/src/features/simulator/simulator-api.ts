import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { simulationStatusSchema } from "@countmetrics/shared";
import { api } from "../../lib/api";

const statusKey = (siteId: string) => ["simulation", siteId] as const;

export const useSimulationStatus = (siteId: string) =>
  useQuery({
    queryKey: statusKey(siteId),
    queryFn: () => api(`/api/sites/${siteId}/simulate`, { schema: simulationStatusSchema }),
  });

export function useStartSimulation(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/sites/${siteId}/simulate`, { method: "POST", schema: simulationStatusSchema }),
    onSuccess: (status) => queryClient.setQueryData(statusKey(siteId), status),
    // "Already running" or "wait a moment": ask the server what is going on
    onError: () => void queryClient.invalidateQueries({ queryKey: statusKey(siteId) }),
  });
}
