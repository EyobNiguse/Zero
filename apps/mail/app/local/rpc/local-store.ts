// localStorage-backed stores for browser-only user data: settings, templates, per-thread notes.
import { defaultUserSettings, type UserSettings } from '@zero/server/schemas';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

const SETTINGS_KEY = 'local.settings';
const TEMPLATES_KEY = 'local.templates';
const NOTES_KEY = 'local.notes';

/** Everything the user authored locally. Sign-out keeps this; deleting the account must not. */
export function clearAll(): void {
  if (typeof window === 'undefined') return;
  for (const key of [SETTINGS_KEY, TEMPLATES_KEY, NOTES_KEY]) localStorage.removeItem(key);
}

// --- settings (singleton) ---
export function getSettings(): UserSettings {
  return { ...defaultUserSettings, ...read<Partial<UserSettings>>(SETTINGS_KEY, {}) };
}
export function saveSettings(patch: Partial<UserSettings>): UserSettings {
  const next = { ...getSettings(), ...patch };
  write(SETTINGS_KEY, next);
  return next;
}

// --- templates ---
export interface LocalTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  createdAt: string;
}
export function listTemplates(): LocalTemplate[] {
  return read<LocalTemplate[]>(TEMPLATES_KEY, []);
}
export function createTemplate(
  input: Omit<LocalTemplate, 'id' | 'createdAt'>,
  now: string,
): LocalTemplate {
  const template: LocalTemplate = { ...input, id: crypto.randomUUID(), createdAt: now };
  write(TEMPLATES_KEY, [...listTemplates(), template]);
  return template;
}
export function deleteTemplate(id: string): void {
  write(TEMPLATES_KEY, listTemplates().filter((t) => t.id !== id));
}

// --- notes (per thread) ---
export interface LocalNote {
  id: string;
  threadId: string;
  content: string;
  color: string;
  isPinned: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}
function allNotes(): LocalNote[] {
  return read<LocalNote[]>(NOTES_KEY, []);
}
export function getThreadNotes(threadId: string): LocalNote[] {
  return allNotes()
    .filter((n) => n.threadId === threadId)
    .sort((a, b) => a.order - b.order);
}
export function createNote(
  input: { threadId: string; content: string; color: string; isPinned: boolean },
  now: string,
): LocalNote {
  const notes = allNotes();
  const order = getThreadNotes(input.threadId).length;
  const note: LocalNote = { ...input, id: crypto.randomUUID(), order, createdAt: now, updatedAt: now };
  write(NOTES_KEY, [...notes, note]);
  return note;
}
export function updateNote(noteId: string, data: Partial<LocalNote>, now: string): LocalNote | null {
  const notes = allNotes();
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return null;
  notes[idx] = { ...notes[idx], ...data, id: noteId, updatedAt: now };
  write(NOTES_KEY, notes);
  return notes[idx];
}
export function deleteNote(noteId: string): boolean {
  const notes = allNotes();
  const next = notes.filter((n) => n.id !== noteId);
  write(NOTES_KEY, next);
  return next.length !== notes.length;
}
export function reorderNotes(order: { id: string; order: number; isPinned?: boolean | null }[]): boolean {
  const notes = allNotes();
  const byId = new Map(order.map((o) => [o.id, o]));
  for (const n of notes) {
    const o = byId.get(n.id);
    if (o) {
      n.order = o.order;
      if (o.isPinned != null) n.isPinned = o.isPinned;
    }
  }
  write(NOTES_KEY, notes);
  return true;
}
