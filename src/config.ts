export type Point = {
  x: number;
  y: number;
};

export type Rectangle = Point & {
  width: number;
  height: number;
};

export type MovingPlatform = Rectangle & {
  target: Point;
  speed: number;
};

export type CrumblePlatform = Rectangle & {
  delay: number;
  respawn: number;
};

export type ArrowTrap = Point & {
  direction: 'right' | 'down' | 'left' | 'up';
  interval: number;
  speed: number;
};

export type LevelDefinition = {
  version: 1;
  name: string;
  world: {
    width: number;
    height: number;
  };
  spawn: Point;
  finish: Rectangle;
  platforms: Rectangle[];
  hazards: Rectangle[];
  shards: Point[];
  movingPlatforms: MovingPlatform[];
  crumblePlatforms: CrumblePlatform[];
  arrowTraps: ArrowTrap[];
};

export const WORLD = {
  width: 3_000,
  height: 900,
  groundY: 760,
} as const;

export const PLAYER = {
  width: 26,
  height: 46,
  spawn: { x: 110, y: 700 },
  maxSpeed: 285,
  groundAcceleration: 2_100,
  airAcceleration: 1_350,
  groundFriction: 1_900,
  airFriction: 480,
  gravity: 1_550,
  maxFallSpeed: 760,
  jumpSpeed: 620,
  airJumpSpeed: 550,
  wallJumpSpeed: 560,
  wallJumpPush: 360,
  wallSlideSpeed: 170,
} as const;

export const FINISH_AREA: Rectangle = {
  x: 2_815,
  y: 500,
  width: 100,
  height: 260,
};

export const PLATFORMS: Rectangle[] = [
  { x: 0, y: 760, width: 510, height: 140 },
  { x: 600, y: 700, width: 210, height: 200 },
  { x: 890, y: 615, width: 210, height: 285 },
  { x: 1_170, y: 710, width: 140, height: 190 },
  { x: 1_400, y: 630, width: 240, height: 270 },
  { x: 1_730, y: 525, width: 160, height: 375 },
  { x: 1_990, y: 650, width: 240, height: 250 },
  { x: 2_320, y: 560, width: 150, height: 340 },
  { x: 2_560, y: 690, width: 440, height: 210 },
  { x: 300, y: 590, width: 130, height: 22 },
  { x: 690, y: 510, width: 120, height: 22 },
  { x: 1_000, y: 430, width: 150, height: 22 },
  { x: 1_290, y: 505, width: 120, height: 22 },
  { x: 1_550, y: 390, width: 120, height: 22 },
  { x: 1_870, y: 370, width: 140, height: 22 },
  { x: 2_180, y: 440, width: 130, height: 22 },
  { x: 2_470, y: 350, width: 160, height: 22 },
];

export const HAZARDS: Rectangle[] = [
  { x: 510, y: 738, width: 90, height: 22 },
  { x: 810, y: 738, width: 80, height: 22 },
  { x: 1_100, y: 738, width: 70, height: 22 },
  { x: 1_310, y: 738, width: 90, height: 22 },
  { x: 1_640, y: 738, width: 90, height: 22 },
  { x: 1_890, y: 738, width: 100, height: 22 },
  { x: 2_230, y: 738, width: 90, height: 22 },
  { x: 2_470, y: 738, width: 90, height: 22 },
];

export const SHARD_POSITIONS: Point[] = [
  { x: 365, y: 545 },
  { x: 700, y: 655 },
  { x: 750, y: 465 },
  { x: 1_055, y: 385 },
  { x: 1_235, y: 665 },
  { x: 1_345, y: 460 },
  { x: 1_585, y: 345 },
  { x: 1_810, y: 480 },
  { x: 1_935, y: 325 },
  { x: 2_180, y: 600 },
  { x: 2_250, y: 395 },
  { x: 2_520, y: 305 },
];

export const DEFAULT_LEVEL: LevelDefinition = {
  version: 1,
  name: 'The First Ascent',
  world: { width: WORLD.width, height: WORLD.height },
  spawn: { ...PLAYER.spawn },
  finish: { ...FINISH_AREA },
  platforms: PLATFORMS.map((platform) => ({ ...platform })),
  hazards: HAZARDS.map((hazard) => ({ ...hazard })),
  shards: SHARD_POSITIONS.map((shard) => ({ ...shard })),
  movingPlatforms: [
    {
      x: 1_300,
      y: 330,
      width: 120,
      height: 18,
      target: { x: 1_480, y: 270 },
      speed: 1.1,
    },
  ],
  crumblePlatforms: [
    {
      x: 2_050,
      y: 500,
      width: 110,
      height: 18,
      delay: 0.7,
      respawn: 2.5,
    },
  ],
  arrowTraps: [
    { x: 1_680, y: 485, direction: 'left', interval: 1.8, speed: 420 },
    { x: 2_500, y: 650, direction: 'right', interval: 2.2, speed: 390 },
  ],
};

export const COLORS = {
  sky: 0x12243b,
  farBuilding: 0x1a3551,
  block: 0x21364d,
  platform: 0x294159,
  edge: 0x38516a,
  acid: 0xc9fa49,
  white: 0xeef3e8,
  danger: 0xf06156,
} as const;
