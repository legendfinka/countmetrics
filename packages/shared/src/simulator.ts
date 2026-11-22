import { z } from "zod";

export const simulationStatusSchema = z.object({
  /** idle: can start. running: sending fake visitors. cooldown: wait before the next run. */
  state: z.enum(["idle", "running", "cooldown"]),
  /** Seconds until the running or cooldown state ends. 0 when idle. */
  secondsLeft: z.number().int().nonnegative(),
});

export type SimulationStatus = z.infer<typeof simulationStatusSchema>;
