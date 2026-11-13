import { LevelDefinition } from './config';
import { cloneLevel, exportLevelBase64, importLevel } from './level-format';

const STORAGE_KEY = 'skybound-level-library-v1';

export type SavedLevel = {
  id: string;
  name: string;
  updatedAt: number;
  level: LevelDefinition;
};

type StoredLevel = Omit<SavedLevel, 'level'> & {
  code: string;
};

export function listSavedLevels(): SavedLevel[] {
  const stored = readStorage();
  const valid: SavedLevel[] = [];

  for (const item of stored) {
    try {
      valid.push({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt,
        level: importLevel(item.code),
      });
    } catch {
      // Ignore corrupted entries without preventing other levels from loading.
    }
  }

  return valid.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveLevel(
  level: LevelDefinition,
  existingId: string | null,
): SavedLevel {
  const stored = readStorage();
  const id = existingId ?? crypto.randomUUID();
  const saved: StoredLevel = {
    id,
    name: level.name,
    updatedAt: Date.now(),
    code: exportLevelBase64(level),
  };
  const existingIndex = stored.findIndex((item) => item.id === id);

  if (existingIndex >= 0) stored[existingIndex] = saved;
  else stored.push(saved);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  return {
    id,
    name: saved.name,
    updatedAt: saved.updatedAt,
    level: cloneLevel(level),
  };
}

export function deleteSavedLevel(id: string): void {
  const remaining = readStorage().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}

function readStorage(): StoredLevel[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];

    return value.filter(isStoredLevel);
  } catch {
    return [];
  }
}

function isStoredLevel(value: unknown): value is StoredLevel {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<StoredLevel>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.updatedAt === 'number' &&
    typeof item.code === 'string'
  );
}
