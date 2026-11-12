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
  progress: number;
  direction: 1 | -1;
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
  velocityY: number;
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
      moving.progress = 0;
      moving.direction = 1;
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

  motionFor(platform: Rectangle): { deltaX: number; deltaY: number } | null {
    const moving = this.movingPlatforms.find((item) => item.bounds === platform);
    return moving
      ? { deltaX: moving.deltaX, deltaY: moving.deltaY }
      : null;
  }

  landOn(platform: Rectangle): void {
    const crumble = this.crumblePlatforms.find((item) => item.bounds === platform);
    if (crumble?.state === 'idle') {
      crumble.state = 'warning';
      crumble.timer = crumble.definition.delay;
    }
  }

  arrowHits(bounds: Rectangle): boolean {
    const hitIndex = this.arrows.findIndex((arrow) =>
      overlaps(bounds, arrowBounds(arrow)),
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
      const targetCenterX = definition.target.x + definition.width / 2;
      const targetCenterY = definition.target.y + definition.height / 2;
      const guide = new Graphics();
      guide
        .moveTo(centerX, centerY)
        .lineTo(targetCenterX, targetCenterY);
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
        progress: 0,
        direction: 1,
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
      const launcher = new Graphics()
        .rect(-12, -14, 24, 28)
        .fill(0x6b3440)
        .poly([0, -7, 13, 0, 0, 7])
        .fill(COLORS.danger);
      launcher.position.set(definition.x, definition.y);
      launcher.rotation = directionAngle(definition.direction);
      this.layer.addChild(launcher);
      this.traps.push({ definition, timer: definition.interval * 0.55 });
    }
  }

  private updateMovingPlatforms(deltaTime: number): void {
    for (const moving of this.movingPlatforms) {
      const pathX = moving.definition.target.x - moving.definition.x;
      const pathY = moving.definition.target.y - moving.definition.y;
      const pathLength = Math.max(1, Math.hypot(pathX, pathY));
      const progressDelta =
        (moving.definition.speed * deltaTime) / pathLength * moving.direction;

      moving.progress += progressDelta;
      if (moving.progress >= 1) {
        moving.progress = 1;
        moving.direction = -1;
      } else if (moving.progress <= 0) {
        moving.progress = 0;
        moving.direction = 1;
      }

      const nextX = moving.definition.x +
        pathX * moving.progress;
      const nextY = moving.definition.y +
        pathY * moving.progress;

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
      arrow.y += arrow.velocityY * deltaTime;
      arrow.sprite.x = arrow.x;
      arrow.sprite.y = arrow.y;

      const currentArrowBounds = arrowBounds(arrow);
      const hitPlatform = [
        ...this.level.platforms,
        ...this.getCollisionPlatforms(),
      ].some((platform) => overlaps(currentArrowBounds, platform));

      if (
        hitPlatform ||
        arrow.x < -50 ||
        arrow.x > this.level.world.width + 50 ||
        arrow.y < -50 ||
        arrow.y > this.level.world.height + 50
      ) {
        arrow.sprite.destroy();
        this.arrows.splice(index, 1);
      }
    }
  }

  private spawnArrow(trap: ArrowTrap): void {
    const vector = directionVector(trap.direction);
    const sprite = new Graphics()
      .rect(-12, -2, 21, 4)
      .fill(0xe8ded1)
      .poly([9, -6, 16, 0, 9, 6])
      .fill(COLORS.danger);
    sprite.rotation = directionAngle(trap.direction);
    sprite.position.set(trap.x + vector.x * 20, trap.y + vector.y * 20);
    this.layer.addChild(sprite);

    this.arrows.push({
      x: sprite.x,
      y: sprite.y,
      velocityX: vector.x * trap.speed,
      velocityY: vector.y * trap.speed,
      sprite,
    });
  }
}

function directionVector(direction: ArrowTrap['direction']): { x: number; y: number } {
  return {
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    up: { x: 0, y: -1 },
  }[direction];
}

function directionAngle(direction: ArrowTrap['direction']): number {
  return {
    right: 0,
    down: Math.PI / 2,
    left: Math.PI,
    up: -Math.PI / 2,
  }[direction];
}

function arrowBounds(arrow: ArrowRuntime): Rectangle {
  const isHorizontal = arrow.velocityX !== 0;
  return {
    x: arrow.x - (isHorizontal ? 14 : 4),
    y: arrow.y - (isHorizontal ? 4 : 14),
    width: isHorizontal ? 28 : 8,
    height: isHorizontal ? 8 : 28,
  };
}

function overlaps(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
