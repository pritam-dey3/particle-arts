// Minimal art: shows how little a concept needs. One parameter, no input,
// no state beyond a clock — a template for new ideas.

export const params = [
  { key: "columns", label: "Columns", min: 10, max: 60, step: 1, default: 34 },
  { key: "amplitude", label: "Amplitude", min: 0, max: 80, step: 1, default: 26 },
  { key: "speed", label: "Speed", min: 0, max: 3, step: 0.1, default: 1 },
];

export function create(host) {
  const ctx = host.ctx;
  let time = 0;

  return {
    update(dt) {
      time += dt * host.params.speed;
    },

    render() {
      const { width, height, params } = host;
      ctx.clearRect(0, 0, width, height);

      const columns = Math.max(2, params.columns | 0);
      const stepX = width / (columns - 1);
      const rows = Math.max(2, Math.round((height / width) * columns) + 1);
      const stepY = height / (rows - 1);
      const amp = params.amplitude;

      ctx.fillStyle = "#ff7ac6";

      for (let row = 0; row < rows; row++) {
        const y = row * stepY;
        for (let column = 0; column < columns; column++) {
          const x = column * stepX;
          const wave =
            (Math.sin(x * 0.008 + time * 2) + Math.cos(y * 0.011 - time * 1.6)) * 0.5;

          const px = x + Math.cos(y * 0.006 + time) * amp * 0.4;
          const py = y + wave * amp;

          ctx.globalAlpha = 0.2 + (wave * 0.5 + 0.5) * 0.8;
          ctx.beginPath();
          ctx.arc(px, py, 1 + (wave * 0.5 + 0.5) * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    },
  };
}
