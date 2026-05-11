/**
 * SessionStore: un Durable Object que mantiene un mapa token → userId.
 *
 * Por qué un DO y no un Map en memoria del Worker:
 * - Los Workers son efímeros: cada request puede ejecutarse en un nodo distinto.
 * - Un DO te garantiza UNA sola instancia globalmente consistente.
 * - El estado del DO sobrevive cold starts (se guarda en storage).
 *
 * Por qué no D1 para esto:
 * - Podríamos, pero un DO es más rápido para lecturas frecuentes (cada request
 *   autenticado tiene que validar el token). El storage del DO está in-memory
 *   con persistencia automática.
 */

import { DurableObject } from 'cloudflare:workers';

interface Session {
  userId: number;
  email: string;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

export class SessionStore extends DurableObject {
  async createSession(token: string, userId: number, email: string): Promise<void> {
    const now = Date.now();
    const session: Session = {
      userId,
      email,
      createdAt: now,
      expiresAt: now + TTL_MS,
    };
    await this.ctx.storage.put(token, session);
  }

  async getSession(token: string): Promise<Session | null> {
    const session = await this.ctx.storage.get<Session>(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      await this.ctx.storage.delete(token);
      return null;
    }
    return session;
  }

  async deleteSession(token: string): Promise<void> {
    await this.ctx.storage.delete(token);
  }

  async countActive(): Promise<number> {
    const all = await this.ctx.storage.list<Session>();
    let count = 0;
    const now = Date.now();
    for (const s of all.values()) {
      if (s.expiresAt > now) count++;
    }
    return count;
  }
}
