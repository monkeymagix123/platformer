import { DEFAULT_LEVEL, LevelDefinition, Point, Rectangle } from './config';

export function cloneLevel(level: LevelDefinition): LevelDefinition {
  return JSON.parse(JSON.stringify(level)) as LevelDefinition;
}

export function exportLevelJson(level: LevelDefinition): string {
  return JSON.stringify(level, null, 2);
}

export function exportLevelBase64(level: LevelDefinition): string {
  const bytes = new TextEncoder().encode(exportLevelJson(level));
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function importLevel(source: string): LevelDefinition {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('Paste JSON or Base64 level data first.');

  const json = trimmed.startsWith('{') ? trimmed : decodeBase64(trimmed);
  return validateLevel(JSON.parse(json) as unknown);
}

function decodeBase64(value: string): string {
  try {
    const binary = atob(value.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error('The value is neither valid JSON nor valid Base64.');
  }
}

export function validateLevel(value: unknown): LevelDefinition {
  if (!isRecord(value)) throw new Error('A level must be a JSON object.');

  const world = readWorld(value.world);
  const level: LevelDefinition = {
    version: 1,
    name: typeof value.name === 'string' && value.name.trim()
      ? value.name.trim().slice(0, 80)
      : 'Untitled Level',
    world,
    spawn: readPoint(value.spawn, 'spawn', world),
    finish: readRectangle(value.finish, 'finish', world),
    platforms: readArray(value.platforms, 'platforms').map((item, index) =>
      readRectangle(item, `platforms[${index}]`, world),
    ),
    hazards: readArray(value.hazards, 'hazards').map((item, index) =>
      readRectangle(item, `hazards[${index}]`, world),
    ),
    shards: readArray(value.shards, 'shards').map((item, index) =>
      readPoint(item, `shards[${index}]`, world),
    ),
  };

  if (level.platforms.length === 0) {
    throw new Error('A level needs at least one platform.');
  }

  return level;
}

function readWorld(value: unknown): LevelDefinition['world'] {
  if (!isRecord(value)) return { ...DEFAULT_LEVEL.world };

  return {
    width: clamp(readNumber(value.width, 'world.width'), 800, 10_000),
    height: clamp(readNumber(value.height, 'world.height'), 500, 2_000),
  };
}

function readPoint(
  value: unknown,
  label: string,
  world: LevelDefinition['world'],
): Point {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);

  return {
    x: clamp(readNumber(value.x, `${label}.x`), 0, world.width),
    y: clamp(readNumber(value.y, `${label}.y`), 0, world.height),
  };
}

function readRectangle(
  value: unknown,
  label: string,
  world: LevelDefinition['world'],
): Rectangle {
  const point = readPoint(value, label, world);
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);

  return {
    ...point,
    width: clamp(readNumber(value.width, `${label}.width`), 10, world.width),
    height: clamp(readNumber(value.height, `${label}.height`), 10, world.height),
  };
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return Math.round(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
