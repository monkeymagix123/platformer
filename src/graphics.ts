import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  COLORS,
  FINISH_AREA,
  HAZARDS,
  PLATFORMS,
  Rectangle,
  WORLD,
} from './config';

export function createBackground(): Container {
  const background = new Container();

  background.addChild(
    new Graphics().rect(0, 0, WORLD.width, WORLD.height).fill(COLORS.sky),
  );

  addStars(background);
  addMoon(background);
  addSkyline(background);

  background.addChild(
    new Graphics()
      .rect(0, 570, WORLD.width, 230)
      .fill({ color: 0x0b1728, alpha: 0.28 }),
  );

  return background;
}

function addStars(background: Container): void {
  for (let index = 0; index < 42; index += 1) {
    const x = (index * 179) % WORLD.width;
    const y = 70 + ((index * 83) % 430);
    const radius = index % 5 === 0 ? 1.8 : 1;
    const alpha = 0.18 + (index % 4) * 0.09;

    background.addChild(
      new Graphics().circle(x, y, radius).fill({ color: 0xd9e8dd, alpha }),
    );
  }
}

function addMoon(background: Container): void {
  const moon = new Graphics()
    .circle(510, 245, 105)
    .fill({ color: 0xc8e2dc, alpha: 0.08 })
    .circle(510, 245, 72)
    .fill({ color: 0xd8eee8, alpha: 0.06 });

  background.addChild(moon);
}

function addSkyline(background: Container): void {
  for (let index = 0; index < 22; index += 1) {
    const x = index * 155 - 80;
    const height = 110 + ((index * 71) % 220);
    const top = WORLD.groundY - height;
    const tower = new Graphics()
      .rect(x, top, 120, height)
      .fill({ color: COLORS.farBuilding, alpha: 0.56 });

    for (let windowY = top + 24; windowY < WORLD.groundY - 15; windowY += 30) {
      for (let windowX = x + 20; windowX < x + 100; windowX += 28) {
        if ((windowX + windowY + index) % 3 > 1) {
          tower
            .rect(windowX, windowY, 5, 8)
            .fill({ color: 0x79a2aa, alpha: 0.14 });
        }
      }
    }

    background.addChild(tower);
  }
}

export function createTerrain(
  platforms: Rectangle[] = PLATFORMS,
  hazards: Rectangle[] = HAZARDS,
  finish: Rectangle = FINISH_AREA,
): Container {
  const terrain = new Container();

  platforms.forEach((platform, index) => {
    const isGroundPlatform = index < 9;
    const color = isGroundPlatform ? COLORS.block : COLORS.platform;
    const block = new Graphics()
      .rect(platform.x, platform.y, platform.width, platform.height)
      .fill(color)
      .rect(platform.x, platform.y, platform.width, 3)
      .fill({ color: COLORS.edge, alpha: 0.9 });

    if (isGroundPlatform) addBlockTexture(block, platform);
    terrain.addChild(block);
  });

  hazards.forEach((hazard) => terrain.addChild(createSpikes(hazard)));
  terrain.addChild(createBeacon(finish));

  return terrain;
}

function addBlockTexture(block: Graphics, platform: (typeof PLATFORMS)[number]): void {
  for (let x = platform.x + 18; x < platform.x + platform.width - 10; x += 34) {
    block
      .rect(x, platform.y + 18, 1, Math.min(72, platform.height - 25))
      .fill({ color: 0x3a5064, alpha: 0.22 });
  }
}

function createSpikes(hazard: (typeof HAZARDS)[number]): Graphics {
  const spikes = new Graphics();

  for (let x = hazard.x; x < hazard.x + hazard.width; x += 18) {
    spikes
      .poly([x, hazard.y + hazard.height, x + 9, hazard.y, x + 18, hazard.y + hazard.height])
      .fill({ color: COLORS.danger, alpha: 0.9 });
  }

  return spikes;
}

function createBeacon(finish: Rectangle): Container {
  const beacon = new Container();
  const centerX = finish.x + finish.width / 2;
  const baseY = finish.y + finish.height;
  const topY = finish.y + 25;
  const shape = new Graphics()
    .rect(centerX - 4, topY + 45, 8, Math.max(60, baseY - topY - 45))
    .fill(COLORS.acid)
    .poly([finish.x, topY + 45, centerX, topY, finish.x + finish.width, topY + 45])
    .stroke({ color: COLORS.acid, width: 4 })
    .circle(centerX, topY + 40, Math.max(36, finish.width * 0.62))
    .stroke({ color: COLORS.acid, width: 1, alpha: 0.3 });

  const sign = new Text({
    text: 'BEACON  →',
    style: new TextStyle({
      fontFamily: 'monospace',
      fontSize: 11,
      fill: 0x8193a5,
      letterSpacing: 2,
    }),
  });
  sign.position.set(finish.x - 155, baseY - 40);

  beacon.addChild(shape, sign);
  return beacon;
}

export function createPlayer(): { container: Container; scarf: Graphics } {
  const container = new Container();
  const scarf = new Graphics().rect(-18, -12, 10, 5).fill(COLORS.acid);
  const body = new Graphics()
    .roundRect(-13, -22, 26, 40, 4)
    .fill(COLORS.white)
    .rect(-10, -17, 20, 14)
    .fill(0x18283b)
    .rect(-7, -14, 4, 4)
    .fill(COLORS.acid)
    .rect(3, -14, 4, 4)
    .fill(COLORS.acid)
    .rect(-10, 18, 8, 7)
    .fill(0x98a6ae)
    .rect(2, 18, 8, 7)
    .fill(0x98a6ae);

  container.addChild(scarf, body);
  return { container, scarf };
}

export function createShard(): Graphics {
  return new Graphics()
    .poly([0, -12, 8, 0, 0, 12, -8, 0])
    .fill(COLORS.acid)
    .stroke({ color: 0xf0ffc0, width: 1 });
}
