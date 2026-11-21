import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { overviewSchema, siteSchema } from "@countmetrics/shared";
import { api } from "../../lib/api";

const sitesResponse = z.object({ sites: z.array(siteSchema) });
const siteResponse = z.object({ site: siteSchema });

export const useSites = () =>
  useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api("/api/sites", { schema: sitesResponse })).sites,
  });

export const useSite = (id: string) =>
  useQuery({
    queryKey: ["sites", id],
    queryFn: async () => (await api(`/api/sites/${id}`, { schema: siteResponse })).site,
  });

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (domain: string) =>
      (await api("/api/sites", { method: "POST", body: { domain }, schema: siteResponse })).site,
    onSuccess: (site) => {
      // The site page can show it right away
      queryClient.setQueryData(["sites", site.id], site);
      void queryClient.invalidateQueries({ queryKey: ["sites"], exact: true });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/sites/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: ["sites", id] });
      void queryClient.invalidateQueries({ queryKey: ["sites"], exact: true });
    },
  });
}

/** Asks every 3 seconds if the site got its first events (last 30 minutes). */
export const useSiteActivity = (id: string) =>
  useQuery({
    queryKey: ["overview", id],
    queryFn: () => api(`/api/sites/${id}/stats/overview?range=30m`, { schema: overviewSchema }),
    refetchInterval: 3000,
  });
