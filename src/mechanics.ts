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
  sprite: Container;
  state: 'idle' | 'warning' | 'gone' | 'reforming';
  timer: number;
};

type CrumbleDebris = {
  sprite: Graphics;
  velocityX: number;
  velocityY: number;
  rotationSpeed: number;
  life: number;
};

type MechanicsEvents = {
  crumbleWarning?: () => void;
  crumbleCollapse?: () => void;
  crumbleReform?: () => void;
  arrowImpact?: (hitPlayer: boolean) => void;
};

type ImpactParticle = {
  sprite: Graphics;
  velocityX: number;
  velocityY: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
  expanding: boolean;
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
  private readonly debris: CrumbleDebris[] = [];
  private readonly impactParticles: ImpactParticle[] = [];

  constructor(
    private readonly level: LevelDefinition,
    private readonly events: MechanicsEvents = {},
  ) {
    this.buildMovingPlatforms();
    this.buildCrumblePlatforms();
    this.buildArrowTraps();
  }

  update(deltaTime: number): void {
    this.updateMovingPlatforms(deltaTime);
    this.updateCrumblePlatforms(deltaTime);
    this.updateArrowTraps(deltaTime);
    this.updateImpactParticles(deltaTime);
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
      crumble.sprite.position.set(crumble.definition.x, crumble.definition.y);
    }

    this.clearDebris();
    this.clearImpactParticles();

    for (const trap of this.traps) trap.timer = trap.definition.interval * 0.55;
    for (const arrow of this.arrows) arrow.sprite.destroy();
    this.arrows.length = 0;
  }

  getCollisionPlatforms(): Rectangle[] {
    return [
      ...this.movingPlatforms.map((moving) => moving.bounds),
      ...this.crumblePlatforms
        .filter(
          (crumble) =>
            crumble.state === 'idle' || crumble.state === 'warning',
        )
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
      this.events.crumbleWarning?.();
    }
  }

  arrowHits(bounds: Rectangle): boolean {
    const hitIndex = this.arrows.findIndex((arrow) =>
      overlaps(bounds, arrowBounds(arrow)),
    );
    if (hitIndex < 0) return false;

    const [arrow] = this.arrows.splice(hitIndex, 1);
    this.spawnArrowImpact(arrow, true);
    arrow.sprite.destroy();
    this.events.arrowImpact?.(true);
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
      const sprite = new Container();
      const body = new Graphics()
        .rect(0, 0, definition.width, definition.height)
        .fill(0x73564f)
        .rect(0, 0, definition.width, 3)
        .fill({ color: 0xe0a184, alpha: 0.72 });
      const segments = new Graphics();
      for (let x = definition.width * 0.2; x < definition.width; x += definition.width * 0.2) {
        segments
          .moveTo(x, 3)
          .lineTo(x - 3, definition.height - 2)
          .stroke({ color: 0x4d3b3a, width: 1, alpha: 0.55 });
      }
      const cracks = new Graphics()
        .moveTo(definition.width * 0.47, 1)
        .lineTo(definition.width * 0.5, definition.height * 0.45)
        .lineTo(definition.width * 0.42, definition.height - 1)
        .moveTo(definition.width * 0.5, definition.height * 0.45)
        .lineTo(definition.width * 0.63, definition.height * 0.72)
        .lineTo(definition.width * 0.7, definition.height - 2)
        .moveTo(definition.width * 0.49, definition.height * 0.38)
        .lineTo(definition.width * 0.34, definition.height * 0.62)
        .stroke({ color: 0xf0b28f, width: 2, alpha: 0.92 });
      const looseEdges = new Graphics();
      for (let x = 6; x < definition.width - 4; x += 18) {
        looseEdges
          .rect(x, definition.height - 3 + ((x / 18) % 2), 7, 4)
          .fill({ color: 0x5d4642, alpha: 0.9 });
      }
      sprite.addChild(body, segments, cracks, looseEdges);
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
      if (crumble.state === 'idle') {
        if (Math.random() < deltaTime * 0.7) this.spawnCrumbleDust(crumble, 1);
        continue;
      }

      crumble.timer -= deltaTime;
      if (crumble.state === 'warning') {
        crumble.sprite.x =
          crumble.definition.x + Math.sin(crumble.timer * 55) * 2.2;
        crumble.sprite.alpha = 0.68 + Math.sin(crumble.timer * 35) * 0.22;
        if (Math.random() < deltaTime * 9) this.spawnCrumbleDust(crumble, 1);
        if (crumble.timer <= 0) {
          crumble.state = 'gone';
          crumble.timer = crumble.definition.respawn;
          crumble.sprite.visible = false;
          crumble.sprite.position.set(crumble.definition.x, crumble.definition.y);
          this.spawnCrumbleDust(crumble, 7, true);
          this.events.crumbleCollapse?.();
        }
      } else if (crumble.state === 'gone' && crumble.timer <= 0) {
        crumble.state = 'reforming';
        crumble.timer = 0.35;
        crumble.sprite.visible = true;
        crumble.sprite.alpha = 0;
        crumble.sprite.y = crumble.definition.y + 8;
        this.events.crumbleReform?.();
      } else if (crumble.state === 'reforming') {
        const progress = Math.min(1, 1 - crumble.timer / 0.35);
        crumble.sprite.alpha = progress;
        crumble.sprite.y = crumble.definition.y + (1 - progress) * 8;
        if (crumble.timer <= 0) {
          crumble.state = 'idle';
          crumble.sprite.position.set(crumble.definition.x, crumble.definition.y);
          crumble.sprite.alpha = 1;
        }
      }
    }

    this.updateDebris(deltaTime);
  }

  private spawnCrumbleDust(
    crumble: CrumbleRuntime,
    count: number,
    chunks = false,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const size = chunks ? 5 + Math.random() * 7 : 2 + Math.random() * 2;
      const sprite = new Graphics()
        .rect(-size / 2, -size / 2, size, size * (chunks ? 0.65 : 1))
        .fill(chunks ? 0x73564f : 0xd89779);
      sprite.position.set(
        crumble.definition.x + Math.random() * crumble.definition.width,
        crumble.definition.y + crumble.definition.height,
      );
      this.layer.addChild(sprite);
      this.debris.push({
        sprite,
        velocityX: chunks ? (Math.random() - 0.5) * 95 : (Math.random() - 0.5) * 18,
        velocityY: chunks ? -35 - Math.random() * 80 : 15 + Math.random() * 25,
        rotationSpeed: (Math.random() - 0.5) * 7,
        life: chunks ? 0.85 : 0.45,
      });
    }
  }

  private updateDebris(deltaTime: number): void {
    for (let index = this.debris.length - 1; index >= 0; index -= 1) {
      const debris = this.debris[index];
      debris.life -= deltaTime;
      debris.velocityY += 520 * deltaTime;
      debris.sprite.x += debris.velocityX * deltaTime;
      debris.sprite.y += debris.velocityY * deltaTime;
      debris.sprite.rotation += debris.rotationSpeed * deltaTime;
      debris.sprite.alpha = Math.max(0, debris.life * 1.5);

      if (debris.life <= 0) {
        debris.sprite.destroy();
        this.debris.splice(index, 1);
      }
    }
  }

  private clearDebris(): void {
    for (const debris of this.debris) debris.sprite.destroy();
    this.debris.length = 0;
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
        if (hitPlatform) {
          this.spawnArrowImpact(arrow, false);
          this.events.arrowImpact?.(false);
        }
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

  private spawnArrowImpact(arrow: ArrowRuntime, hitPlayer: boolean): void {
    const speed = Math.max(1, Math.hypot(arrow.velocityX, arrow.velocityY));
    const directionX = arrow.velocityX / speed;
    const directionY = arrow.velocityY / speed;
    const perpendicularX = -directionY;
    const perpendicularY = directionX;
    const particleCount = hitPlayer ? 7 : 5;

    for (let index = 0; index < particleCount; index += 1) {
      const isArrowFragment = index % 2 === 0;
      const size = isArrowFragment ? 4 : 2.5;
      const sprite = new Graphics()
        .rect(-size / 2, -size / 2, size, isArrowFragment ? 2 : size)
        .fill(
          isArrowFragment
            ? 0xe8ded1
            : hitPlayer
              ? COLORS.acid
              : 0x71889d,
        );
      sprite.position.set(arrow.x, arrow.y);
      this.layer.addChild(sprite);

      const backwardSpeed = 45 + Math.random() * 85;
      const spread = (Math.random() - 0.5) * 120;
      const life = 0.16 + Math.random() * 0.14;
      this.impactParticles.push({
        sprite,
        velocityX: -directionX * backwardSpeed + perpendicularX * spread,
        velocityY: -directionY * backwardSpeed + perpendicularY * spread,
        rotationSpeed: (Math.random() - 0.5) * 14,
        life,
        maxLife: life,
        expanding: false,
      });
    }

    const ring = new Graphics()
      .circle(0, 0, hitPlayer ? 8 : 6)
      .stroke({
        color: hitPlayer ? COLORS.acid : 0xc5d3dc,
        width: 1.5,
        alpha: 0.8,
      });
    ring.position.set(arrow.x, arrow.y);
    ring.scale.set(0.35);
    this.layer.addChild(ring);
    this.impactParticles.push({
      sprite: ring,
      velocityX: 0,
      velocityY: 0,
      rotationSpeed: 0,
      life: 0.18,
      maxLife: 0.18,
      expanding: true,
    });
  }

  private updateImpactParticles(deltaTime: number): void {
    for (let index = this.impactParticles.length - 1; index >= 0; index -= 1) {
      const particle = this.impactParticles[index];
      particle.life -= deltaTime;
      particle.sprite.x += particle.velocityX * deltaTime;
      particle.sprite.y += particle.velocityY * deltaTime;
      particle.sprite.rotation += particle.rotationSpeed * deltaTime;
      particle.sprite.alpha = Math.max(0, particle.life / particle.maxLife);

      if (particle.expanding) {
        const progress = 1 - particle.life / particle.maxLife;
        particle.sprite.scale.set(0.35 + progress * 1.25);
      }

      if (particle.life <= 0) {
        particle.sprite.destroy();
        this.impactParticles.splice(index, 1);
      }
    }
  }

  private clearImpactParticles(): void {
    for (const particle of this.impactParticles) particle.sprite.destroy();
    this.impactParticles.length = 0;
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
