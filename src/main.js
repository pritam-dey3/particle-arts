// The host. Owns the canvas, the animation loop, input, parameters and routing.
// Concept arts in ./arts/ never touch the DOM, the URL or the network themselves.

import { arts } from "./arts/index.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const backLink = document.getElementById("back");
const titleEl = document.getElementById("title");
const galleryEl = document.getElementById("gallery");
const controlsEl = document.getElementById("controls");

const DEFAULT_ACCENT = "#4facfe";

// Shared, live state handed to the mounted art.
const pointer = { x: 0, y: 0, active: false };

let width = 0;
let height = 0;
let dpr = 1;
let current = null; // { instance, params }
let frameId = 0;
let lastTime = 0;
let navToken = 0;

/* ------------------------------------------------------------------ events */

const handlers = new Map(); // event name -> Set<fn>

function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}

function emit(type, payload) {
  const set = handlers.get(type);
  if (set) for (const fn of set) fn(payload);
}

/* ------------------------------------------------------------------ canvas */

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  current?.instance.resize?.(width, height);
}

function clearCanvas() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* -------------------------------------------------------------------- loop */

function frame(now) {
  frameId = requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 1 / 20);
  lastTime = now;

  // Arts always draw in CSS pixels; the DPR scale is applied for them.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  current?.instance.update?.(dt);
  current?.instance.render?.(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function startLoop() {
  if (frameId) return;
  lastTime = performance.now();
  frameId = requestAnimationFrame(frame);
}

function stopLoop() {
  cancelAnimationFrame(frameId);
  frameId = 0;
}

/* ------------------------------------------------------------------ inputs */

function toCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  pointer.active = true;
  return { x: pointer.x, y: pointer.y };
}

canvas.addEventListener("pointermove", (event) => {
  emit("pointermove", toCanvas(event));
});

canvas.addEventListener("pointerdown", (event) => {
  emit("pointerdown", toCanvas(event));
});

canvas.addEventListener("pointerup", (event) => {
  emit("pointerup", toCanvas(event));
});

canvas.addEventListener("pointerleave", () => {
  pointer.active = false;
});

window.addEventListener("resize", resize);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopLoop();
  else if (current) startLoop();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && current) {
    navigate(null);
    return;
  }
  emit("keydown", event);
});

window.addEventListener("popstate", apply);

/* ---------------------------------------------------------------- controls */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function defaultsFrom(schema) {
  const values = {};
  for (const param of schema) values[param.key] = param.default;
  return values;
}

function format(param, value) {
  return param.format ? param.format(value) : String(value);
}

function renderControls(schema, values) {
  controlsEl.replaceChildren();

  if (!schema.length) {
    controlsEl.hidden = true;
    return;
  }
  controlsEl.hidden = false;

  for (const param of schema) {
    const head = el(
      "div",
      { className: "control-head" },
      el("label", { textContent: param.label ?? param.key }),
      el("span", { className: "value" }),
    );
    const valueEl = head.querySelector(".value");
    const row = el("div", { className: "control" }, head);

    if (param.type === "select") {
      const select = el("select");
      for (const option of param.options) {
        const value = typeof option === "object" ? option.value : option;
        const label = typeof option === "object" ? option.label : option;
        select.append(el("option", { value, textContent: label }));
      }
      select.value = values[param.key];
      select.addEventListener("input", () => {
        values[param.key] = select.value;
      });
      row.append(select);
      valueEl.hidden = true;
    } else if (param.type === "toggle") {
      const input = el("input", { type: "checkbox", checked: !!values[param.key] });
      input.addEventListener("input", () => {
        values[param.key] = input.checked;
      });
      row.append(input);
      valueEl.hidden = true;
    } else {
      const input = el("input", {
        type: "range",
        min: param.min ?? 0,
        max: param.max ?? 1,
        step: param.step ?? 1,
        value: values[param.key],
      });
      valueEl.textContent = format(param, values[param.key]);
      input.addEventListener("input", () => {
        values[param.key] = Number(input.value);
        valueEl.textContent = format(param, values[param.key]);
      });
      row.append(input);
    }

    controlsEl.append(row);
  }
}

/* ----------------------------------------------------------------- gallery */

function renderGallery() {
  galleryEl.replaceChildren();

  for (const art of arts) {
    const card = el(
      "a",
      { className: "card", href: `?art=${encodeURIComponent(art.id)}` },
      el("h2", { textContent: art.title }),
      el("p", { textContent: art.description ?? "" }),
    );
    card.style.setProperty("--card-accent", art.accent ?? DEFAULT_ACCENT);
    card.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      event.preventDefault();
      navigate(art.id);
    });
    galleryEl.append(card);
  }
}

function showGallery() {
  galleryEl.hidden = false;
  controlsEl.hidden = true;
  backLink.hidden = true;
  titleEl.textContent = "Concept Arts";
  document.title = "Concept Arts";
  document.documentElement.style.setProperty("--accent", DEFAULT_ACCENT);
}

/* ---------------------------------------------------------------- lifecycle */

function teardown() {
  stopLoop();

  if (current) {
    try {
      current.instance.dispose?.();
    } catch (error) {
      console.error("dispose failed", error);
    }
    current = null;
  }

  handlers.clear();
  controlsEl.replaceChildren();
  pointer.active = false;
  clearCanvas();
}

async function apply() {
  const token = ++navToken;
  teardown();

  const requested = new URLSearchParams(location.search).get("art");
  const art = arts.find((entry) => entry.id === requested);

  if (!requested || !art) {
    if (requested) history.replaceState(null, "", location.pathname);
    showGallery();
    return;
  }

  galleryEl.hidden = true;
  controlsEl.hidden = true;
  backLink.hidden = false;
  titleEl.textContent = art.title;
  document.title = `${art.title} · Concept Arts`;
  document.documentElement.style.setProperty("--accent", art.accent ?? DEFAULT_ACCENT);

  let module;
  try {
    module = await art.load();
  } catch (error) {
    console.error(`Failed to load art "${art.id}"`, error);
    history.replaceState(null, "", location.pathname);
    showGallery();
    return;
  }

  if (token !== navToken) return; // user navigated away while loading

  const schema = module.params ?? [];
  const params = defaultsFrom(schema);
  const instance = module.create({
    canvas,
    ctx,
    params,
    pointer,
    on,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get dpr() {
      return dpr;
    },
  });

  current = { instance, params };
  renderControls(schema, params);
  resize();
  startLoop();
}

function navigate(id) {
  const url = id ? `${location.pathname}?art=${encodeURIComponent(id)}` : location.pathname;
  history.pushState(null, "", url);
  apply();
}

/* -------------------------------------------------------------------- boot */

renderGallery();
resize();
apply();
