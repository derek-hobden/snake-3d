# 3D Snake

Browser snake on a **16×16** grid, rendered with **Three.js**. Eat glowing food to grow. Colliding with a wall or your own body ends the run.

## Play locally

```bash
npm install
npm run dev
```

Open the Vite URL (default `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

The production output is a static SPA in `dist/`, ready for a Vite deploy on Vercel.

## Controls

- **Arrow keys** or **WASD** — steer (no 180° reverse)
- **Space** — pause / resume
- **R** — restart immediately
- Overlay **Play / Resume / Restart** buttons

## Rules

The snake advances one cell per tick. Food increments score by 1 and grows the snake by one segment. Movement is grid-locked; meshes interpolate between cells so the 3D bodies stay aligned with the playfield the player sees.
