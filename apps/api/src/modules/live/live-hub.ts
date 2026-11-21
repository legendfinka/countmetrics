import type { Redis } from "ioredis";
import {
  siteUpdateChannel,
  siteUpdateMessageSchema,
  type SiteUpdateMessage,
} from "@countmetrics/shared";

export type UpdateListener = (message: SiteUpdateMessage) => void;

/**
 * Shares one Redis subscriber between all WebSocket viewers.
 * A site's channel is subscribed when its first viewer arrives
 * and unsubscribed when the last one leaves.
 */
export function createLiveHub(subscriber: Redis) {
  const listeners = new Map<string, Set<UpdateListener>>();

  subscriber.on("message", (channel, raw) => {
    const channelListeners = listeners.get(channel);
    if (!channelListeners) return;

    let message: SiteUpdateMessage;
    try {
      message = siteUpdateMessageSchema.parse(JSON.parse(raw));
    } catch {
      // Not a message from our worker. Ignore it.
      return;
    }
    for (const listener of channelListeners) listener(message);
  });

  return {
    /** Returns a function that removes the listener again. */
    async subscribe(siteId: string, listener: UpdateListener): Promise<() => Promise<void>> {
      const channel = siteUpdateChannel(siteId);
      let channelListeners = listeners.get(channel);

      if (!channelListeners) {
        channelListeners = new Set();
        listeners.set(channel, channelListeners);
        try {
          await subscriber.subscribe(channel);
        } catch (err) {
          listeners.delete(channel);
          throw err;
        }
      }
      channelListeners.add(listener);

      return async () => {
        const current = listeners.get(channel);
        if (!current?.delete(listener)) return;
        if (current.size === 0) {
          listeners.delete(channel);
          await subscriber.unsubscribe(channel).catch(() => undefined);
        }
      };
    },

    async close(): Promise<void> {
      listeners.clear();
      await subscriber.quit().catch(() => undefined);
    },
  };
}

export type LiveHub = ReturnType<typeof createLiveHub>;
