import { Container, Graphics } from 'pixi.js';
import {
  ArrowTrap,
  COLORS,
  CrumblePlatform,
  LevelDefinition,
  MovingPlatform,
  Rectangle,
} from './config';

type MovingRuntime = {
  definition: MovingPlatform;
  bounds: Rectangle;
  sprite: Graphics;
  time: number;
  deltaX: number;
  deltaY: number;
};

type CrumbleRuntime = {
  definition: CrumblePlatform;
  bounds: Rectangle;
  sprite: Graphics;
  state: 'idle' | 'warning' | 'gone';
  timer: number;
};

type TrapRuntime = {
  definition: ArrowTrap;
  timer: number;
};

type ArrowRuntime = {
  x: number;
  y: number;
  velocityX: number;
  sprite: Graphics;
};

export class MechanicsSystem {
  readonly layer = new Container();

  private readonly movingPlatforms: MovingRuntime[] = [];
  private readonly crumblePlatforms: CrumbleRuntime[] = [];
  private readonly traps: TrapRuntime[] = [];
  private readonly arrows: ArrowRuntime[] = [];

  constructor(private readonly level: LevelDefinition) {
    this.buildMovingPlatforms();
    this.buildCrumblePlatforms();
    this.buildArrowTraps();
  }

  update(deltaTime: number): void {
    this.updateMovingPlatforms(deltaTime);
    this.updateCrumblePlatforms(deltaTime);
    this.updateArrowTraps(deltaTime);
  }

  reset(): void {
    for (const moving of this.movingPlatforms) {
      moving.time = 0;
      moving.deltaX = 0;
      moving.deltaY = 0;
      moving.bounds.x = moving.definition.x;
      moving.bounds.y = moving.definition.y;
      moving.sprite.position.set(moving.bounds.x, moving.bounds.y);
    }

    for (const crumble of this.crumblePlatforms) {
      crumble.state = 'idle';
      crumble.timer = 0;
      crumble.sprite.visible = true;
      crumble.sprite.alpha = 1;
    }

    for (const trap of this.traps) trap.timer = trap.definition.interval * 0.55;
    for (const arrow of this.arrows) arrow.sprite.destroy();
    this.arrows.length = 0;
  }

  getCollisionPlatforms(): Rectangle[] {
    return [
      ...this.movingPlatforms.map((moving) => moving.bounds),
      ...this.crumblePlatforms
        .filter((crumble) => crumble.state !== 'gone')
        .map((crumble) => crumble.bounds),
    ];
  }

  landOn(platform: Rectangle): { deltaX: number; deltaY: number } {
    const moving = this.movingPlatforms.find((item) => item.bounds === platform);
    if (moving) return { deltaX: moving.deltaX, deltaY: moving.deltaY };

    const crumble = this.crumblePlatforms.find((item) => item.bounds === platform);
    if (crumble?.state === 'idle') {
      crumble.state = 'warning';
      crumble.timer = crumble.definition.delay;
    }

    return { deltaX: 0, deltaY: 0 };
  }

  arrowHits(bounds: Rectangle): boolean {
    const hitIndex = this.arrows.findIndex((arrow) =>
      overlaps(bounds, { x: arrow.x - 14, y: arrow.y - 4, width: 28, height: 8 }),
    );
    if (hitIndex < 0) return false;

    const [arrow] = this.arrows.splice(hitIndex, 1);
    arrow.sprite.destroy();
    return true;
  }

  destroy(): void {
    this.layer.destroy({ children: true });
  }

  private buildMovingPlatforms(): void {
    for (const definition of this.level.movingPlatforms) {
      const sprite = new Graphics()
        .roundRect(0, 0, definition.width, definition.height, 4)
        .fill(0x426786)
        .rect(8, 5, Math.max(0, definition.width - 16), 3)
        .fill({ color: COLORS.acid, alpha: 0.7 });
      sprite.position.set(definition.x, definition.y);
      this.layer.addChild(sprite);

      const centerX = definition.x + definition.width / 2;
      const centerY = definition.y + definition.height / 2;
      const guide = new Graphics();
      if (definition.axis === 'x') {
        guide
          .moveTo(centerX, centerY)
          .lineTo(
            centerX + definition.distance,
            centerY,
          );
      } else {
        guide
          .moveTo(centerX, centerY)
          .lineTo(
            centerX,
            centerY + definition.distance,
          );
      }
      guide.stroke({ color: 0x66849c, width: 1, alpha: 0.35 });
      this.layer.addChildAt(guide, 0);

      this.movingPlatforms.push({
        definition,
        bounds: {
          x: definition.x,
          y: definition.y,
          width: definition.width,
          height: definition.height,
        },
        sprite,
        time: 0,
        deltaX: 0,
        deltaY: 0,
      });
    }
  }

  private buildCrumblePlatforms(): void {
    for (const definition of this.level.crumblePlatforms) {
      const sprite = new Graphics()
        .rect(0, 0, definition.width, definition.height)
        .fill(0x73564f)
        .moveTo(8, 2)
        .lineTo(definition.width * 0.4, definition.height - 2)
        .lineTo(definition.width * 0.7, 2)
        .stroke({ color: 0xd89779, width: 2, alpha: 0.75 });
      sprite.position.set(definition.x, definition.y);
      this.layer.addChild(sprite);

      this.crumblePlatforms.push({
        definition,
        bounds: {
          x: definition.x,
          y: definition.y,
          width: definition.width,
          height: definition.height,
        },
        sprite,
        state: 'idle',
        timer: 0,
      });
    }
  }

  private buildArrowTraps(): void {
    for (const definition of this.level.arrowTraps) {
      const facing = definition.direction === 'right' ? 1 : -1;
      const launcher = new Graphics()
        .rect(-12, -14, 24, 28)
        .fill(0x6b3440)
        .poly([0, -7, 13 * facing, 0, 0, 7])
        .fill(COLORS.danger);
      launcher.position.set(definition.x, definition.y);
      this.layer.addChild(launcher);
      this.traps.push({ definition, timer: definition.interval * 0.55 });
    }
  }

  private updateMovingPlatforms(deltaTime: number): void {
    for (const moving of this.movingPlatforms) {
      moving.time += deltaTime * moving.definition.speed;
      const progress = (1 - Math.cos(moving.time)) / 2;
      const nextX = moving.definition.x +
        (moving.definition.axis === 'x' ? progress * moving.definition.distance : 0);
      const nextY = moving.definition.y +
        (moving.definition.axis === 'y' ? progress * moving.definition.distance : 0);

      moving.deltaX = nextX - moving.bounds.x;
      moving.deltaY = nextY - moving.bounds.y;
      moving.bounds.x = nextX;
      moving.bounds.y = nextY;
      moving.sprite.position.set(nextX, nextY);
    }
  }

  private updateCrumblePlatforms(deltaTime: number): void {
    for (const crumble of this.crumblePlatforms) {
      if (crumble.state === 'idle') continue;

      crumble.timer -= deltaTime;
      if (crumble.state === 'warning') {
        crumble.sprite.alpha = 0.45 + Math.sin(crumble.timer * 35) * 0.3;
        if (crumble.timer <= 0) {
          crumble.state = 'gone';
          crumble.timer = crumble.definition.respawn;
          crumble.sprite.visible = false;
        }
      } else if (crumble.timer <= 0) {
        crumble.state = 'idle';
        crumble.sprite.visible = true;
        crumble.sprite.alpha = 1;
      }
    }
  }

  private updateArrowTraps(deltaTime: number): void {
    for (const trap of this.traps) {
      trap.timer -= deltaTime;
      if (trap.timer <= 0) {
        this.spawnArrow(trap.definition);
        trap.timer += trap.definition.interval;
      }
    }

    for (let index = this.arrows.length - 1; index >= 0; index -= 1) {
      const arrow = this.arrows[index];
      arrow.x += arrow.velocityX * deltaTime;
      arrow.sprite.x = arrow.x;

      if (arrow.x < -50 || arrow.x > this.level.world.width + 50) {
        arrow.sprite.destroy();
        this.arrows.splice(index, 1);
      }
    }
  }

  private spawnArrow(trap: ArrowTrap): void {
    const direction = trap.direction === 'right' ? 1 : -1;
    const sprite = new Graphics()
      .rect(-12, -2, 21, 4)
      .fill(0xe8ded1)
      .poly([9 * direction, -6, 16 * direction, 0, 9 * direction, 6])
      .fill(COLORS.danger);
    sprite.position.set(trap.x + direction * 20, trap.y);
    this.layer.addChild(sprite);

    this.arrows.push({
      x: sprite.x,
      y: sprite.y,
      velocityX: direction * trap.speed,
      sprite,
    });
  }
}

function overlaps(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
