import type { MikkeState } from "./types";
import { emptyState } from "./types";

const KEY = "mikke:v1";

export function loadState(): MikkeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...emptyState };
    const parsed = JSON.parse(raw) as Partial<MikkeState>;
    return { ...emptyState, ...parsed };
  } catch {
    return { ...emptyState };
  }
}

export function saveState(state: MikkeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — ignore, MVP has no fallback
  }
}

export function resetState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
