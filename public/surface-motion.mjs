import { LAND_POLYGONS, pointIsWalkable } from "./island-geometry.mjs?v=land-map-20260624";

const TAU = Math.PI * 2;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

function waterWave(x, y, time, wind) {
  const strength = .72 + clamp(wind, 0, 40) / 28;
  return (
    Math.sin(x * .018 - time * .0011) * 2.8 +
    Math.sin(x * .047 + y * .014 + time * .0017) * 1.45 +
    Math.cos(y * .036 - time * .0008) * .9
  ) * strength;
}

export function pointIsOpenWater(x, y) {
  return !pointIsWalkable({ x: Number(x) * 100, y: Number(y) * 100 });
}

export function normalizedStagePoint(event, stage) {
  const rect = stage?.getBoundingClientRect?.();
  const width = Number(stage?.clientWidth) || rect?.width || 1;
  const height = Number(stage?.clientHeight) || rect?.height || 1;
  if (!rect || !width || !height) return { x: 0, y: 0 };
  const scaleX = rect.width / width || 1;
  const scaleY = rect.height / height || 1;
  const localX = width / 2 + (Number(event?.clientX) - (rect.left + rect.width / 2)) / scaleX;
  const localY = height / 2 + (Number(event?.clientY) - (rect.top + rect.height / 2)) / scaleY;
  return { x: localX / width, y: localY / height };
}

export class SurfaceMotion {
  constructor({ canvas, stage }) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas?.getContext("2d");
    this.enabled = true;
    this.reducedMotion = false;
    this.environment = { weather: "clear", isDay: true, windSpeed: 8, cloudCover: 20 };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.frame = 0;
    this.ripples = [];
    this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    this.boundPointer = (event) => this.addRipple(event);
    this.boundVisibility = () => this.syncLoop();
    this.resizeObserver?.observe(stage);
    stage?.addEventListener("pointerdown", this.boundPointer, { passive: true });
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.resize();
    this.syncLoop();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.canvas?.classList.toggle("active", this.enabled);
    this.syncLoop();
  }

  setReducedMotion(reducedMotion) {
    this.reducedMotion = Boolean(reducedMotion);
    this.syncLoop();
    if (this.enabled) this.draw(performance.now());
  }

  setEnvironment(environment = {}) {
    this.environment = { ...this.environment, ...environment };
    if (this.enabled && this.reducedMotion) this.draw(performance.now());
  }

  resize() {
    if (!this.canvas || !this.stage || !this.ctx) return;
    this.width = Math.round(this.stage.clientWidth);
    this.height = Math.round(this.stage.clientHeight);
    if (!this.width || !this.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    if (this.enabled) this.draw(performance.now());
  }

  addRipple(event) {
    if (!this.enabled || this.reducedMotion) return;
    if (event.target?.closest?.(".island-hit-area, .building, .map-hotspot")) return;
    const { x, y } = normalizedStagePoint(event, this.stage);
    if (!pointIsOpenWater(x, y)) return;
    this.ripples.push({ x: x * this.width, y: y * this.height, born: performance.now() });
    if (this.ripples.length > 16) this.ripples.shift();
  }

  syncLoop() {
    const shouldRun = this.enabled && !this.reducedMotion && !document.hidden;
    if (shouldRun && !this.frame) this.frame = requestAnimationFrame((time) => this.animate(time));
    if (!shouldRun && this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  animate(time) {
    this.frame = 0;
    if (!this.enabled || this.reducedMotion || document.hidden) return;
    this.draw(time);
    this.frame = requestAnimationFrame((next) => this.animate(next));
  }

  clipWater(ctx) {
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    ctx.ellipse(this.width * .25, this.height * .52, this.width * .245, this.height * .345, 0, 0, TAU);
    ctx.ellipse(this.width * .75, this.height * .51, this.width * .255, this.height * .35, 0, 0, TAU);
    ctx.rect(this.width * .46, this.height * .45, this.width * .08, this.height * .16);
    ctx.clip("evenodd");
  }

  draw(time) {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    const wind = clamp(this.environment.windSpeed, 0, 45);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    this.clipWater(ctx);
    ctx.globalCompositeOperation = "screen";

    const swellOpacity = ["rain", "storm"].includes(this.environment.weather) ? .24 : .14;
    for (let row = 0; row < 14; row += 1) {
      const perspective = row / 13;
      const y = height * (.08 + perspective * .9);
      const gradient = ctx.createLinearGradient(0, y, width, y);
      gradient.addColorStop(0, "rgba(190,238,245,0)");
      gradient.addColorStop(.22, `rgba(204,245,246,${swellOpacity * (.5 + perspective)})`);
      gradient.addColorStop(.68, `rgba(154,226,235,${swellOpacity})`);
      gradient.addColorStop(1, "rgba(190,238,245,0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = .7 + perspective * 2.4;
      ctx.beginPath();
      for (let x = -30; x <= width + 30; x += 11) {
        const wave = waterWave(x, y, time + row * 210, wind) * (.45 + perspective * 1.1);
        if (x === -30) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }

    for (let index = 0; index < 22; index += 1) {
      const progress = (index * .071 + time * (.000018 + wind * .0000007)) % 1;
      const x = ((index * 137.3) % width + time * (.008 + wind * .0009)) % (width + 90) - 45;
      const y = height * (.15 + progress * .8);
      const length = 12 + progress * 38;
      ctx.strokeStyle = `rgba(238,254,249,${.08 + progress * .19})`;
      ctx.lineWidth = .7 + progress * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + length * .5, y - waterWave(x, y, time, wind), x + length, y + 1.5);
      ctx.stroke();
    }
    this.drawCurrentField(ctx, time, wind);
    ctx.restore();

    this.drawShoreFoam(ctx, time, wind);
    this.drawRipples(ctx, time);
    this.drawAirflow(ctx, time, wind);
  }

  drawCurrentField(ctx, time, wind) {
    const drift = time * (.012 + wind * .0007);
    ctx.save();
    ctx.lineCap = "round";
    for (let lane = 0; lane < 8; lane += 1) {
      const baseY = this.height * (.14 + lane * .105);
      const shift = (drift + lane * 83) % (this.width * .34);
      ctx.strokeStyle = `rgba(188,239,240,${.035 + (lane % 3) * .018})`;
      ctx.lineWidth = 5 + lane * .55;
      ctx.beginPath();
      ctx.moveTo(-this.width * .2 + shift, baseY);
      ctx.bezierCurveTo(this.width * .18 + shift, baseY - 34, this.width * .42 + shift, baseY + 28, this.width * .72 + shift, baseY - 7);
      ctx.stroke();
    }
    for (let cell = 0; cell < 28; cell += 1) {
      const x = ((cell * 149 + drift * 2.1) % (this.width + 120)) - 60;
      const y = this.height * (.13 + ((cell * 47) % 79) / 100);
      const pulse = .5 + Math.sin(time * .0014 + cell * 1.7) * .5;
      ctx.strokeStyle = `rgba(233,255,248,${.035 + pulse * .055})`;
      ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.ellipse(x, y, 9 + pulse * 7, 3 + pulse * 2, -.18, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawShoreFoam(ctx, time, wind) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(224,249,244,${.1 + Math.min(.14, wind / 160)})`;
    ctx.lineWidth = 1.25;
    const phase = time * (.002 + wind * .000025);
    const shoreSegments = [
      [LAND_POLYGONS.autism, 9, 14],
      [LAND_POLYGONS.autism, 0, 4],
      [LAND_POLYGONS.adhd, 8, 13],
      [LAND_POLYGONS.adhd, 0, 4]
    ];
    for (const [polygon, start, end] of shoreSegments) {
      ctx.beginPath();
      for (let index = start; index <= end; index += 1) {
        const [px, py] = polygon[index % polygon.length];
        const x = this.width * px / 100;
        const y = this.height * py / 100 + Math.sin(phase + index) * 2;
        if (index === start) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRipples(ctx, time) {
    this.ripples = this.ripples.filter((ripple) => time - ripple.born < 3000);
    for (const ripple of this.ripples) {
      const age = (time - ripple.born) / 3000;
      for (let ring = 0; ring < 3; ring += 1) {
        const radius = 12 + age * 105 - ring * 15;
        if (radius < 4) continue;
        ctx.strokeStyle = `rgba(225,252,249,${(1 - age) * (.38 - ring * .08)})`;
        ctx.lineWidth = 2 - age;
        ctx.beginPath();
        ctx.ellipse(ripple.x, ripple.y, radius, radius * .34, 0, 0, TAU);
        ctx.stroke();
      }
    }
  }

  drawAirflow(ctx, time, wind) {
    const speed = .004 + wind * .00022;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let lane = 0; lane < 7; lane += 1) {
      const y = this.height * (.12 + lane * .12) + Math.sin(time * .00025 + lane) * 8;
      ctx.strokeStyle = `rgba(244,252,242,${.018 + (lane % 3) * .01})`;
      ctx.lineWidth = .7 + (lane % 3) * .45;
      ctx.beginPath();
      ctx.moveTo(-40, y);
      ctx.bezierCurveTo(this.width * .28, y - 18, this.width * .63, y + 22, this.width + 40, y - 7);
      ctx.stroke();
    }
    for (let particle = 0; particle < 14; particle += 1) {
      const x = ((particle * 97 + time * (.012 + wind * .001)) % (this.width + 80)) - 40;
      const y = this.height * (.13 + ((particle * 37) % 71) / 100) + Math.sin(time * .001 + particle) * 9;
      ctx.fillStyle = particle % 3 ? "rgba(245,250,223,.14)" : "rgba(218,236,183,.2)";
      ctx.beginPath();
      ctx.ellipse(x, y, 3.2, 1.3, -.32, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.stage?.removeEventListener("pointerdown", this.boundPointer);
    document.removeEventListener("visibilitychange", this.boundVisibility);
  }
}
