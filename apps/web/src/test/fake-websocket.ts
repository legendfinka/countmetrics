type Handler<T> = ((event: T) => void) | null;

/** A WebSocket that does nothing by itself. Tests control it with open(), receive() and serverClose(). */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  /** Messages the app sent (already parsed) */
  sent: unknown[] = [];
  closedByApp = false;
  onopen: Handler<unknown> = null;
  onmessage: Handler<{ data: string }> = null;
  onclose: Handler<{ code: number }> = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closedByApp = true;
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

/** The newest socket the app opened. React StrictMode opens two, and closes the first. */
export function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("The app has not opened a WebSocket");
  return socket;
}
