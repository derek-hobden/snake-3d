import * as THREE from "three";

export const GRID_SIZE = 16;
const CELL = 1;
const TICK_MS = 160;
const START_LENGTH = 3;

type Vec2 = { x: number; z: number };
type Dir = Vec2;

const DIRS = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
} as const;

function keyOf(p: Vec2): string {
  return `${p.x},${p.z}`;
}

function opposite(a: Dir, b: Dir): boolean {
  return a.x === -b.x && a.z === -b.z;
}

function worldPos(cell: Vec2, y = 0.5): THREE.Vector3 {
  const origin = (GRID_SIZE - 1) / 2;
  return new THREE.Vector3(cell.x - origin, y, cell.z - origin);
}

type Phase = "ready" | "playing" | "paused" | "over";

export class SnakeGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();

  private readonly boardGroup = new THREE.Group();
  private readonly snakeGroup = new THREE.Group();
  private readonly foodMesh: THREE.Mesh;
  private readonly foodLight: THREE.PointLight;

  private snake: Vec2[] = [];
  private prevSnake: Vec2[] = [];
  private dir: Dir = DIRS.right;
  private queuedDir: Dir = DIRS.right;
  private food: Vec2 = { x: 0, z: 0 };
  private score = 0;
  private best = Number(localStorage.getItem("snake3d-best") ?? "0");
  private phase: Phase = "ready";
  private tickAcc = 0;
  private justGrew = false;

  private readonly scoreEl = document.querySelector("#score")!;
  private readonly bestEl = document.querySelector("#best")!;
  private readonly overlay = document.querySelector("#overlay")!;
  private readonly overlayTitle = document.querySelector("#overlay-title")!;
  private readonly overlayBody = document.querySelector("#overlay-body")!;
  private readonly overlayScore = document.querySelector("#overlay-score")!;
  private readonly overlayAction = document.querySelector("#overlay-action")!;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0x071018, 1);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(11.5, 16.5, 14.5);
    this.camera.lookAt(0, 0, 0);

    this.scene.fog = new THREE.Fog(0x071018, 18, 36);
    this.scene.add(this.boardGroup, this.snakeGroup);

    this.buildLights();
    this.buildArena();

    const foodGeo = new THREE.SphereGeometry(0.32, 24, 16);
    const foodMat = new THREE.MeshStandardMaterial({
      color: 0xff4d6d,
      emissive: 0xff2048,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.15,
    });
    this.foodMesh = new THREE.Mesh(foodGeo, foodMat);
    this.foodMesh.castShadow = true;
    this.foodLight = new THREE.PointLight(0xff4d6d, 2.4, 6);
    this.foodMesh.add(this.foodLight);
    this.scene.add(this.foodMesh);

    this.resetBoard();
    this.bindUi();
    this.resize();
    requestAnimationFrame(() => this.resize());
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (e) => this.onKey(e));
    this.showOverlay("ready");
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  private buildLights(): void {
    this.scene.add(new THREE.AmbientLight(0x7aa8c4, 0.45));

    const key = new THREE.DirectionalLight(0xfff2d4, 1.35);
    key.position.set(8, 16, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x4ad6c4, 0.35);
    fill.position.set(-10, 8, -8);
    this.scene.add(fill);
  }

  private buildArena(): void {
    const floorGeo = new THREE.BoxGeometry(CELL * 0.96, 0.18, CELL * 0.96);
    const dark = new THREE.MeshStandardMaterial({
      color: 0x14303a,
      roughness: 0.85,
    });
    const light = new THREE.MeshStandardMaterial({
      color: 0x1c4652,
      roughness: 0.8,
    });

    for (let z = 0; z < GRID_SIZE; z += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const tile = new THREE.Mesh(floorGeo, (x + z) % 2 === 0 ? dark : light);
        const p = worldPos({ x, z }, -0.09);
        tile.position.copy(p);
        tile.receiveShadow = true;
        this.boardGroup.add(tile);
      }
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a6f7a,
      roughness: 0.55,
      metalness: 0.2,
    });
    const wallH = 0.85;
    const span = GRID_SIZE * CELL + 0.35;
    const north = new THREE.Mesh(new THREE.BoxGeometry(span, wallH, 0.35), wallMat);
    const south = north.clone();
    const east = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, span), wallMat);
    const west = east.clone();
    const edge = GRID_SIZE / 2 + 0.05;
    north.position.set(0, wallH / 2 - 0.1, -edge);
    south.position.set(0, wallH / 2 - 0.1, edge);
    east.position.set(edge, wallH / 2 - 0.1, 0);
    west.position.set(-edge, wallH / 2 - 0.1, 0);
    for (const w of [north, south, east, west]) {
      w.castShadow = true;
      w.receiveShadow = true;
      this.boardGroup.add(w);
    }
  }

  private resetBoard(): void {
    const mid = Math.floor(GRID_SIZE / 2);
    this.dir = DIRS.right;
    this.queuedDir = DIRS.right;
    this.snake = [];
    for (let i = START_LENGTH - 1; i >= 0; i -= 1) {
      this.snake.push({ x: mid - i, z: mid });
    }
    this.prevSnake = this.snake.map((p) => ({ ...p }));
    this.score = 0;
    this.tickAcc = 0;
    this.justGrew = false;
    this.placeFood(true);
    this.syncHud();
    this.rebuildSnakeMeshes(1);
    this.updateFoodVisual();
  }

  private placeFood(preferAhead = false): void {
    const occupied = new Set(this.snake.map(keyOf));
    if (preferAhead) {
      const head = this.snake[this.snake.length - 1];
      const ahead = { x: head.x + this.dir.x * 4, z: head.z + this.dir.z * 4 };
      if (
        ahead.x >= 0 &&
        ahead.z >= 0 &&
        ahead.x < GRID_SIZE &&
        ahead.z < GRID_SIZE &&
        !occupied.has(keyOf(ahead))
      ) {
        this.food = ahead;
        return;
      }
    }
    const empty: Vec2[] = [];
    for (let z = 0; z < GRID_SIZE; z += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!occupied.has(keyOf({ x, z }))) empty.push({ x, z });
      }
    }
    this.food = empty[Math.floor(Math.random() * empty.length)] ?? { x: 0, z: 0 };
  }

  private bindUi(): void {
    this.bestEl.textContent = String(this.best);
    this.overlayAction.addEventListener("click", () => this.onOverlayAction());
  }

  private beginPlay(): void {
    this.resetBoard();
    this.phase = "playing";
    this.clock.getDelta();
    this.hideOverlay();
  }

  private onOverlayAction(): void {
    if (this.phase === "ready" || this.phase === "over") {
      this.beginPlay();
    } else if (this.phase === "paused") {
      this.phase = "playing";
      this.clock.getDelta();
      this.hideOverlay();
    }
  }

  private showOverlay(kind: Phase): void {
    this.overlay.classList.remove("hidden");
    this.overlayScore.classList.add("hidden");
    if (kind === "ready") {
      this.overlayTitle.textContent = "3D Snake";
      this.overlayBody.textContent =
        "Steer on the 16×16 grid. Eat glowing food to grow. Walls and your own body end the run.";
      this.overlayAction.textContent = "Play";
    } else if (kind === "paused") {
      this.overlayTitle.textContent = "Paused";
      this.overlayBody.textContent = "The grid is frozen. Resume when you're ready.";
      this.overlayAction.textContent = "Resume";
    } else if (kind === "over") {
      this.overlayTitle.textContent = "Game over";
      this.overlayBody.textContent = "You hit a wall or yourself.";
      this.overlayScore.textContent = `Score ${this.score} · Best ${this.best}`;
      this.overlayScore.classList.remove("hidden");
      this.overlayAction.textContent = "Restart";
    }
  }

  private hideOverlay(): void {
    this.overlay.classList.add("hidden");
  }

  private onKey(e: KeyboardEvent): void {
    const map: Record<string, Dir> = {
      ArrowUp: DIRS.up,
      ArrowDown: DIRS.down,
      ArrowLeft: DIRS.left,
      ArrowRight: DIRS.right,
      KeyW: DIRS.up,
      KeyS: DIRS.down,
      KeyA: DIRS.left,
      KeyD: DIRS.right,
    };

    if (e.code === "Space") {
      e.preventDefault();
      if (this.phase === "playing") {
        this.phase = "paused";
        this.showOverlay("paused");
      } else if (this.phase === "paused") {
        this.phase = "playing";
        this.hideOverlay();
      }
      return;
    }

    if (e.code === "KeyR") {
      this.beginPlay();
      return;
    }

    const next = map[e.code];
    if (!next) return;

    if (this.phase === "ready" || this.phase === "over") {
      this.beginPlay();
    }

    if (!opposite(this.dir, next)) {
      this.queuedDir = next;
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.phase === "playing") {
      this.tickAcc += dt * 1000;
      this.tickAcc = Math.min(this.tickAcc, TICK_MS * 2);
      while (this.tickAcc >= TICK_MS && this.phase === "playing") {
        this.tickAcc -= TICK_MS;
        this.step();
      }
    }

    const t =
      this.phase === "playing" ? Math.min(1, this.tickAcc / TICK_MS) : 1;
    this.rebuildSnakeMeshes(t);
    this.updateFoodVisual(this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
  }

  private step(): void {
    this.dir = this.queuedDir;
    const head = this.snake[this.snake.length - 1];
    const next = { x: head.x + this.dir.x, z: head.z + this.dir.z };

    if (
      next.x < 0 ||
      next.z < 0 ||
      next.x >= GRID_SIZE ||
      next.z >= GRID_SIZE
    ) {
      this.die();
      return;
    }

    const bodyToCheck = this.justGrew
      ? this.snake
      : this.snake.slice(1);
    if (bodyToCheck.some((p) => p.x === next.x && p.z === next.z)) {
      this.die();
      return;
    }

    this.prevSnake = this.snake.map((p) => ({ ...p }));
    this.snake = [...this.snake, next];
    this.justGrew = next.x === this.food.x && next.z === this.food.z;

    if (this.justGrew) {
      this.score += 1;
      if (this.score > this.best) {
        this.best = this.score;
        localStorage.setItem("snake3d-best", String(this.best));
      }
      this.syncHud();
      this.placeFood();
    } else {
      this.snake.shift();
    }
  }

  private die(): void {
    this.phase = "over";
    this.tickAcc = 0;
    this.syncHud();
    this.showOverlay("over");
  }

  private syncHud(): void {
    this.scoreEl.textContent = String(this.score);
    this.bestEl.textContent = String(this.best);
  }

  private rebuildSnakeMeshes(t: number): void {
    while (this.snakeGroup.children.length < this.snake.length) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.78, 0.78),
        new THREE.MeshStandardMaterial({
          color: 0x3ad67a,
          roughness: 0.35,
          metalness: 0.18,
          emissive: 0x145c32,
          emissiveIntensity: 0.25,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.snakeGroup.add(mesh);
    }
    while (this.snakeGroup.children.length > this.snake.length) {
      const extra = this.snakeGroup.children[this.snakeGroup.children.length - 1];
      this.snakeGroup.remove(extra);
      extra.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      });
    }

    this.snake.forEach((cell, i) => {
      const mesh = this.snakeGroup.children[i] as THREE.Mesh;
      const from = this.prevSnake[Math.min(i, this.prevSnake.length - 1)] ?? cell;
      const a = worldPos(from, 0.42);
      const b = worldPos(cell, 0.42);
      mesh.position.lerpVectors(a, b, t);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      const head = i === this.snake.length - 1;
      mat.color.setHex(head ? 0xc8ff7a : 0x34d399);
      mat.emissiveIntensity = head ? 0.45 : 0.2;
    });
  }

  private updateFoodVisual(time = 0): void {
    const p = worldPos(this.food, 0.42 + Math.sin(time * 3) * 0.08);
    this.foodMesh.position.copy(p);
    this.foodMesh.rotation.y = time * 1.4;
    this.foodLight.intensity = 2.1 + Math.sin(time * 5) * 0.4;
  }
}
