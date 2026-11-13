import { LevelDefinition } from './config';
import { deleteSavedLevel, listSavedLevels, SavedLevel } from './level-storage';

type MenuScreen = 'home' | 'official' | 'saved';

type MenuActions = {
  playOfficial: () => void;
  playSaved: (level: LevelDefinition) => void;
  editSaved: (level: LevelDefinition) => void;
  createLevel: () => void;
};

export class MenuController {
  private readonly overlay = select('#menu-overlay');
  private readonly savedList = select('#menu-saved-list');

  constructor(private readonly actions: MenuActions) {
    this.bindNavigation();
  }

  open(screen: MenuScreen = 'home'): void {
    this.overlay.classList.remove('hidden');
    this.showScreen(screen);
  }

  close(): void {
    this.overlay.classList.add('hidden');
  }

  showSavedLevels(): void {
    this.open('saved');
  }

  private bindNavigation(): void {
    document.querySelectorAll<HTMLElement>('[data-menu-target]').forEach((button) => {
      button.addEventListener('click', () => {
        this.showScreen(button.dataset.menuTarget as MenuScreen);
      });
    });

    select('#play-official').addEventListener('click', () => {
      this.close();
      this.actions.playOfficial();
    });

    select('#menu-editor').addEventListener('click', () => {
      this.close();
      this.actions.createLevel();
    });

    select('#saved-new-level').addEventListener('click', () => {
      this.close();
      this.actions.createLevel();
    });
  }

  private showScreen(screen: MenuScreen): void {
    document.querySelectorAll<HTMLElement>('.menu-screen').forEach((element) => {
      element.classList.toggle('active', element.id === `menu-${screen}`);
    });

    if (screen === 'saved') this.renderSavedLevels();
  }

  private renderSavedLevels(): void {
    const levels = listSavedLevels();
    this.savedList.replaceChildren();

    if (levels.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'menu-empty-library';
      empty.innerHTML = '<b>NO SAVED LEVELS</b><p>Create a level in the editor, then save it to see it here.</p>';
      this.savedList.appendChild(empty);
      return;
    }

    levels.forEach((saved, index) => {
      this.savedList.appendChild(this.createSavedLevelCard(saved, index));
    });
  }

  private createSavedLevelCard(saved: SavedLevel, index: number): HTMLElement {
    const card = document.createElement('article');
    card.className = 'level-card saved-card';

    const number = document.createElement('span');
    number.className = 'level-card-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const details = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = saved.name;
    const date = document.createElement('small');
    date.textContent = `Saved ${formatDate(saved.updatedAt)}`;
    details.append(name, date);

    const actions = document.createElement('div');
    actions.className = 'saved-card-actions';
    actions.append(
      createButton('PLAY', () => {
        this.close();
        this.actions.playSaved(saved.level);
      }),
      createButton('EDIT', () => {
        this.close();
        this.actions.editSaved(saved.level);
      }),
      createButton('DELETE', () => {
        deleteSavedLevel(saved.id);
        this.renderSavedLevels();
      }, 'delete'),
    );

    card.append(number, details, actions);
    return card;
  }
}

function createButton(
  label: string,
  action: () => void,
  className = '',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.className = className;
  button.addEventListener('click', action);
  return button;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function select(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing menu element: ${selector}`);
  return element;
}
