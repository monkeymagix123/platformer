import {
  ArrowTrap,
  CrumblePlatform,
  DEFAULT_LEVEL,
  LevelDefinition,
  MovingPlatform,
  Point,
  Rectangle,
} from './config';

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
    movingPlatforms: readOptionalArray(value.movingPlatforms).map((item, index) =>
      readMovingPlatform(item, `movingPlatforms[${index}]`, world),
    ),
    crumblePlatforms: readOptionalArray(value.crumblePlatforms).map((item, index) =>
      readCrumblePlatform(item, `crumblePlatforms[${index}]`, world),
    ),
    arrowTraps: readOptionalArray(value.arrowTraps).map((item, index) =>
      readArrowTrap(item, `arrowTraps[${index}]`, world),
    ),
  };

  if (level.platforms.length === 0) {
    throw new Error('A level needs at least one platform.');
  }

  return level;
}

function readMovingPlatform(
  value: unknown,
  label: string,
  world: LevelDefinition['world'],
): MovingPlatform {
  const rectangle = readRectangle(value, label, world);
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);

  const target = isRecord(value.target)
    ? readPoint(value.target, `${label}.target`, world)
    : legacyMovingTarget(value, rectangle, label, world);

  return {
    ...rectangle,
    target,
    speed: clamp(readDecimal(value.speed, `${label}.speed`), 0.1, 5),
  };
}

function legacyMovingTarget(
  value: Record<string, unknown>,
  rectangle: Rectangle,
  label: string,
  world: LevelDefinition['world'],
): Point {
  const distance = clamp(
    readNumber(value.distance, `${label}.distance`),
    20,
    2_000,
  );

  return {
    x: clamp(rectangle.x + (value.axis === 'y' ? 0 : distance), 0, world.width),
    y: clamp(rectangle.y + (value.axis === 'y' ? distance : 0), 0, world.height),
  };
}

function readCrumblePlatform(
  value: unknown,
  label: string,
  world: LevelDefinition['world'],
): CrumblePlatform {
  const rectangle = readRectangle(value, label, world);
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);

  return {
    ...rectangle,
    delay: clamp(readDecimal(value.delay, `${label}.delay`), 0.1, 10),
    respawn: clamp(readDecimal(value.respawn, `${label}.respawn`), 0.2, 30),
  };
}

function readArrowTrap(
  value: unknown,
  label: string,
  world: LevelDefinition['world'],
): ArrowTrap {
  const point = readPoint(value, label, world);
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);

  return {
    ...point,
    direction: value.direction === 'left' ? 'left' : 'right',
    interval: clamp(readDecimal(value.interval, `${label}.interval`), 0.25, 20),
    speed: clamp(readNumber(value.speed, `${label}.speed`), 80, 1_500),
  };
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

function readOptionalArray(value: unknown): unknown[] {
  return value === undefined ? [] : readArray(value, 'mechanic');
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return Math.round(value);
}

function readDecimal(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
