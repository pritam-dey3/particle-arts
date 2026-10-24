# AGENTS.md

Architecture for this project. It is a static site of independent canvas concept
arts. There is no framework, no bundler and no build step.

---

## 1. Run it

ES modules and dynamic `import()` do not work over `file://`, so the site must be
served over HTTP:

```powershell
uv run python -m http.server 8000 -d src
```
Assume it is already serving.

Open `http://localhost:8000/` in integrated browser. Do not open `src/index.html` by double-clicking.

Deploying is a plain static upload of `src/`.

---

## 2. Mental model

One page, one canvas, one animation loop. An "art" is a plugin that draws into
that canvas. The host owns everything shared; an art owns only its own logic.

```
                 ┌──────────────────────────────────────────┐
   URL ?art=id   │  main.js  (host)                         │
      │          │                                          │
      ▼          │  routing · canvas sizing · RAF loop      │
 ┌─────────┐     │  pointer state · params store · controls │
 │ router  │────▶│  gallery · teardown · accent CSS var     │
 └─────────┘     └───────────────┬──────────────────────────┘
                                 │ create(host)
                                 ▼
                    ┌────────────────────────────┐
                    │ arts/<name>.js             │
                    │  params  (schema export)   │
                    │  create(host) -> instance  │
                    └────────────────────────────┘
```

Rules that keep this clean:

- Arts never touch `document`, `window`, `location`, `localStorage` or the network.
- Arts never create a canvas or set canvas dimensions.
- Arts never add their own event listeners, CSS or HTML.
- The host never knows what an art draws.

---

## 3. Files

| Path | Responsibility |
| --- | --- |
| `src/index.html` | Shell only: canvas, top bar, gallery container, controls container. |
| `src/style.css` | All styling for the whole site, including shared control and gallery styles. |
| `src/main.js` | The host: routing, lifecycle, canvas, loop, input, params, UI. |
| `src/arts/index.js` | Ordered manifest of arts + metadata. The gallery is built from it. |
| `src/arts/particle-network.js` | Art: linked drifting particles. |
| `src/arts/wave-field.js` | Art: sine wave dot field. Also the minimal template. |

---

## 4. Lifecycle

```
boot ──▶ apply()
           ├─ no ?art / unknown id ──▶ gallery (loop stopped, canvas cleared)
           └─ known id ──▶ teardown ──▶ import ──▶ create(host) ──▶ resize ──▶ loop
                                   │                                          │
                                   └────────── next navigation ◀──────────────┘
```

`apply()` runs on boot, on `navigate()` and on `popstate` (browser back/forward).
Every run increments `navToken`; if the import resolves after a newer navigation
started, the stale result is discarded and nothing is mounted. Rapidly clicking
gallery cards therefore cannot double-mount or leak a loop.

Teardown always runs before a new art is created and does exactly this:
`stopLoop()` → `dispose()` → clear handlers → clear controls → `pointer.active = false`
→ reset transform and clear the canvas.

`resize()` is called on mount and on window resize. It sets `canvas.width/height`
to `cssSize * devicePixelRatio` (capped at 2) and forwards CSS-pixel dimensions to
`instance.resize(width, height)`.

The loop applies the DPR transform before `update`/`render` and resets it after,
so **all art drawing is in CSS pixels**. `dt` is in seconds and clamped to 1/20 s.
The loop stops while the tab is hidden.

---

## 5. Art contract

An art module exports:

```js
export const params = [ /* see §6 */ ];        // optional
export function create(host) { /* ... */ }     // required
```

### `create(host)` returns an instance

| Method | When it is called | Notes |
| --- | --- | --- |
| `update(dt)` | once per frame, before render | `dt` in seconds, clamped |
| `render(ctx)` | once per frame | must clear the canvas itself |
| `resize(width, height)` | on mount and on window resize | CSS pixels; re-seed or clamp |
| `dispose()` | before unmount | drop large arrays, unsubscribe |

All methods are optional. The host calls them in the order above.

### `host`

| Member | Type | Meaning |
| --- | --- | --- |
| `host.ctx` | `CanvasRenderingContext2D` | shared context, transform already DPR-scaled |
| `host.canvas` | `HTMLCanvasElement` | for read-only needs (never resized by the art) |
| `host.width` / `host.height` | `number` (getter) | live viewport size in CSS pixels |
| `host.dpr` | `number` (getter) | current device pixel ratio cap (max 2) |
| `host.params` | `object` (live) | current parameter values, mutated by the controls |
| `host.pointer` | `{ x, y, active }` (live) | `active` is false when the pointer left the canvas |
| `host.on(type, fn)` | `function` → unsubscribe | register a listener; all handlers are dropped on unmount |

`host.on` event names:

| Event | Payload | Fired on |
| --- | --- | --- |
| `pointermove` | `{ x, y }` | canvas pointer movement |
| `pointerdown` | `{ x, y }` | canvas press (mouse or touch) |
| `pointerup` | `{ x, y }` | canvas release |
| `keydown` | `KeyboardEvent` | window key press, except `Escape` |

`Escape` is reserved by the host to return to the gallery. Coordinates are CSS
pixels relative to the canvas, so they need no conversion.

### Rendering rules

- Clear your own canvas each frame: `ctx.clearRect(0, 0, host.width, host.height)`.
  Doing it yourself is what allows trails and motion blur.
- Reset anything you change per frame (`globalAlpha`, `strokeStyle`, `setTransform`)
  before returning; a later art inherits the context.
- Read `host.width` / `host.height` inside `render`; they change on resize.

---

## 6. Parameters

An art declares its controls; the host renders them. No per-art UI code exists.

```js
export const params = [
  { key: "count", label: "Particles", min: 30, max: 200, step: 1, default: 80 },
  { key: "blend", label: "Blend", type: "toggle", default: true },
  { key: "mode", label: "Mode", type: "select", options: ["dots", "lines"], default: "dots" },
];
```

| Field | Required | Notes |
| --- | --- | --- |
| `key` | yes | property read from `host.params` |
| `label` | no | defaults to `key` |
| `type` | no | `"range"` (default), `"toggle"`, `"select"` |
| `min`, `max`, `step` | range only | `step` defaults to `1` |
| `options` | select only | strings or `{ value, label }` |
| `default` | yes | initial value |
| `format` | no | `(value) => string` for the readout |

Values are live: read `host.params.count` inside `update`/`render`, never cache
it in a local at creation time. Range values are `number`; toggle values are
`boolean`; select values are the option value as a string.

---

## 7. Registry

`src/arts/index.js` is the single source of truth for what exists:

```js
{
  id: "particle-network",   // ?art=particle-network, unique, URL-safe
  title: "Particle Network",
  description: "…",         // one line for the card
  accent: "#4facfe",        // CSS colour for this art's chrome
  load: () => import("./particle-network.js"),
}
```

Order in the array is gallery order. `load` must be a dynamic import so the
gallery fetches no art code until a card is clicked. The gallery renders purely
from this metadata.

---

## 8. Routing

- `/?art=<id>` — mount that art.
- `/` (or no `art`) — gallery.
- Unknown `id` — gallery, and the URL is cleaned with `history.replaceState`.
- A failed import — logged to the console, gallery, URL cleaned.
- `navigate(id)` pushes state and re-applies the route, so browser back/forward
  and the "← Gallery" link both work.
- `Escape` while an art is mounted returns to the gallery.

Adding pretty paths (`/arts/<id>`) would require host rewrites; the query form
works on any static host unchanged.

---

## 9. Adding a new art

1. Create `src/arts/<name>.js`.
2. Add an entry to `src/arts/index.js` with `id`, `title`, `description`, `accent`
   and `load: () => import("./<name>.js")`.
3. Export `params` (or omit for no controls).
4. Export `create(host)` returning at least `render(ctx)`.
5. Clear the canvas at the start of `render`.
6. Reload `/?art=<name>` and confirm the panel, the resize behaviour and a clean
   switch away and back (no stray pixels, no console errors).

Start from `src/arts/wave-field.js`; it is the smallest complete art.

---

## 10. Conventions and performance

- No globals, no IIFE state, no `window`/`document` access in arts.
- Keep per-frame allocation out of hot loops; reuse arrays and objects.
- Pairwise work is `O(n²)` (`particle-network` links). If a particle count can
  exceed a few hundred, use a spatial grid before raising the cap; the manifest
  currently caps it at 200.
- Batch draw calls where possible (`beginPath` once per group, one `stroke`).
- Fade-in counts and smooth parameter changes inside the art; do not rebuild
  state on every slider tick.
- Use `host.on(...)` for input so teardown is automatic.
- One art per file, named in kebab-case matching its `id`.
- Styling is limited to the registry `accent` colour. If an art genuinely needs
  a custom colour, use its own palette inside the art, not new CSS.

---

## 11. Non-goals

- No framework, bundler, transpiler, TypeScript or npm dependencies.
- No server, database or state persistence (parameters reset on reload).
- No WebGL/3D, offscreen-thumbnail previews, or transitions between arts.
- No per-art HTML, CSS or routing.
