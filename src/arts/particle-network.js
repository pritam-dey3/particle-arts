// Particle network — ported from the original single-art script.

export const params = [
  { key: "count", label: "Particles", min: 30, max: 200, step: 1, default: 80 },
  { key: "distance", label: "Link distance", min: 50, max: 200, step: 10, default: 120 },
  { key: "speed", label: "Speed", min: 0, max: 3, step: 0.1, default: 1 },
];

const RIPPLE_LIFE = 1.4;
const POINTER_RADIUS = 140;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

class Particle {
  constructor(width, height) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.radius = 1 + Math.random() * 3;
    this.vx = Math.random() * 2 - 1;
    this.vy = Math.random() * 2 - 1;
    this.hue = 200 + Math.random() * 60;
    this.alpha = 0;
  }

  update(dt, host) {
    const step = host.params.speed * dt * 60;
    this.x += this.vx * step;
    this.y += this.vy * step;

    if (this.x < 0 || this.x > host.width) {
      this.vx *= -1;
      this.x = clamp(this.x, 0, host.width);
    }
    if (this.y < 0 || this.y > host.height) {
      this.vy *= -1;
      this.y = clamp(this.y, 0, host.height);
    }

    if (host.pointer.active) {
      const dx = this.x - host.pointer.x;
      const dy = this.y - host.pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.01 && distance < POINTER_RADIUS) {
        const push = (1 - distance / POINTER_RADIUS) * 3;
        this.x += (dx / distance) * push;
        this.y += (dy / distance) * push;
      }
    }

    this.alpha = Math.min(1, this.alpha + dt * 2);
  }

  draw(ctx) {
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = `hsl(${this.hue}, 70%, 62%)`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Ripple {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
  }

  get done() {
    return this.age >= RIPPLE_LIFE;
  }

  draw(ctx) {
    const t = this.age / RIPPLE_LIFE;
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = "#4facfe";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 10 + t * 130, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function create(host) {
  const ctx = host.ctx;
  const particles = [];
  const ripples = [];

  const offClick = host.on("pointerdown", ({ x, y }) => {
    ripples.push(new Ripple(x, y));
  });

  // Add or drop particles to match the slider; new ones fade in on their own.
  function syncCount() {
    const target = host.params.count | 0;
    while (particles.length < target) {
      particles.push(new Particle(host.width, host.height));
    }
    if (particles.length > target) particles.length = target;
  }

  return {
    update(dt) {
      syncCount();
      for (const particle of particles) particle.update(dt, host);

      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i].update(dt);
        if (ripples[i].done) ripples.splice(i, 1);
      }
    },

    render() {
      const { width, height } = host;
      const linkDistance = host.params.distance;
      ctx.clearRect(0, 0, width, height);

      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      for (let a = 0; a < particles.length; a++) {
        const pa = particles[a];
        for (let b = a + 1; b < particles.length; b++) {
          const pb = particles[b];
          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          if (Math.abs(dx) > linkDistance || Math.abs(dy) > linkDistance) continue;

          const distance = Math.hypot(dx, dy);
          if (distance > linkDistance) continue;

          ctx.strokeStyle = `rgba(79, 172, 254, ${1 - distance / linkDistance})`;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
      }

      for (const particle of particles) particle.draw(ctx);
      for (const ripple of ripples) ripple.draw(ctx);

      ctx.globalAlpha = 1;
    },

    resize(newWidth, newHeight) {
      for (const particle of particles) {
        particle.x = clamp(particle.x, 0, newWidth);
        particle.y = clamp(particle.y, 0, newHeight);
      }
    },

    dispose() {
      offClick();
      particles.length = 0;
      ripples.length = 0;
    },
  };
}
