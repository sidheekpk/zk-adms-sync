import { logger } from '../utils/logger.js';

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, controller: ReadableStreamDefaultController) {
    this.clients.set(id, { id, controller, encoder: new TextEncoder() });
    logger.debug({ clientId: id, total: this.clients.size }, 'SSE client connected');
  }

  removeClient(id: string) {
    this.clients.delete(id);
    logger.debug({ clientId: id, total: this.clients.size }, 'SSE client disconnected');
  }

  broadcast(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(client.encoder.encode(message));
      } catch {
        this.clients.delete(id);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const sseManager = new SSEManager();
