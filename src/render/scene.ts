import { ASSET_BASE } from '../assets';
import { AnimatedSprite, Application, Container, Sprite, Texture, type Spritesheet } from 'pixi.js';
import { isRoadTile, type Building, type Content, type GameState, type Highlight, type Reaction, type Resident } from '../sim';
import { loadArt, type ArtAssets } from './assets';

/**
 * Isometric city view (CONCEPT.md §7.2). Purely presentational: it reads GameState and animates
 * residents through a daily routine. Randomness here is cosmetic, so Math.random is fine.
 */

const HALF_W = 32;
const HALF_H = 16;
const screenOf = (tx: number, ty: number) => ({ x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H });

type Pt = { x: number; y: number };
type WalkAnim = 'walk' | 'walk_bag' | 'walk_suitcase' | 'walk_angry';
type Stop = 'home' | 'work' | 'shop' | 'bar' | 'stroll' | 'other';

const REACTION_ANIM: Record<Reaction, string> = {
  scared: 'react_scared',
  happy: 'react_happy',
  doubted: 'react_shrug',
  talk: 'react_talk',
  outraged: 'react_outraged',
};
export const REACTION_ICON: Record<Reaction, string> = {
  scared: 'believed_bad',
  happy: 'believed_good',
  doubted: 'doubted',
  talk: 'talk',
  outraged: 'exposed',
};
const REACTION_SECONDS = 2.6;

interface Agent {
  id: number;
  sprite: AnimatedSprite;
  sheet: Spritesheet;
  pos: Pt;
  offset: Pt;
  path: Pt[];
  speed: number;
  walkAnim: WalkAnim;
  mode: 'walk' | 'inside' | 'idle' | 'work' | 'react' | 'protest';
  timer: number;
  onArrive: (() => void) | null;
  anim: string;
  /** Road tile where the agent entered a building. */
  door: Pt | null;
  icon: Sprite | null;
  pendingReaction: Reaction | null;
  reactDelay: number;
  lastStop: Stop;
  leaving: boolean;
  job: number | null;
}

/** A temporary figure acting out a cutscene (CONCEPT.md §7.3): a fighter, a protester, a peacemaker. */
interface Actor {
  sprite: AnimatedSprite;
  base: Pt;
  /** fight = sways and jabs towards the other side; cheer = hops in place. */
  motion: 'fight' | 'cheer' | 'still';
  phase: number;
}

interface CameraView {
  scale: number;
  x: number;
  y: number;
}

export interface HoverTarget {
  kind: 'resident' | 'building';
  id: number;
  clientX: number;
  clientY: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOne = <T>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];
const hash = (x: number, y: number) => (Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) / 4294967296;

export class CityScene {
  private world = new Container();
  private ground = new Container();
  private objects = new Container();
  private overlay = new Container();
  private state!: GameState;
  private agents = new Map<number, Agent>();
  private buildingSprites = new Map<number, AnimatedSprite>();
  private buildingKeys = new Map<number, string>();
  private doors = new Map<number, Pt>();
  private exit: Pt = { x: 0, y: 0 };
  private offMap: Pt = { x: -2, y: 0 };
  private mapKey = '';
  private zoomLevel = 0;
  private pan = { x: 0, y: 0 };
  private bounds = { minX: 0, minY: 0, w: 1, h: 1 };
  // Cutscene: a camera that overrides the player's view, actors and pulsing icons.
  private camera: CameraView | null = null;
  private tween: { from: CameraView; to: CameraView; t: number; dur: number } | null = null;
  private actors: Actor[] = [];
  private fxSprites: { sprite: Sprite; base: Pt; phase: number }[] = [];
  private clock = 0;
  private skipping = false;
  private wakeCutscene: (() => void) | null = null;

  private constructor(
    private app: Application,
    private art: ArtAssets,
    private c: Content,
    private onHover: (t: HoverTarget | null) => void,
  ) {}

  static async create(
    host: HTMLElement,
    c: Content,
    state: GameState,
    onHover: (t: HoverTarget | null) => void,
  ): Promise<CityScene> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      roundPixels: true,
    });
    host.appendChild(app.canvas);
    const art = await loadArt(ASSET_BASE);
    const scene = new CityScene(app, art, c, onHover);
    scene.world.addChild(scene.ground, scene.objects, scene.overlay);
    scene.objects.sortableChildren = true;
    app.stage.addChild(scene.world);
    app.ticker.add((t) => scene.update(Math.min(0.1, t.deltaMS / 1000)));
    app.renderer.on('resize', () => scene.layout());
    scene.setupInput();
    scene.setState(state, false);
    return scene;
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  // ---------- Map ----------

  private build(state: GameState): void {
    this.ground.removeChildren().forEach((c) => c.destroy());
    this.objects.removeChildren().forEach((c) => c.destroy());
    this.overlay.removeChildren().forEach((c) => c.destroy());
    this.agents.clear();
    this.buildingSprites.clear();
    this.buildingKeys.clear();
    this.doors.clear();
    this.state = state;
    const n = state.mapSize;
    const mid = 3 * Math.floor(this.c.balance.mapBlocks / 2);
    this.exit = { x: 0, y: mid };
    this.offMap = { x: -2.5, y: mid };

    const occupied = new Set<string>();
    for (const b of state.buildings) {
      for (let dx = 0; dx < b.size; dx++) for (let dy = 0; dy < b.size; dy++) occupied.add(`${b.x + dx},${b.y + dy}`);
    }

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let tex: Texture;
        if (isRoadTile(x, y)) {
          const alongX = y % 3 === 0;
          const alongY = x % 3 === 0;
          tex = this.art.tiles[alongX && alongY ? 'road_cross' : alongX ? 'road_x' : 'road_y'];
        } else {
          tex = this.art.tiles[`grass_${1 + Math.floor(hash(x, y) * this.art.manifest.grass)}`];
        }
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        const p = screenOf(x, y);
        s.position.set(p.x, p.y);
        this.ground.addChild(s);
      }
    }

    // Parks and greenery on free lot tiles.
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (isRoadTile(x, y) || occupied.has(`${x},${y}`)) continue;
        const lotX = x - ((x - 1) % 3);
        const lotY = y - ((y - 1) % 3);
        const lotEmpty = [0, 1].every((dx) => [0, 1].every((dy) => !occupied.has(`${lotX + dx},${lotY + dy}`)));
        const h = hash(x * 7 + 1, y * 13 + 5);
        let name: string | null;
        if (lotEmpty && x === lotX + 1 && y === lotY + 1) name = 'fountain';
        else if (lotEmpty) name = h < 0.45 ? `tree_${1 + Math.floor(h * 6.6)}` : h < 0.65 ? 'bench' : h < 0.8 ? 'lamp' : 'flowers';
        else name = h < 0.55 ? `tree_${1 + Math.floor(h * 5.4)}` : h < 0.8 ? 'bush' : 'flowers';
        const sheet = this.art.decor[name];
        if (!sheet) continue;
        const s = new AnimatedSprite(sheet.animations.idle);
        s.anchor.set(0.5, 1);
        const p = screenOf(x, y);
        s.position.set(p.x, p.y + HALF_H);
        s.zIndex = p.y;
        if (s.totalFrames > 1) {
          s.animationSpeed = 0.06;
          s.gotoAndPlay(Math.floor(Math.random() * s.totalFrames));
        }
        this.objects.addChild(s);
      }
    }

    for (const b of state.buildings) {
      this.doors.set(b.id, this.doorOf(b, n));
      const sprite = new AnimatedSprite([Texture.EMPTY]);
      sprite.anchor.set(0.5, 1);
      const bottom = screenOf(b.x + b.size - 1, b.y + b.size - 1);
      sprite.position.set(bottom.x, bottom.y + HALF_H);
      sprite.zIndex = screenOf(b.x + (b.size - 1) / 2, b.y + (b.size - 1) / 2).y;
      sprite.animationSpeed = 0.05;
      sprite.eventMode = 'static';
      sprite.cursor = 'help';
      const hover = (e: { client: Pt }) => this.onHover({ kind: 'building', id: b.id, clientX: e.client.x, clientY: e.client.y });
      sprite.on('pointerover', hover).on('pointermove', hover).on('pointerout', () => this.onHover(null));
      this.objects.addChild(sprite);
      this.buildingSprites.set(b.id, sprite);
    }

    this.bounds = {
      minX: -n * HALF_W - 8,
      minY: -150,
      w: n * HALF_W * 2 + 16,
      h: 150 + (2 * n - 1) * HALF_H + 24,
    };
    this.layout();
  }

  /** The road tile in front of a building, preferring the side facing the camera. */
  private doorOf(b: Building, n: number): Pt {
    let best: Pt | null = null;
    for (let i = 0; i < b.size; i++) {
      for (const p of [
        { x: b.x + b.size, y: b.y + i },
        { x: b.x + i, y: b.y + b.size },
        { x: b.x - 1, y: b.y + i },
        { x: b.x + i, y: b.y - 1 },
      ]) {
        if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n || !isRoadTile(p.x, p.y)) continue;
        if (!best || p.x + p.y > best.x + best.y) best = p;
      }
    }
    return best ?? { x: b.x, y: b.y };
  }

  private pathTo(from: Pt, to: Pt): Pt[] {
    const n = this.state.mapSize;
    const start = { x: Math.round(from.x), y: Math.round(from.y) };
    const key = (p: Pt) => p.y * n + p.x;
    const inMap = (p: Pt) => p.x >= 0 && p.y >= 0 && p.x < n && p.y < n;
    if (!inMap(start) || !isRoadTile(start.x, start.y)) return [this.exit, ...this.pathTo(this.exit, to)];
    const prev = new Map<number, number>([[key(start), -1]]);
    const queue = [start];
    while (queue.length) {
      const p = queue.shift()!;
      if (p.x === to.x && p.y === to.y) break;
      for (const d of [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]) {
        const q = { x: p.x + d.x, y: p.y + d.y };
        if (!inMap(q) || !isRoadTile(q.x, q.y) || prev.has(key(q))) continue;
        prev.set(key(q), key(p));
        queue.push(q);
      }
    }
    const path: Pt[] = [];
    let k = prev.has(key(to)) ? key(to) : -1;
    while (k >= 0 && k !== key(start)) {
      path.unshift({ x: k % n, y: Math.floor(k / n) });
      k = prev.get(k)!;
    }
    return path;
  }

  private randomRoadTile(): Pt {
    const n = this.state.mapSize;
    for (;;) {
      const p = { x: Math.floor(Math.random() * n), y: Math.floor(Math.random() * n) };
      if (isRoadTile(p.x, p.y)) return p;
    }
  }

  // ---------- State sync ----------

  /** Syncs the view with a new game state; with playReactions, residents react to this turn's news. */
  setState(state: GameState, playReactions: boolean): void {
    const key = `${state.seed}:${state.buildings.length}:${state.mapSize}`;
    if (key !== this.mapKey) {
      this.mapKey = key;
      this.build(state);
    }
    this.state = state;
    this.syncBuildings();

    for (const r of state.residents) {
      const agent = this.agents.get(r.id);
      if (!agent) {
        if (r.status === 'active') this.spawn(r, playReactions);
        continue;
      }
      if (agent.job !== null && r.job === null && r.quitFrom.length) agent.walkAnim = 'walk_angry';
      agent.job = r.job;
      const mustMove =
        (r.status === 'left' && !agent.leaving) ||
        (r.protestTurns > 0 && agent.mode !== 'protest') ||
        (r.protestTurns === 0 && agent.mode === 'protest');
      if (mustMove && (agent.mode === 'inside' || agent.mode === 'idle' || agent.mode === 'work' || agent.mode === 'protest')) {
        agent.timer = Math.min(agent.timer, rand(0.2, 1.5));
        if (agent.mode === 'protest') agent.mode = 'idle';
      }
    }

    if (playReactions) {
      for (const [id, reaction] of Object.entries(state.lastReactions)) {
        const agent = this.agents.get(Number(id));
        if (!agent || agent.leaving) continue;
        agent.pendingReaction = reaction;
        agent.reactDelay = rand(0, 0.9);
      }
    }
  }

  private syncBuildings(): void {
    const occupiedHomes = new Set(this.state.residents.filter((r) => r.status === 'active').map((r) => r.home));
    for (const b of this.state.buildings) {
      const sheets = this.art.buildings[b.type];
      if (!sheets) continue;
      let s = b.open ? 'active' : 'closed';
      if (b.type === 'home') s = occupiedHomes.has(b.id) ? 'active' : 'abandoned';
      const sheet = sheets[s] ?? sheets.active;
      const variant = b.id % this.art.manifest.buildings[b.type].variants;
      const key = `${s}:${variant}`;
      if (this.buildingKeys.get(b.id) === key) continue;
      this.buildingKeys.set(b.id, key);
      const sprite = this.buildingSprites.get(b.id)!;
      sprite.textures = sheet.animations[`v${variant}`];
      if (sprite.totalFrames > 1) sprite.gotoAndPlay(Math.floor(Math.random() * sprite.totalFrames));
    }
  }

  // ---------- Agents ----------

  private spawn(r: Resident, arriving: boolean): void {
    const sheets = this.art.residents[r.group];
    if (!sheets) return;
    const sheet = sheets[r.id % sheets.length];
    const sprite = new AnimatedSprite(sheet.animations.idle_front);
    sprite.anchor.set(0.5, 1);
    sprite.eventMode = 'static';
    sprite.cursor = 'help';
    const hover = (e: { client: Pt }) => this.onHover({ kind: 'resident', id: r.id, clientX: e.client.x, clientY: e.client.y });
    sprite.on('pointerover', hover).on('pointermove', hover).on('pointerout', () => this.onHover(null));
    this.objects.addChild(sprite);
    const agent: Agent = {
      id: r.id,
      sprite,
      sheet,
      pos: { x: 0, y: 0 },
      offset: { x: rand(-0.25, 0.25), y: rand(-0.25, 0.25) },
      path: [],
      speed: rand(0.75, 1.15),
      walkAnim: 'walk',
      mode: 'inside',
      timer: 0,
      onArrive: null,
      anim: '',
      door: null,
      icon: null,
      pendingReaction: null,
      reactDelay: 0,
      lastStop: 'home',
      leaving: false,
      job: r.job,
    };
    this.agents.set(r.id, agent);

    if (arriving) {
      // A newcomer walks in from the edge of the map with a suitcase.
      agent.pos = { ...this.offMap };
      agent.walkAnim = 'walk_suitcase';
      this.goTo(agent, this.doors.get(r.home)!, () => this.enter(agent, this.doors.get(r.home)!, rand(4, 8), 'home'));
    } else if (r.protestTurns > 0) {
      this.goProtest(agent, true);
    } else if (Math.random() < 0.4) {
      agent.pos = this.randomRoadTile();
      this.planNext(agent);
    } else {
      const at = r.job !== null && Math.random() < 0.6 ? r.job : r.home;
      const door = this.doors.get(at)!;
      agent.pos = { ...door };
      this.enter(agent, door, rand(0, 12), at === r.home ? 'home' : 'work');
    }
    this.place(agent);
  }

  private setAnim(agent: Agent, name: string, mirror = agent.sprite.scale.x < 0): void {
    agent.sprite.scale.x = mirror ? -1 : 1;
    if (agent.anim === name) return;
    const textures = agent.sheet.animations[name];
    if (!textures) return;
    agent.anim = name;
    agent.sprite.textures = textures;
    agent.sprite.animationSpeed = name.startsWith('walk') ? 0.14 : name.startsWith('react') ? 0.16 : name === 'protest' ? 0.1 : 0.04;
    agent.sprite.play();
  }

  private goTo(agent: Agent, target: Pt, onArrive: () => void): void {
    agent.path = this.pathTo(agent.pos, target);
    agent.mode = 'walk';
    agent.onArrive = onArrive;
    agent.sprite.visible = true;
    if (agent.path.length === 0) {
      agent.onArrive = null;
      onArrive();
    }
  }

  private enter(agent: Agent, door: Pt, seconds: number, stop: Stop): void {
    agent.mode = 'inside';
    agent.door = door;
    agent.timer = seconds;
    agent.lastStop = stop;
    agent.sprite.visible = false;
    agent.walkAnim = stop === 'shop' ? 'walk_bag' : 'walk';
  }

  private openBuildings(type: string): Building[] {
    return this.state.buildings.filter((b) => b.type === type && b.open);
  }

  /** Daily routine: work, shopping, a bar, a stroll or home. */
  private planNext(agent: Agent): void {
    const r = this.state.residents[agent.id];
    if (agent.mode === 'inside' && agent.door) {
      agent.pos = { ...agent.door };
      agent.sprite.visible = true;
    }
    if (r.status === 'left') return this.leave(agent);
    if (r.protestTurns > 0) return this.goProtest(agent, false);
    // Afraid of crime: hurries home and stays in (CONCEPT.md §2.3).
    if (r.fearTurns > 0) {
      const home = this.state.buildings[r.home];
      const door = this.doors.get(home.id)!;
      this.goTo(agent, door, () => this.enter(agent, door, rand(12, 20), 'home'));
      return;
    }

    const visit = (b: Building | undefined, stop: Stop, seconds: number) => {
      if (!b) return false;
      const door = this.doors.get(b.id)!;
      this.goTo(agent, door, () => {
        if (stop === 'work' && b.type === 'factory' && Math.random() < 0.3) {
          agent.mode = 'work';
          agent.timer = seconds;
          agent.lastStop = 'work';
          this.setAnim(agent, 'work', Math.random() < 0.5);
        } else this.enter(agent, door, seconds, stop);
      });
      return true;
    };

    const job = r.job !== null ? this.state.buildings[r.job] : undefined;
    if (job && agent.lastStop !== 'work' && Math.random() < 0.6 && visit(job, 'work', rand(8, 14))) return;
    const roll = Math.random();
    if (agent.lastStop !== 'shop' && !r.avoid.shop && roll < 0.3 && visit(pickOne(this.openBuildings('shop')), 'shop', rand(2, 4))) return;
    if (!r.avoid.entertainment && roll < 0.42 && visit(pickOne(this.openBuildings('entertainment')), 'bar', rand(4, 8))) return;
    if (r.group === 'pensioners' && roll < 0.5 && visit(pickOne(this.openBuildings('hospital')), 'other', rand(3, 6))) return;
    if (roll < 0.62 && agent.lastStop !== 'stroll') {
      this.goTo(agent, this.randomRoadTile(), () => {
        agent.mode = 'idle';
        agent.timer = rand(1.5, 4);
        agent.lastStop = 'stroll';
        this.setAnim(agent, Math.random() < 0.5 ? 'idle_front' : 'idle_back');
      });
      return;
    }
    visit(this.state.buildings[r.home], 'home', rand(6, 12));
  }

  private leave(agent: Agent): void {
    agent.leaving = true;
    agent.walkAnim = 'walk_suitcase';
    this.goTo(agent, this.exit, () => {
      agent.path = [{ ...this.offMap }];
      agent.mode = 'walk';
      agent.onArrive = () => this.remove(agent);
    });
  }

  private goProtest(agent: Agent, instant: boolean): void {
    const hall = this.state.buildings.find((b) => b.type === 'cityHall');
    if (!hall) return;
    const door = this.doors.get(hall.id)!;
    const spot = { x: door.x + rand(-0.4, 0.4), y: door.y + rand(-0.4, 0.4) };
    const start = () => {
      agent.pos = spot;
      agent.mode = 'protest';
      agent.sprite.visible = true;
      this.setAnim(agent, 'protest', Math.random() < 0.5);
      agent.sprite.gotoAndPlay(Math.floor(Math.random() * 4));
    };
    if (instant) start();
    else this.goTo(agent, door, start);
  }

  private remove(agent: Agent): void {
    agent.icon?.destroy();
    agent.sprite.destroy();
    this.agents.delete(agent.id);
  }

  private startReaction(agent: Agent, reaction: Reaction): void {
    if (agent.mode === 'inside' && agent.door) agent.pos = { ...agent.door };
    agent.mode = 'react';
    agent.timer = REACTION_SECONDS;
    agent.path = [];
    agent.sprite.visible = true;
    this.setAnim(agent, REACTION_ANIM[reaction], Math.random() < 0.5);
    agent.sprite.gotoAndPlay(0);
    agent.icon?.destroy();
    const icon = new Sprite(this.art.fx[REACTION_ICON[reaction]]);
    icon.anchor.set(0.5, 1);
    this.overlay.addChild(icon);
    agent.icon = icon;
  }

  private place(agent: Agent): void {
    const p = screenOf(agent.pos.x + agent.offset.x, agent.pos.y + agent.offset.y);
    agent.sprite.position.set(Math.round(p.x), Math.round(p.y));
    agent.sprite.zIndex = p.y + 0.5;
    if (agent.icon) {
      const bob = Math.round(Math.sin((REACTION_SECONDS - agent.timer) * 8) * 1.2);
      agent.icon.position.set(Math.round(p.x), Math.round(p.y) - 18 + bob);
    }
  }

  private update(dt: number): void {
    this.clock += dt;
    this.updateCutscene(dt);
    for (const agent of [...this.agents.values()]) {
      if (agent.pendingReaction) {
        agent.reactDelay -= dt;
        if (agent.reactDelay <= 0) {
          this.startReaction(agent, agent.pendingReaction);
          agent.pendingReaction = null;
        }
      }
      switch (agent.mode) {
        case 'walk': {
          const target = agent.path[0];
          if (!target) {
            const done = agent.onArrive;
            agent.onArrive = null;
            if (done) done();
            else this.planNext(agent);
            break;
          }
          const dx = target.x - agent.pos.x;
          const dy = target.y - agent.pos.y;
          const dist = Math.hypot(dx, dy);
          const step = agent.speed * dt;
          if (step >= dist) {
            agent.pos = { ...target };
            agent.path.shift();
          } else {
            agent.pos.x += (dx / dist) * step;
            agent.pos.y += (dy / dist) * step;
          }
          const front = Math.abs(dx) >= Math.abs(dy) ? dx > 0 : dy > 0;
          const mirror = Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy > 0;
          this.setAnim(agent, `${agent.walkAnim}_${front ? 'front' : 'back'}`, mirror);
          if (agent.leaving) agent.sprite.alpha = Math.max(0, Math.min(1, agent.pos.x + 1.5));
          break;
        }
        case 'react':
          agent.timer -= dt;
          if (agent.timer <= 0) {
            agent.icon?.destroy();
            agent.icon = null;
            agent.mode = 'idle';
            this.planNext(agent);
          }
          break;
        case 'inside':
        case 'idle':
        case 'work':
          agent.timer -= dt;
          if (agent.timer <= 0) this.planNext(agent);
          break;
        case 'protest':
          break;
      }
      if (this.agents.has(agent.id)) this.place(agent);
    }
  }

  // ---------- Camera ----------

  private fitZoom(): number {
    const dpr = this.app.renderer.resolution;
    const { width, height } = this.app.screen;
    return Math.min((width * dpr) / this.bounds.w, (height * dpr) / this.bounds.h);
  }

  /** Integer zoom in device pixels keeps pixel art crisp; below ×1 the city shrinks to fit (phones). */
  layout(): void {
    if (this.camera) {
      this.world.scale.set(this.camera.scale);
      this.world.position.set(this.camera.x, this.camera.y);
      return;
    }
    const dpr = this.app.renderer.resolution;
    const fit = this.fitZoom();
    const level = this.zoomLevel || this.defaultLevel();
    // A phone where even ×1 does not fit starts at twice the fitting size.
    const scale = fit < 1 && !this.zoomLevel ? (2 * fit) / dpr : level / dpr;
    const { width, height } = this.app.screen;
    this.world.scale.set(scale);
    const x = (width - this.bounds.w * scale) / 2 - this.bounds.minX * scale + this.pan.x;
    const y = (height - this.bounds.h * scale) / 2 - this.bounds.minY * scale + this.pan.y;
    this.world.position.set(Math.round(x * dpr) / dpr, Math.round(y * dpr) / dpr);
  }

  /** The starting zoom: one integer step closer than the whole city (CONCEPT.md §7.3). */
  private defaultLevel(): number {
    return Math.max(1, Math.floor(this.fitZoom())) + 1;
  }

  zoomBy(delta: number): void {
    const fit = this.fitZoom();
    const current = this.zoomLevel || (fit < 1 ? Math.max(1, Math.round(2 * fit)) : this.defaultLevel());
    this.zoomLevel = Math.max(1, Math.min(6, current + delta));
    this.layout();
  }

  resetView(): void {
    this.zoomLevel = 0;
    this.pan = { x: 0, y: 0 };
    this.layout();
  }

  private setupInput(): void {
    const canvas = this.app.canvas;
    let drag: { x: number; y: number; panX: number; panY: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, panX: this.pan.x, panY: this.pan.y };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.pan = { x: drag.panX + e.clientX - drag.x, y: drag.panY + e.clientY - drag.y };
      this.layout();
    });
    const stop = () => (drag = null);
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  // ---------- Cutscenes (CONCEPT.md §7.3) ----------

  /** The view that puts a world point in the middle of the screen at an integer device-pixel zoom. */
  private viewAt(world: Pt, zoom: number): CameraView {
    const dpr = this.app.renderer.resolution;
    const scale = zoom / dpr;
    const { width, height } = this.app.screen;
    return { scale, x: width / 2 - world.x * scale, y: height / 2 - world.y * scale };
  }

  private currentView(): CameraView {
    return { scale: this.world.scale.x, x: this.world.position.x, y: this.world.position.y };
  }

  private flyTo(to: CameraView, seconds: number): Promise<void> {
    this.camera = this.currentView();
    this.tween = { from: this.camera, to, t: 0, dur: seconds };
    return this.wait(seconds * 1000);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.skipping) return resolve();
      const done = () => {
        window.clearTimeout(timer);
        this.wakeCutscene = null;
        resolve();
      };
      const timer = window.setTimeout(done, ms);
      this.wakeCutscene = done;
    });
  }

  /** Ends the running cutscene at once. */
  skipCutscene(): void {
    this.skipping = true;
    this.wakeCutscene?.();
  }

  private updateCutscene(dt: number): void {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(tw.dur, tw.t + dt);
      const k = tw.dur ? tw.t / tw.dur : 1;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera = {
        scale: tw.from.scale + (tw.to.scale - tw.from.scale) * e,
        x: tw.from.x + (tw.to.x - tw.from.x) * e,
        y: tw.from.y + (tw.to.y - tw.from.y) * e,
      };
      if (k >= 1) this.tween = null;
      this.layout();
    }
    for (const a of this.actors) {
      a.phase += dt;
      const p = screenOf(a.base.x, a.base.y);
      let dx = 0;
      let dy = 0;
      if (a.motion === 'fight') {
        // Lunges towards the opponent and back, with a little shake.
        const facing = a.sprite.scale.x < 0 ? -1 : 1;
        dx = Math.max(0, Math.sin(a.phase * 9)) * 3 * facing + Math.sin(a.phase * 37) * 0.6;
      } else if (a.motion === 'cheer') dy = -Math.abs(Math.sin(a.phase * 6)) * 3;
      a.sprite.position.set(Math.round(p.x + dx), Math.round(p.y + dy));
      a.sprite.zIndex = p.y + 0.5;
    }
    for (const f of this.fxSprites) {
      f.phase += dt;
      const p = screenOf(f.base.x, f.base.y);
      const s = 1.5 + Math.max(0, Math.sin(f.phase * 7)) * 0.8;
      f.sprite.scale.set(s);
      f.sprite.position.set(Math.round(p.x), Math.round(p.y - 26 - Math.sin(f.phase * 4) * 2));
    }
  }

  private addActor(group: string, at: Pt, anim: string, faceLeft: boolean, motion: Actor['motion'], variant = 0): void {
    const sheets = this.art.residents[group];
    if (!sheets) return;
    const sheet = sheets[variant % sheets.length];
    const sprite = new AnimatedSprite(sheet.animations[anim] ?? sheet.animations.idle_front);
    sprite.anchor.set(0.5, 1);
    sprite.scale.x = faceLeft ? -1 : 1;
    sprite.animationSpeed = 0.16;
    sprite.play();
    this.objects.addChild(sprite);
    this.actors.push({ sprite, base: at, motion, phase: Math.random() * 3 });
  }

  private addFx(name: string, at: Pt): void {
    const tex = this.art.fx[name];
    if (!tex) return;
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5, 1);
    this.overlay.addChild(sprite);
    this.fxSprites.push({ sprite, base: at, phase: Math.random() });
  }

  private clearActors(): void {
    for (const a of this.actors) a.sprite.destroy();
    for (const f of this.fxSprites) f.sprite.destroy();
    this.actors = [];
    this.fxSprites = [];
  }

  private tourRun = 0;

  /** A slow camera drift from building to building behind the menu and the opening story. */
  startTour(): void {
    const run = ++this.tourRun;
    const zoom = Math.max(2, Math.min(5, Math.floor(Math.max(1, this.fitZoom())) + 1));
    const step = () => {
      if (run !== this.tourRun) return;
      const b = pickOne(this.state.buildings);
      const door = b && this.doors.get(b.id);
      if (door) {
        const p = screenOf(door.x, door.y);
        this.camera ??= this.currentView();
        this.tween = { from: this.camera, to: this.viewAt({ x: p.x, y: p.y - 16 }, zoom), t: 0, dur: 7 };
      }
      window.setTimeout(step, 7000);
    };
    step();
  }

  /** Back to the player's view. */
  stopTour(): void {
    this.tourRun++;
    this.camera = null;
    this.tween = null;
    this.layout();
  }

  /** Where a highlight happens on the map (tile coordinates). */
  private spotOf(h: Highlight): Pt {
    if (h.kind === 'exodus') return { ...this.exit };
    if (h.building !== null && this.doors.has(h.building)) return { ...this.doors.get(h.building)! };
    const n = this.state.mapSize;
    return { x: n / 2, y: n / 2 };
  }

  /**
   * Plays the day's bright moments one by one (CONCEPT.md §7.3): the camera flies to the place,
   * figures act it out (a fight, a clash, a reconciliation; real protesters and leavers are already
   * walking there), then the camera returns to the player's view. Resolves when done or skipped.
   */
  async playHighlights(highlights: Highlight[], onShow: (h: Highlight | null) => void): Promise<void> {
    if (!highlights.length) return;
    this.skipping = false;
    const home = this.currentView();
    // Three integer steps closer than the whole-city view.
    const zoom = Math.max(3, Math.min(6, Math.floor(Math.max(1, this.fitZoom())) + 3));
    for (const h of highlights) {
      if (this.skipping) break;
      const spot = this.spotOf(h);
      const center = screenOf(spot.x, spot.y);
      onShow(h);
      await this.flyTo(this.viewAt({ x: center.x, y: center.y - 12 }, zoom), 0.9);
      const [a, z] = h.groups;
      if (h.kind === 'fight' && a && z) {
        // The two exchange blows; a bystander from the first group recoils.
        this.addActor(a, { x: spot.x - 0.16, y: spot.y + 0.08 }, 'fight', false, 'fight');
        this.addActor(z, { x: spot.x + 0.16, y: spot.y - 0.08 }, 'fight', true, 'fight', 1);
        this.addActor(a, { x: spot.x - 0.55, y: spot.y + 0.45 }, 'react_scared', false, 'still', 1);
        this.addActor(z, { x: spot.x + 0.55, y: spot.y - 0.4 }, 'react_outraged', true, 'still');
        this.addFx('fight', spot);
      } else if (h.kind === 'clash' && a && z) {
        // Two crowds: the front rows fight, the back rows wave placards.
        for (let i = 0; i < 4; i++) {
          this.addActor(a, { x: spot.x - (i % 2 ? 0.55 : 0.2), y: spot.y - 0.45 + i * 0.3 }, i % 2 ? 'protest' : 'fight', false, i % 2 ? 'cheer' : 'fight', i);
          this.addActor(z, { x: spot.x + (i % 2 ? 0.55 : 0.2), y: spot.y - 0.45 + i * 0.3 }, i % 2 ? 'protest' : 'fight', true, i % 2 ? 'cheer' : 'fight', i + 1);
        }
        this.addFx('fight', { x: spot.x, y: spot.y - 0.2 });
        this.addFx('fight', { x: spot.x, y: spot.y + 0.4 });
      } else if (h.kind === 'reconcile' && a && z) {
        this.addActor(a, { x: spot.x - 0.2, y: spot.y + 0.1 }, 'react_happy', false, 'cheer');
        this.addActor(z, { x: spot.x + 0.2, y: spot.y - 0.1 }, 'react_happy', true, 'cheer', 1);
        this.addFx('peace', spot);
      } else if (h.kind === 'protest') {
        this.addFx('exposed', { x: spot.x, y: spot.y - 0.3 });
      }
      await this.wait(2300);
      this.clearActors();
    }
    onShow(null);
    if (!this.skipping) await this.flyTo(home, 0.7);
    this.skipping = false;
    this.camera = null;
    this.tween = null;
    this.clearActors();
    this.layout();
  }
}
