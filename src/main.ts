import { Application, Container, Graphics } from 'pixi.js';
import { SoundEffects } from './audio';
import {
  DEFAULT_LEVEL,
  LevelDefinition,
  PLAYER,
  Rectangle,
} from './config';
import { LevelEditor } from './editor';
import {
  createBackground,
  createPlayer,
  createShard,
  createTerrain,
} from './graphics';
import { cloneLevel } from './level-format';
import { MechanicsSystem } from './mechanics';
import { MenuController } from './menu';
import './styles.css';

type PlayerState = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  onGround: boolean;
  wallDirection: -1 | 0 | 1;
  jumpsUsed: number;
  running: boolean;
  finished: boolean;
  startTime: number;
  elapsedTime: number;
  collectedShards: number;
};

type Abilities = {
  airJump: boolean;
  wallJump: boolean;
};

type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
  jumpQueued: boolean;
};

type Shard = {
  x: number;
  y: number;
  collected: boolean;
  sprite: Graphics;
};

class PlatformerGame {
  private readonly app = new Application();
  private readonly sound = new SoundEffects();
  private readonly world = new Container();
  private readonly background = createBackground();
  private readonly objects = new Container();
  private readonly playerGraphics = createPlayer();
  private readonly shards: Shard[] = [];
  private level = cloneLevel(DEFAULT_LEVEL);
  private terrain = createTerrain();
  private mechanics = this.createMechanics();

  private readonly state: PlayerState = {
    x: PLAYER.spawn.x,
    y: PLAYER.spawn.y,
    velocityX: 0,
    velocityY: 0,
    onGround: false,
    wallDirection: 0,
    jumpsUsed: 0,
    running: false,
    finished: false,
    startTime: 0,
    elapsedTime: 0,
    collectedShards: 0,
  };

  private readonly abilities: Abilities = {
    airJump: true,
    wallJump: true,
  };

  private readonly input: InputState = {
    left: false,
    right: false,
    jump: false,
    jumpQueued: false,
  };

  private cameraX = 0;
  private pausedAt: number | null = null;
  private standingPlatform: Rectangle | null = null;

  async initialize(host: HTMLDivElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: '#12243b',
      antialias: true,
      resolution: Math.min(devicePixelRatio, 2),
      autoDensity: true,
    });

    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(
      this.background,
      this.terrain,
      this.mechanics.layer,
      this.objects,
    );

    this.createShards();
    this.objects.addChild(this.playerGraphics.container);

    this.bindKeyboardControls();
    this.bindTouchControls();
    this.bindInterface();
    this.loadBestTime();

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1_000));
    this.render(0);
  }

  getLevel(): LevelDefinition {
    return cloneLevel(this.level);
  }

  pause(): boolean {
    const wasRunning = this.state.running;
    if (wasRunning) this.pausedAt = performance.now();
    this.state.running = false;
    return wasRunning;
  }

  resume(): void {
    if (this.state.running || this.state.finished) {
      this.pausedAt = null;
      return;
    }

    if (this.pausedAt !== null) {
      this.state.startTime += performance.now() - this.pausedAt;
    }
    this.pausedAt = null;
    this.state.running = true;
  }

  playLevel(level: LevelDefinition): void {
    this.level = cloneLevel(level);
    this.rebuildLevelGraphics();
    select('#start-overlay').classList.add('hidden');
    this.startRun();
  }

  private rebuildLevelGraphics(): void {
    this.world.removeChild(this.terrain);
    this.world.removeChild(this.mechanics.layer);
    this.terrain.destroy({ children: true });
    this.mechanics.destroy();
    this.terrain = createTerrain(
      this.level.platforms,
      this.level.hazards,
      this.level.finish,
    );
    this.mechanics = this.createMechanics();
    this.world.addChildAt(this.terrain, 1);
    this.world.addChildAt(this.mechanics.layer, 2);

    this.objects.removeChildren();
    this.shards.length = 0;
    this.createShards();
    this.objects.addChild(this.playerGraphics.container);

    setText('#shard-total', String(this.level.shards.length));
  }

  private createShards(): void {
    for (const position of this.level.shards) {
      const sprite = createShard();
      sprite.position.set(position.x, position.y);
      this.objects.addChild(sprite);

      this.shards.push({
        ...position,
        collected: false,
        sprite,
      });
    }
  }

  private createMechanics(): MechanicsSystem {
    return new MechanicsSystem(this.level, {
      crumbleWarning: () => this.sound.play(155, 0.07),
      crumbleCollapse: () => this.sound.play(82, 0.16),
      crumbleReform: () => this.sound.play(270, 0.08),
      launcherFire: () => this.sound.play(360, 0.055),
      arrowImpact: (hitPlayer) =>
        this.sound.play(hitPlayer ? 105 : 190, hitPlayer ? 0.1 : 0.045),
    });
  }

  private update(unboundedDeltaTime: number): void {
    const deltaTime = Math.min(unboundedDeltaTime, 0.032);

    if (this.state.running && !this.state.finished) {
      this.mechanics.update(deltaTime);
      this.updatePhysics(deltaTime);
      this.state.elapsedTime = performance.now() - this.state.startTime;
    }

    this.render(deltaTime);
  }

  private updatePhysics(deltaTime: number): void {
    this.carryWithMovingPlatform();
    this.updateHorizontalMovement(deltaTime);

    if (this.input.jumpQueued) {
      this.tryJump();
      this.input.jumpQueued = false;
    }

    this.state.velocityY = Math.min(
      this.state.velocityY + PLAYER.gravity * deltaTime,
      PLAYER.maxFallSpeed,
    );

    this.resolveHorizontalCollisions(deltaTime);
    this.resolveVerticalCollisions(deltaTime);
    this.checkWorldBounds();
    this.collectNearbyShards();
    this.checkForFinish();
  }

  private updateHorizontalMovement(deltaTime: number): void {
    const direction = Number(this.input.right) - Number(this.input.left);
    const acceleration = this.state.onGround
      ? PLAYER.groundAcceleration
      : PLAYER.airAcceleration;
    const friction = this.state.onGround
      ? PLAYER.groundFriction
      : PLAYER.airFriction;

    if (direction !== 0) {
      this.state.velocityX = clamp(
        this.state.velocityX + direction * acceleration * deltaTime,
        -PLAYER.maxSpeed,
        PLAYER.maxSpeed,
      );
      return;
    }

    const deceleration = Math.min(
      Math.abs(this.state.velocityX),
      friction * deltaTime,
    );
    this.state.velocityX -= Math.sign(this.state.velocityX) * deceleration;
  }

  private resolveHorizontalCollisions(deltaTime: number): void {
    const previousBounds = this.playerBounds();
    this.state.x += this.state.velocityX * deltaTime;
    this.state.wallDirection = 0;

    for (const platform of this.collisionPlatforms()) {
      if (!rectanglesOverlap(this.playerBounds(), platform)) continue;

      const platformMotion = this.mechanics.motionFor(platform);
      const previousPlatformX = platform.x - (platformMotion?.deltaX ?? 0);
      const previousPlatformY = platform.y - (platformMotion?.deltaY ?? 0);

      const wasVerticallyAligned =
        previousBounds.y < previousPlatformY + platform.height &&
        previousBounds.y + previousBounds.height > previousPlatformY;
      if (!wasVerticallyAligned) continue;

      const approachedFromLeft =
        this.state.velocityX > 0 &&
        previousBounds.x + previousBounds.width <= previousPlatformX;
      const approachedFromRight =
        this.state.velocityX < 0 &&
        previousBounds.x >= previousPlatformX + platform.width;

      if (approachedFromLeft) {
        this.state.x = platform.x - PLAYER.width / 2;
        this.state.wallDirection = 1;
      } else if (approachedFromRight) {
        this.state.x = platform.x + platform.width + PLAYER.width / 2;
        this.state.wallDirection = -1;
      } else {
        continue;
      }

      this.state.velocityX = 0;
    }

    const isWallSliding =
      this.abilities.wallJump &&
      this.state.wallDirection !== 0 &&
      this.state.velocityY > PLAYER.wallSlideSpeed;

    if (isWallSliding) this.state.velocityY = PLAYER.wallSlideSpeed;
  }

  private resolveVerticalCollisions(deltaTime: number): void {
    const previousBounds = this.playerBounds();
    this.state.y += this.state.velocityY * deltaTime;
    this.state.onGround = false;
    this.standingPlatform = null;

    for (const platform of this.collisionPlatforms()) {
      if (!rectanglesOverlap(this.playerBounds(), platform)) continue;

      const platformMotion = this.mechanics.motionFor(platform);
      const previousPlatformY = platform.y - (platformMotion?.deltaY ?? 0);

      const approachedFromAbove =
        this.state.velocityY >= 0 &&
        previousBounds.y + previousBounds.height <= previousPlatformY + 2;
      const approachedFromBelow =
        this.state.velocityY < 0 &&
        previousBounds.y >= previousPlatformY + platform.height - 2;

      if (approachedFromAbove) {
        this.state.y = platform.y - PLAYER.height / 2;
        this.state.onGround = true;
        this.state.jumpsUsed = 0;
        this.standingPlatform = platform;
        this.mechanics.landOn(platform);
      } else if (approachedFromBelow) {
        this.state.y = platform.y + platform.height + PLAYER.height / 2;
      } else {
        continue;
      }

      this.state.velocityY = 0;
    }
  }

  private tryJump(): void {
    if (this.state.onGround) {
      this.state.velocityY = -PLAYER.jumpSpeed;
      this.state.onGround = false;
      this.state.jumpsUsed = 1;
      this.standingPlatform = null;
      this.sound.play(220, 0.06);
      return;
    }

    if (this.abilities.wallJump && this.state.wallDirection !== 0) {
      this.state.velocityY = -PLAYER.wallJumpSpeed;
      this.state.velocityX = -this.state.wallDirection * PLAYER.wallJumpPush;
      this.state.jumpsUsed = 1;
      this.sound.play(260, 0.07);
      return;
    }

    if (this.abilities.airJump && this.state.jumpsUsed < 2) {
      this.state.velocityY = -PLAYER.airJumpSpeed;
      this.state.jumpsUsed += 1;
      this.sound.play(330, 0.07);
    }
  }

  private checkWorldBounds(): void {
    const halfWidth = PLAYER.width / 2;
    this.state.x = clamp(
      this.state.x,
      halfWidth,
      this.level.world.width - halfWidth,
    );

    const fellOutOfWorld = this.state.y > this.level.world.height + 80;
    const touchedHazard = this.level.hazards.some((hazard) =>
      rectanglesOverlap(this.playerBounds(), hazard),
    );
    const hitByArrow = this.mechanics.arrowHits(this.playerBounds());

    if (fellOutOfWorld || touchedHazard || hitByArrow) this.respawn();
  }

  private collectNearbyShards(): void {
    for (const shard of this.shards) {
      if (shard.collected) continue;

      const distance = Math.hypot(
        this.state.x - shard.x,
        this.state.y - shard.y,
      );

      if (distance >= 36) continue;

      shard.collected = true;
      shard.sprite.visible = false;
      this.state.collectedShards += 1;
      setText('#coin-count', String(this.state.collectedShards));
      this.sound.play(580, 0.08);
    }
  }

  private checkForFinish(): void {
    if (
      !this.state.finished &&
      rectanglesOverlap(this.playerBounds(), this.level.finish)
    ) {
      this.finishRun();
    }
  }

  private finishRun(): void {
    this.state.finished = true;
    this.state.running = false;
    this.state.elapsedTime = performance.now() - this.state.startTime;

    this.sound.play(440, 0.12);
    window.setTimeout(() => this.sound.play(660, 0.18), 110);

    const formattedTime = formatTime(this.state.elapsedTime);
    setText('#finish-time', formattedTime);
    setText(
      '#finish-coins',
      `${this.state.collectedShards} / ${this.shards.length}`,
    );

    const previousBest = Number(
      localStorage.getItem('skybound-best') ?? Number.POSITIVE_INFINITY,
    );

    if (this.state.elapsedTime < previousBest) {
      localStorage.setItem('skybound-best', String(this.state.elapsedTime));
      setText('#best-time', formattedTime);
    }

    select('#finish-overlay').classList.remove('hidden');
  }

  private startRun(): void {
    this.state.running = true;
    this.resetRun();
  }

  private resetRun(): void {
    this.respawn();
    this.mechanics.reset();
    this.cameraX = 0;
    this.state.collectedShards = 0;
    this.state.finished = false;
    this.state.startTime = performance.now();
    this.state.elapsedTime = 0;

    for (const shard of this.shards) {
      shard.collected = false;
      shard.sprite.visible = true;
    }

    setText('#coin-count', '0');
    select('#finish-overlay').classList.add('hidden');
  }

  private respawn(): void {
    this.state.x = this.level.spawn.x;
    this.state.y = this.level.spawn.y;
    this.state.velocityX = 0;
    this.state.velocityY = 0;
    this.state.jumpsUsed = 0;
    this.standingPlatform = null;
  }

  private carryWithMovingPlatform(): void {
    if (!this.state.onGround || !this.standingPlatform) return;

    const motion = this.mechanics.motionFor(this.standingPlatform);
    if (!motion) return;

    this.state.x += motion.deltaX;
    this.state.y += motion.deltaY;
  }

  private render(deltaTime: number): void {
    const scale = clamp(
      (this.app.screen.height / this.level.world.height) * 1.05,
      0.72,
      1.12,
    );
    const visibleWorldWidth = this.app.screen.width / scale;
    const targetCameraX = clamp(
      this.state.x - visibleWorldWidth * 0.38,
      0,
      this.level.world.width - visibleWorldWidth,
    );

    this.cameraX +=
      (targetCameraX - this.cameraX) * Math.min(1, deltaTime * 5.5);

    this.world.scale.set(scale);
    this.world.x = -this.cameraX * scale;
    this.world.y =
      (this.app.screen.height - this.level.world.height * scale) / 2;
    this.background.x = this.cameraX * 0.12;

    const player = this.playerGraphics.container;
    player.position.set(this.state.x, this.state.y);
    player.rotation = clamp(this.state.velocityX / 2_200, -0.08, 0.08);
    this.playerGraphics.scarf.scale.x = this.state.velocityX > 0 ? -1 : 1;

    this.animateShards(deltaTime);
  }

  private animateShards(deltaTime: number): void {
    this.shards.forEach((shard, index) => {
      shard.sprite.rotation += deltaTime * (1.4 + (index % 3) * 0.2);
      shard.sprite.y = shard.y + Math.sin(performance.now() / 420 + index) * 5;
    });
  }

  private playerBounds(): Rectangle {
    return {
      x: this.state.x - PLAYER.width / 2,
      y: this.state.y - PLAYER.height / 2,
      width: PLAYER.width,
      height: PLAYER.height,
    };
  }

  private collisionPlatforms(): Rectangle[] {
    return [
      ...this.level.platforms,
      ...this.mechanics.getCollisionPlatforms(),
    ];
  }

  private bindKeyboardControls(): void {
    window.addEventListener('keydown', (event) => {
      if (isTextEntryTarget(event.target)) return;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code)) {
        event.preventDefault();
      }

      this.setKeyboardInput(event.code, true);

      if (event.code === 'KeyR' && this.state.running) this.resetRun();
    });

    window.addEventListener('keyup', (event) => {
      if (isTextEntryTarget(event.target)) return;
      this.setKeyboardInput(event.code, false);
    });
  }

  private setKeyboardInput(code: string, pressed: boolean): void {
    if (code === 'ArrowLeft' || code === 'KeyA') this.input.left = pressed;
    if (code === 'ArrowRight' || code === 'KeyD') this.input.right = pressed;

    if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') {
      if (pressed && !this.input.jump) this.input.jumpQueued = true;
      this.input.jump = pressed;
    }
  }

  private bindTouchControls(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
      const control = button.dataset.key as 'left' | 'right' | 'jump';

      const press = (event: PointerEvent): void => {
        event.preventDefault();

        if (control === 'jump') {
          if (!this.input.jump) this.input.jumpQueued = true;
          this.input.jump = true;
        } else {
          this.input[control] = true;
        }
      };

      const release = (event: PointerEvent): void => {
        event.preventDefault();
        this.input[control] = false;
      };

      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', release);
    });
  }

  private bindInterface(): void {
    select('#start-button').addEventListener('click', () => {
      select('#start-overlay').classList.add('hidden');
      this.startRun();
    });

    select('#replay-button').addEventListener('click', () => this.startRun());

    select('#sound-button').addEventListener('click', (event) => {
      const isEnabled = this.sound.toggle();
      const button = event.currentTarget as HTMLButtonElement;
      button.classList.toggle('muted', !isEnabled);
      button.style.opacity = isEnabled ? '1' : '0.62';
      button.setAttribute('aria-pressed', String(!isEnabled));
      button.setAttribute('aria-label', isEnabled ? 'Mute sound' : 'Unmute sound');
      button.title = isEnabled ? 'Mute sound' : 'Unmute sound';
    });

    const drawer = select('#settings-drawer');
    const scrim = select('#drawer-scrim');
    const setDrawerOpen = (open: boolean): void => {
      drawer.classList.toggle('open', open);
      scrim.classList.toggle('open', open);
      drawer.setAttribute('aria-hidden', String(!open));
    };

    select('#settings-button').addEventListener('click', () => setDrawerOpen(true));
    select('#close-settings').addEventListener('click', () => setDrawerOpen(false));
    scrim.addEventListener('click', () => setDrawerOpen(false));

    selectInput('#air-jump-toggle').addEventListener('change', (event) => {
      this.abilities.airJump = (event.currentTarget as HTMLInputElement).checked;
    });

    selectInput('#wall-jump-toggle').addEventListener('change', (event) => {
      this.abilities.wallJump = (event.currentTarget as HTMLInputElement).checked;
    });
  }

  private loadBestTime(): void {
    const bestTime = Number(localStorage.getItem('skybound-best'));
    if (bestTime > 0) setText('#best-time', formatTime(bestTime));
  }
}

function rectanglesOverlap(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor(milliseconds / 1_000) % 60;
  const centiseconds = Math.floor(milliseconds / 10) % 100;

  return [minutes, seconds, centiseconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
    .replace(/:(\d{2})$/, '.$1');
}

function select(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function selectInput(selector: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(selector);
  if (!element) throw new Error(`Missing required input: ${selector}`);
  return element;
}

function setText(selector: string, value: string): void {
  select(selector).textContent = value;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

async function main(): Promise<void> {
  const host = document.querySelector<HTMLDivElement>('#game-container');
  if (!host) throw new Error('Missing game container');

  const game = new PlatformerGame();
  await game.initialize(host);

  let resumeAfterEditor = false;
  let returnToMenuAfterEditor = false;
  let menu: MenuController;
  const editor = new LevelEditor(
    (level) => {
      resumeAfterEditor = false;
      returnToMenuAfterEditor = false;
      game.playLevel(level);
    },
    () => {
      if (returnToMenuAfterEditor) menu.showSavedLevels();
      else if (resumeAfterEditor) game.resume();
      resumeAfterEditor = false;
      returnToMenuAfterEditor = false;
    },
    () => {
      resumeAfterEditor = false;
      returnToMenuAfterEditor = false;
      menu.showSavedLevels();
    },
  );

  const openEditor = (
    level: LevelDefinition,
    resumeGame = false,
    returnToMenu = false,
  ): void => {
    resumeAfterEditor = resumeGame;
    returnToMenuAfterEditor = returnToMenu;
    editor.open(level);
  };

  menu = new MenuController({
    playOfficial: () => game.playLevel(cloneLevel(DEFAULT_LEVEL)),
    playSaved: (level) => game.playLevel(level),
    editSaved: (level) => openEditor(level, false, true),
    createLevel: () => {
      const level = cloneLevel(DEFAULT_LEVEL);
      level.name = 'Untitled Level';
      openEditor(level, false, true);
    },
  });

  select('#editor-button').addEventListener('click', () => {
    openEditor(game.getLevel(), game.pause());
  });
  select('#home-button').addEventListener('click', (event) => {
    event.preventDefault();
    game.pause();
    menu.open();
  });
}

void main();
