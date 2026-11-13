import {
  ArrowTrap,
  DEFAULT_LEVEL,
  LevelDefinition,
  Point,
  Rectangle,
} from './config';
import {
  cloneLevel,
  exportLevelBase64,
  importLevel,
} from './level-format';
import {
  listSavedLevels,
  saveLevel,
} from './level-storage';

type EditorTool =
  | 'platform'
  | 'hazard'
  | 'moving'
  | 'crumble'
  | 'arrow'
  | 'shard'
  | 'spawn'
  | 'finish'
  | 'erase';

const GRID_SIZE = 20;

export class LevelEditor {
  private level = cloneLevel(DEFAULT_LEVEL);
  private history: LevelDefinition[] = [];
  private tool: EditorTool = 'platform';
  private dragStart: Point | null = null;
  private dragEnd: Point | null = null;
  private pendingMovingPlatform: Rectangle | null = null;
  private pendingMovingTarget: Point | null = null;
  private hoverPoint: Point | null = null;
  private arrowDirection: ArrowTrap['direction'] = 'right';
  private movingSpeed = 120;
  private savedLevelId: string | null = null;

  private readonly modal = select('#editor-modal');
  private readonly canvas = selectCanvas('#editor-canvas');
  private readonly context = this.canvas.getContext('2d')!;
  private readonly dataField = selectTextArea('#level-data');
  private readonly message = select('#editor-message');
  private readonly nameInput = selectInput('#level-name');

  constructor(
    private readonly playLevel: (level: LevelDefinition) => void,
    private readonly onClose: () => void,
    private readonly onSaved: (savedLevelId: string) => void,
  ) {
    this.bindControls();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  open(level: LevelDefinition): void {
    this.level = cloneLevel(level);
    const currentCode = exportLevelBase64(this.level);
    this.savedLevelId =
      listSavedLevels().find(
        (saved) => exportLevelBase64(saved.level) === currentCode,
      )?.id ?? null;
    this.history = [];
    this.pendingMovingPlatform = null;
    this.pendingMovingTarget = null;
    this.hoverPoint = null;
    this.nameInput.value = this.level.name;
    this.modal.classList.add('open');
    this.modal.setAttribute('aria-hidden', 'false');
    this.resizeCanvas();
    this.render();
  }

  close(): void {
    this.modal.classList.remove('open');
    this.modal.setAttribute('aria-hidden', 'true');
    this.onClose();
  }

  private bindControls(): void {
    select('#close-editor').addEventListener('click', () => this.close());

    document.querySelectorAll<HTMLButtonElement>('[data-editor-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        this.tool = button.dataset.editorTool as EditorTool;
        this.pendingMovingPlatform = null;
        this.pendingMovingTarget = null;
        this.updateMovingTravelTime();
        this.canvas.classList.toggle('placing-arrow', this.tool === 'arrow');
        document.querySelectorAll('[data-editor-tool]').forEach((item) =>
          item.classList.toggle('active', item === button),
        );
        if (this.tool === 'arrow') {
          this.showMessage(
            `Arrow launcher fires ${this.arrowDirection}. Press R to rotate.`,
          );
        }
        this.render();
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-moving-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        this.movingSpeed = Number(button.dataset.movingSpeed);
        document.querySelectorAll('[data-moving-speed]').forEach((item) =>
          item.classList.toggle('active', item === button),
        );
        this.updateMovingTravelTime();
      });
    });

    select('#editor-undo').addEventListener('click', () => this.undo());
    select('#editor-reset').addEventListener('click', () => {
      this.saveHistory();
      this.level = cloneLevel(DEFAULT_LEVEL);
      this.savedLevelId = null;
      this.nameInput.value = this.level.name;
      this.render();
      this.showMessage('Default level restored.');
    });
    select('#editor-clear').addEventListener('click', () => this.clearLevel());
    select('#editor-play').addEventListener('click', () => {
      this.syncName();
      this.playLevel(cloneLevel(this.level));
      this.close();
    });

    select('#save-level').addEventListener('click', () => this.saveToLibrary());
    select('#generate-code').addEventListener('click', () => this.exportCode());
    select('#copy-level').addEventListener('click', () => void this.copyExport());
    select('#import-level').addEventListener('click', () => this.import());
    this.nameInput.addEventListener('change', () => this.syncName());

    this.canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    this.canvas.addEventListener('pointercancel', () => this.cancelDrag());
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverPoint = null;
      this.render();
    });
    window.addEventListener('keydown', (event) => this.keyDown(event));
  }

  private pointerDown(event: PointerEvent): void {
    const point = this.eventToWorld(event, this.tool !== 'arrow');

    if (this.tool === 'moving' && this.pendingMovingPlatform) {
      this.saveHistory();
      this.level.movingPlatforms.push({
        ...this.pendingMovingPlatform,
        target: this.targetPosition(point, this.pendingMovingPlatform),
        speed: this.movingSpeed,
      });
      const travelTime = this.movingTravelTime(
        this.pendingMovingPlatform,
        this.targetPosition(point, this.pendingMovingPlatform),
      );
      this.pendingMovingPlatform = null;
      this.pendingMovingTarget = null;
      this.showMessage(
        `Moving platform created at ${this.movingSpeed} px/s (${travelTime.toFixed(1)}s one way).`,
      );
      this.render();
      return;
    }

    if (
      this.tool === 'platform' ||
      this.tool === 'hazard' ||
      this.tool === 'moving' ||
      this.tool === 'crumble'
    ) {
      this.dragStart = point;
      this.dragEnd = point;
      this.canvas.setPointerCapture(event.pointerId);
      this.render();
      return;
    }

    this.saveHistory();

    switch (this.tool) {
      case 'shard':
        this.level.shards.push(point);
        break;
      case 'spawn':
        this.level.spawn = point;
        break;
      case 'finish':
        this.level.finish = {
          x: point.x - 50,
          y: point.y - 100,
          width: 100,
          height: 200,
        };
        break;
      case 'arrow':
        this.level.arrowTraps.push({
          ...point,
          direction: this.arrowDirection,
          interval: 1.8,
          speed: 420,
        });
        break;
      case 'erase':
        this.eraseAt(point);
        break;
    }

    this.render();
  }

  private pointerMove(event: PointerEvent): void {
    this.hoverPoint = this.eventToWorld(event, this.tool !== 'arrow');

    if (this.tool === 'moving' && this.pendingMovingPlatform) {
      this.pendingMovingTarget = this.targetPosition(
        this.hoverPoint,
        this.pendingMovingPlatform,
      );
      this.updateMovingTravelTime();
      this.render();
      return;
    }

    if (!this.dragStart) return;
    this.dragEnd = this.hoverPoint;
    this.render();
  }

  private keyDown(event: KeyboardEvent): void {
    if (isTextEntryTarget(event.target)) return;

    if (
      !this.modal.classList.contains('open') ||
      this.tool !== 'arrow' ||
      event.code !== 'KeyR'
    ) return;

    event.preventDefault();
    const directions: ArrowTrap['direction'][] = ['right', 'down', 'left', 'up'];
    const directionIndex = directions.indexOf(this.arrowDirection);
    this.arrowDirection = directions[(directionIndex + 1) % directions.length];
    const icon = document.querySelector<HTMLElement>('#arrow-tool-icon');
    if (icon) icon.textContent = directionIcon(this.arrowDirection);
    this.showMessage(
      `Arrow launcher now fires ${this.arrowDirection}. Press R to rotate.`,
    );
    this.render();
  }

  private pointerUp(event: PointerEvent): void {
    if (!this.dragStart) return;

    this.dragEnd = this.eventToWorld(event);
    const rectangle = rectangleFromPoints(this.dragStart, this.dragEnd);
    if (this.tool === 'moving') {
      this.pendingMovingPlatform = rectangle;
      this.pendingMovingTarget = { x: rectangle.x, y: rectangle.y };
      this.cancelDrag();
      this.showMessage('Move the ghost platform to its destination, then click.');
      this.updateMovingTravelTime();
      this.render();
      return;
    }

    this.saveHistory();

    if (this.tool === 'platform') this.level.platforms.push(rectangle);
    if (this.tool === 'hazard') this.level.hazards.push(rectangle);
    if (this.tool === 'crumble') {
      this.level.crumblePlatforms.push({
        ...rectangle,
        delay: 0.7,
        respawn: 2.5,
      });
    }

    this.cancelDrag();
    this.render();
  }

  private cancelDrag(): void {
    this.dragStart = null;
    this.dragEnd = null;
  }

  private targetPosition(cursor: Point, platform: Rectangle): Point {
    return {
      x: clamp(
        snap(cursor.x - platform.width / 2),
        0,
        this.level.world.width - platform.width,
      ),
      y: clamp(
        snap(cursor.y - platform.height / 2),
        0,
        this.level.world.height - platform.height,
      ),
    };
  }

  private updateMovingTravelTime(): void {
    const output = select('#moving-travel-time');
    if (!this.pendingMovingPlatform || !this.pendingMovingTarget) {
      output.textContent = '—';
      return;
    }

    output.textContent = `${this.movingTravelTime(
      this.pendingMovingPlatform,
      this.pendingMovingTarget,
    ).toFixed(1)}s`;
  }

  private movingTravelTime(start: Rectangle, target: Point): number {
    return Math.hypot(target.x - start.x, target.y - start.y) / this.movingSpeed;
  }

  private eraseAt(point: Point): void {
    const movingIndex = findRectangleAt(this.level.movingPlatforms, point);
    if (movingIndex >= 0) {
      this.level.movingPlatforms.splice(movingIndex, 1);
      return;
    }

    const crumbleIndex = findRectangleAt(this.level.crumblePlatforms, point);
    if (crumbleIndex >= 0) {
      this.level.crumblePlatforms.splice(crumbleIndex, 1);
      return;
    }

    const platformIndex = findRectangleAt(this.level.platforms, point);
    if (platformIndex >= 0) {
      this.level.platforms.splice(platformIndex, 1);
      return;
    }

    const hazardIndex = findRectangleAt(this.level.hazards, point);
    if (hazardIndex >= 0) {
      this.level.hazards.splice(hazardIndex, 1);
      return;
    }

    const shardIndex = this.level.shards.findIndex(
      (shard) => Math.hypot(shard.x - point.x, shard.y - point.y) < 35,
    );
    if (shardIndex >= 0) {
      this.level.shards.splice(shardIndex, 1);
      return;
    }

    const trapIndex = this.level.arrowTraps.findIndex(
      (trap) => Math.hypot(trap.x - point.x, trap.y - point.y) < 40,
    );
    if (trapIndex >= 0) this.level.arrowTraps.splice(trapIndex, 1);
  }

  private clearLevel(): void {
    this.saveHistory();
    this.level.platforms = [];
    this.level.hazards = [];
    this.level.shards = [];
    this.level.movingPlatforms = [];
    this.level.crumblePlatforms = [];
    this.level.arrowTraps = [];
    this.render();
    this.showMessage('Canvas cleared. Add at least one platform before importing.');
  }

  private saveHistory(): void {
    this.history.push(cloneLevel(this.level));
    if (this.history.length > 50) this.history.shift();
  }

  private undo(): void {
    const previous = this.history.pop();
    if (!previous) {
      this.showMessage('Nothing to undo.');
      return;
    }

    this.level = previous;
    this.nameInput.value = this.level.name;
    this.render();
  }

  private exportCode(): void {
    this.syncName();
    this.dataField.value = exportLevelBase64(this.level);
    this.showMessage('Base64 level code ready.');
  }

  private async copyExport(): Promise<void> {
    if (!this.dataField.value.trim()) this.exportCode();

    try {
      await navigator.clipboard.writeText(this.dataField.value);
      this.showMessage('Copied to clipboard.');
    } catch {
      this.dataField.select();
      this.showMessage('Select and copy the highlighted level data.');
    }
  }

  private import(): void {
    try {
      const imported = importLevel(this.dataField.value);
      this.saveHistory();
      this.level = imported;
      this.savedLevelId = null;
      this.nameInput.value = this.level.name;
      this.render();
      this.showMessage('Level imported successfully.');
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Import failed.', true);
    }
  }

  private saveToLibrary(): void {
    try {
      this.syncName();
      const saved = saveLevel(this.level, this.savedLevelId);
      this.savedLevelId = saved.id;
      this.onSaved(saved.id);
      this.close();
    } catch {
      this.showMessage('Unable to save. Browser storage may be full or disabled.', true);
    }
  }


  private syncName(): void {
    this.level.name = this.nameInput.value.trim() || 'Untitled Level';
  }

  private showMessage(text: string, isError = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('error', isError);
  }

  private resizeCanvas(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.max(1, Math.floor(width * ratio));
    this.canvas.height = Math.max(1, Math.floor(height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.render();
  }

  private render(): void {
    const { context } = this;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const scaleX = width / this.level.world.width;
    const scaleY = height / this.level.world.height;

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#0d1929';
    context.fillRect(0, 0, width, height);

    this.drawGrid(context, width, height, scaleX, scaleY);
    this.level.platforms.forEach((item) =>
      drawRectangle(context, item, scaleX, scaleY, '#294159', '#6f8ba3'),
    );
    this.level.hazards.forEach((item) =>
      drawRectangle(context, item, scaleX, scaleY, '#8d3d43', '#f06156'),
    );
    this.level.movingPlatforms.forEach((item) => {
      drawRectangle(context, item, scaleX, scaleY, '#315f78', '#71c6e8');
      drawRail(context, item, scaleX, scaleY);
      drawRectangle(
        context,
        { ...item.target, width: item.width, height: item.height },
        scaleX,
        scaleY,
        '#315f7833',
        '#71c6e888',
      );
    });
    this.level.crumblePlatforms.forEach((item) =>
      drawCrumblePlatform(context, item, scaleX, scaleY),
    );
    this.level.arrowTraps.forEach((trap) =>
      drawArrowTrap(context, trap, scaleX, scaleY),
    );
    if (this.tool === 'arrow' && this.hoverPoint) {
      context.save();
      context.globalAlpha = 0.55;
      drawArrowTrap(
        context,
        {
          ...this.hoverPoint,
          direction: this.arrowDirection,
          interval: 1.8,
          speed: 420,
        },
        scaleX,
        scaleY,
      );
      context.restore();
    }
    this.level.shards.forEach((point) =>
      drawDiamond(context, point, scaleX, scaleY, '#c9fa49'),
    );
    drawMarker(context, this.level.spawn, scaleX, scaleY, '#70e0bf', 'S');
    drawRectangle(context, this.level.finish, scaleX, scaleY, '#657b2d55', '#c9fa49');
    drawMarker(
      context,
      {
        x: this.level.finish.x + this.level.finish.width / 2,
        y: this.level.finish.y + this.level.finish.height / 2,
      },
      scaleX,
      scaleY,
      '#c9fa49',
      'F',
    );

    if (this.dragStart && this.dragEnd) {
      const preview = rectangleFromPoints(this.dragStart, this.dragEnd);
      const color = this.tool === 'hazard' ? '#f06156' : '#c9fa49';
      drawRectangle(context, preview, scaleX, scaleY, `${color}33`, color);
    }

    if (this.pendingMovingPlatform && this.pendingMovingTarget) {
      const pending = this.pendingMovingPlatform;
      const target = {
        ...this.pendingMovingTarget,
        width: pending.width,
        height: pending.height,
      };
      drawRectangle(context, pending, scaleX, scaleY, '#315f78', '#71c6e8');
      drawPathBetween(context, pending, target, scaleX, scaleY);
      drawRectangle(context, target, scaleX, scaleY, '#315f7855', '#bdeeff');
    }

    setText('#platform-count', String(this.level.platforms.length));
    setText('#hazard-count', String(this.level.hazards.length));
    setText('#shard-count', String(this.level.shards.length));
    setText(
      '#mechanic-count',
      String(
        this.level.movingPlatforms.length +
        this.level.crumblePlatforms.length +
        this.level.arrowTraps.length,
      ),
    );
  }

  private drawGrid(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    scaleX: number,
    scaleY: number,
  ): void {
    context.beginPath();
    context.strokeStyle = 'rgba(125, 153, 175, 0.13)';
    context.lineWidth = 1;

    for (let x = 0; x <= this.level.world.width; x += 100) {
      context.moveTo(x * scaleX, 0);
      context.lineTo(x * scaleX, height);
    }
    for (let y = 0; y <= this.level.world.height; y += 100) {
      context.moveTo(0, y * scaleY);
      context.lineTo(width, y * scaleY);
    }
    context.stroke();
  }

  private eventToWorld(event: PointerEvent, snapToGrid = true): Point {
    const worldX = (event.offsetX / this.canvas.clientWidth) * this.level.world.width;
    const worldY = (event.offsetY / this.canvas.clientHeight) * this.level.world.height;

    return {
      x: clamp(snapToGrid ? snap(worldX) : worldX, 0, this.level.world.width),
      y: clamp(snapToGrid ? snap(worldY) : worldY, 0, this.level.world.height),
    };
  }
}

function rectangleFromPoints(start: Point, end: Point): Rectangle {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(GRID_SIZE, Math.abs(end.x - start.x)),
    height: Math.max(GRID_SIZE, Math.abs(end.y - start.y)),
  };
}

function findRectangleAt(rectangles: Rectangle[], point: Point): number {
  for (let index = rectangles.length - 1; index >= 0; index -= 1) {
    const item = rectangles[index];
    if (
      point.x >= item.x &&
      point.x <= item.x + item.width &&
      point.y >= item.y &&
      point.y <= item.y + item.height
    ) return index;
  }
  return -1;
}

function drawRectangle(
  context: CanvasRenderingContext2D,
  item: Rectangle,
  scaleX: number,
  scaleY: number,
  fill: string,
  stroke: string,
): void {
  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = 1;
  context.fillRect(item.x * scaleX, item.y * scaleY, item.width * scaleX, item.height * scaleY);
  context.strokeRect(item.x * scaleX, item.y * scaleY, item.width * scaleX, item.height * scaleY);
}

function drawCrumblePlatform(
  context: CanvasRenderingContext2D,
  item: Rectangle,
  scaleX: number,
  scaleY: number,
): void {
  drawRectangle(context, item, scaleX, scaleY, '#73564f', '#d89779');

  const x = item.x * scaleX;
  const y = item.y * scaleY;
  const width = item.width * scaleX;
  const height = item.height * scaleY;
  context.beginPath();
  context.moveTo(x + width * 0.47, y + 1);
  context.lineTo(x + width * 0.5, y + height * 0.45);
  context.lineTo(x + width * 0.42, y + height - 1);
  context.moveTo(x + width * 0.5, y + height * 0.45);
  context.lineTo(x + width * 0.63, y + height * 0.72);
  context.lineTo(x + width * 0.7, y + height - 1);
  context.moveTo(x + width * 0.49, y + height * 0.38);
  context.lineTo(x + width * 0.34, y + height * 0.62);
  context.strokeStyle = '#f0b28f';
  context.lineWidth = 1.5;
  context.stroke();
}

function drawRail(
  context: CanvasRenderingContext2D,
  item: LevelDefinition['movingPlatforms'][number],
  scaleX: number,
  scaleY: number,
): void {
  drawPathBetween(
    context,
    item,
    { ...item.target, width: item.width, height: item.height },
    scaleX,
    scaleY,
  );
}

function drawPathBetween(
  context: CanvasRenderingContext2D,
  start: Rectangle,
  target: Rectangle,
  scaleX: number,
  scaleY: number,
): void {
  const startX = (start.x + start.width / 2) * scaleX;
  const startY = (start.y + start.height / 2) * scaleY;
  const endX = (target.x + target.width / 2) * scaleX;
  const endY = (target.y + target.height / 2) * scaleY;

  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.strokeStyle = '#71c6e8';
  context.setLineDash([4, 4]);
  context.stroke();
  context.setLineDash([]);
}

function drawArrowTrap(
  context: CanvasRenderingContext2D,
  trap: LevelDefinition['arrowTraps'][number],
  scaleX: number,
  scaleY: number,
): void {
  const x = trap.x * scaleX;
  const y = trap.y * scaleY;
  const vectors: Record<ArrowTrap['direction'], Point> = {
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    up: { x: 0, y: -1 },
  };
  const direction = vectors[trap.direction];
  const perpendicular = { x: -direction.y, y: direction.x };

  context.fillStyle = '#6b3440';
  context.fillRect(x - 6, y - 7, 12, 14);
  context.beginPath();
  context.moveTo(
    x - 3 * direction.x - 5 * perpendicular.x,
    y - 3 * direction.y - 5 * perpendicular.y,
  );
  context.lineTo(x + 9 * direction.x, y + 9 * direction.y);
  context.lineTo(
    x - 3 * direction.x + 5 * perpendicular.x,
    y - 3 * direction.y + 5 * perpendicular.y,
  );
  context.closePath();
  context.fillStyle = '#f06156';
  context.fill();
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  point: Point,
  scaleX: number,
  scaleY: number,
  color: string,
): void {
  const x = point.x * scaleX;
  const y = point.y * scaleY;
  context.beginPath();
  context.moveTo(x, y - 6);
  context.lineTo(x + 5, y);
  context.lineTo(x, y + 6);
  context.lineTo(x - 5, y);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function drawMarker(
  context: CanvasRenderingContext2D,
  point: Point,
  scaleX: number,
  scaleY: number,
  color: string,
  label: string,
): void {
  const x = point.x * scaleX;
  const y = point.y * scaleY;
  context.beginPath();
  context.arc(x, y, 9, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.fillStyle = '#0b1321';
  context.font = 'bold 9px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, x, y + 0.5);
}

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function directionIcon(direction: ArrowTrap['direction']): string {
  return { right: '→', down: '↓', left: '←', up: '↑' }[direction];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function select(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing editor element: ${selector}`);
  return element;
}

function selectCanvas(selector: string): HTMLCanvasElement {
  const element = document.querySelector<HTMLCanvasElement>(selector);
  if (!element) throw new Error(`Missing editor canvas: ${selector}`);
  return element;
}

function selectInput(selector: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(selector);
  if (!element) throw new Error(`Missing editor input: ${selector}`);
  return element;
}

function selectTextArea(selector: string): HTMLTextAreaElement {
  const element = document.querySelector<HTMLTextAreaElement>(selector);
  if (!element) throw new Error(`Missing editor textarea: ${selector}`);
  return element;
}

function setText(selector: string, text: string): void {
  select(selector).textContent = text;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
