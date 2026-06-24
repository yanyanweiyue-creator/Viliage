const TAU = Math.PI * 2;

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const mix = (from, to, amount) => from + (to - from) * amount;

function seededValue(index, salt = 0) {
  const value = Math.sin(index * 91.73 + salt * 37.11) * 43758.5453;
  return value - Math.floor(value);
}

export function environmentPalette({ isDay = true, weather = "clear", season = "summer" } = {}) {
  const seasons = {
    spring: { grass: "#72a65d", leaf: "#5d9254", accent: "#e5a6b8" },
    summer: { grass: "#668f47", leaf: "#3f7445", accent: "#e2b958" },
    autumn: { grass: "#8c8a45", leaf: "#9b6337", accent: "#d07a3b" },
    winter: { grass: "#8ba095", leaf: "#637b70", accent: "#dbe8e5" }
  };
  const base = seasons[season] || seasons.summer;
  if (!isDay) return { ...base, skyTop: "#07172d", skyBottom: "#28415a", waterTop: "#142f45", waterBottom: "#071d2b", light: "#9bc5d5", haze: "rgba(116,151,174,.24)" };
  if (weather === "storm") return { ...base, skyTop: "#263742", skyBottom: "#68777a", waterTop: "#344f58", waterBottom: "#172f37", light: "#b7c2bd", haze: "rgba(181,193,190,.32)" };
  if (weather === "rain") return { ...base, skyTop: "#536d78", skyBottom: "#9eaaa4", waterTop: "#426b70", waterBottom: "#244a53", light: "#c6d1c8", haze: "rgba(196,207,202,.28)" };
  if (weather === "fog") return { ...base, skyTop: "#7c918d", skyBottom: "#d4d7c8", waterTop: "#668a85", waterBottom: "#3f6565", light: "#f0e6c9", haze: "rgba(229,231,216,.5)" };
  if (weather === "snow") return { ...base, skyTop: "#839aa8", skyBottom: "#d8e2dd", waterTop: "#6f959a", waterBottom: "#3e6872", light: "#f7f0d7", haze: "rgba(229,239,237,.38)" };
  return { ...base, skyTop: "#6aa3ad", skyBottom: "#edd5a6", waterTop: "#3d8585", waterBottom: "#163f49", light: "#ffe6a3", haze: "rgba(255,225,174,.18)" };
}

export function waterWaveHeight(x, y, time) {
  return Math.sin(x * .024 + time * .00115) * 2.8 + Math.sin(y * .052 - time * .00082 + x * .012) * 1.55 + Math.cos(x * .009 - y * .021 + time * .00046) * .9;
}

function roundedIslandPath(ctx, cx, cy, rx, ry, phase = 0) {
  const points = 32;
  ctx.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = index / points * TAU;
    const irregularity = 1 + Math.sin(angle * 3 + phase) * .032 + Math.sin(angle * 7 - phase) * .018;
    const x = cx + Math.cos(angle) * rx * irregularity;
    const y = cy + Math.sin(angle) * ry * irregularity;
    if (!index) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class ImmersiveScene {
  constructor({ canvas, stage, buildings = [] }) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas?.getContext("2d", { alpha: false });
    this.enabled = false;
    this.reducedMotion = false;
    this.environment = { isDay: true, weather: "clear", season: "summer" };
    this.buildings = buildings;
    this.frame = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.ripples = [];
    this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    this.boundPointerMove = (event) => this.pointerMove(event);
    this.boundPointerLeave = () => { this.parallax.tx = 0; this.parallax.ty = 0; };
    this.boundRipple = (event) => this.addRipple(event);
    this.boundVisibility = () => this.syncLoop();
    this.resizeObserver?.observe(stage);
    stage?.addEventListener("pointermove", this.boundPointerMove, { passive: true });
    stage?.addEventListener("pointerleave", this.boundPointerLeave, { passive: true });
    stage?.addEventListener("pointerdown", this.boundRipple, { passive: true });
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.resize();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.canvas?.classList.toggle("active", this.enabled);
    this.resize();
    this.syncLoop();
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    this.syncLoop();
  }

  setEnvironment(environment = {}) {
    this.environment = { ...this.environment, ...environment };
    if (this.enabled && this.reducedMotion) this.draw(performance.now());
  }

  resize() {
    if (!this.canvas || !this.stage || !this.ctx) return;
    // clientWidth/clientHeight deliberately ignore the map's focus transform.
    // getBoundingClientRect() would bake the 1.63x island zoom into the backing
    // canvas and shift every projected object after returning to the overview.
    const baseWidth = this.stage.clientWidth;
    const baseHeight = this.stage.clientHeight;
    if (!baseWidth || !baseHeight) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    this.width = Math.round(baseWidth);
    this.height = Math.round(baseHeight);
    const pixelWidth = Math.round(this.width * this.dpr);
    const pixelHeight = Math.round(this.height * this.dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.enabled) this.draw(performance.now());
  }

  pointerMove(event) {
    if (!this.enabled || this.reducedMotion) return;
    const rect = this.stage.getBoundingClientRect();
    this.parallax.tx = ((event.clientX - rect.left) / rect.width - .5) * 1.6;
    this.parallax.ty = ((event.clientY - rect.top) / rect.height - .5) * 1.1;
  }

  addRipple(event) {
    if (!this.enabled || this.reducedMotion) return;
    const rect = this.stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (y < rect.height * .32) return;
    this.ripples.push({ x, y, born: performance.now() });
    if (this.ripples.length > 12) this.ripples.shift();
  }

  syncLoop() {
    const shouldRun = this.enabled && !this.reducedMotion && !document.hidden;
    if (shouldRun && !this.frame) this.frame = requestAnimationFrame((time) => this.animate(time));
    if (!shouldRun && this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (this.enabled) this.draw(performance.now());
    }
  }

  animate(time) {
    this.frame = 0;
    if (!this.enabled || this.reducedMotion || document.hidden) return;
    this.parallax.x = mix(this.parallax.x, this.parallax.tx, .025);
    this.parallax.y = mix(this.parallax.y, this.parallax.ty, .025);
    this.draw(time);
    this.frame = requestAnimationFrame((next) => this.animate(next));
  }

  draw(time) {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    const palette = environmentPalette(this.environment);
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.drawSky(ctx, width, height, palette, time);
    this.drawCloudDepth(ctx, width, height, time);
    this.drawAirCurrents(ctx, width, height, time);
    this.drawForest(ctx, width, height, palette);
    this.drawWater(ctx, width, height, palette, time);
    const liftX = this.parallax.x * width * .006;
    const liftY = this.parallax.y * height * .008;
    this.drawIsland(ctx, width * .255 + liftX, height * .615 + liftY, width * .218, height * .302, palette, 1, "autism");
    this.drawIsland(ctx, width * .745 + liftX, height * .6 + liftY, width * .218, height * .302, palette, 4, "adhd");
    this.drawBuildings(ctx, width, height, palette, time);
    this.drawBridge(ctx, width, height, palette);
    this.drawAtmosphere(ctx, width, height, palette, time);
    ctx.restore();
  }

  drawSky(ctx, width, height, palette, time) {
    const sky = ctx.createLinearGradient(0, 0, 0, height * .62);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const lightX = width * (.72 + this.parallax.x * .018);
    const lightY = height * (.12 + this.parallax.y * .01);
    const glow = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, width * .45);
    glow.addColorStop(0, this.environment.isDay ? "rgba(255,238,185,.75)" : "rgba(173,206,231,.16)");
    glow.addColorStop(.18, this.environment.isDay ? "rgba(255,228,163,.23)" : "rgba(109,150,190,.08)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height * .72);

    if (this.environment.isDay && !["storm", "rain"].includes(this.environment.weather)) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.translate(lightX, lightY);
      ctx.rotate(-.21 + Math.sin(time * .00008) * .01);
      const ray = ctx.createLinearGradient(0, 0, 0, height * .8);
      ray.addColorStop(0, "rgba(255,238,190,.2)");
      ray.addColorStop(1, "rgba(255,238,190,0)");
      ctx.fillStyle = ray;
      for (let index = 0; index < 5; index += 1) {
        ctx.beginPath();
        ctx.moveTo(index * 35 - 110, 0);
        ctx.lineTo(index * 150 - 350, height * .9);
        ctx.lineTo(index * 150 - 265, height * .9);
        ctx.lineTo(index * 35 - 85, 0);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawCloudDepth(ctx, width, height, time) {
    if (["storm"].includes(this.environment.weather)) return;
    const coverage = clamp(Number(this.environment.cloudCover || 24) / 100, .12, .92);
    const count = Math.round(3 + coverage * 7);
    const speed = .003 + clamp(Number(this.environment.windSpeed || 8), 0, 45) * .00028;
    ctx.save();
    for (let index = 0; index < count; index += 1) {
      const depth = .48 + seededValue(index, 70) * .68;
      const cloudWidth = width * (.075 + seededValue(index, 71) * .12) * depth;
      const cloudHeight = cloudWidth * (.25 + seededValue(index, 72) * .13);
      const travel = width + cloudWidth * 2;
      const x = ((seededValue(index, 73) * travel + time * speed * (18 + index * 1.7)) % travel) - cloudWidth;
      const y = height * (.055 + seededValue(index, 74) * .2);
      ctx.save();
      ctx.globalAlpha = (.2 + coverage * .38) * depth;
      ctx.shadowColor = "rgba(27,55,65,.2)";
      ctx.shadowBlur = cloudHeight * .45;
      ctx.shadowOffsetY = cloudHeight * .18;
      const cloud = ctx.createLinearGradient(0, y - cloudHeight, 0, y + cloudHeight);
      cloud.addColorStop(0, "rgba(255,255,250,.96)");
      cloud.addColorStop(.58, "rgba(225,239,238,.86)");
      cloud.addColorStop(1, "rgba(151,181,187,.58)");
      ctx.fillStyle = cloud;
      for (let lobe = 0; lobe < 7; lobe += 1) {
        const progress = lobe / 6;
        const radius = cloudHeight * (.55 + seededValue(index * 11 + lobe, 75) * .6);
        ctx.beginPath();
        ctx.ellipse(x + (progress - .5) * cloudWidth, y - Math.sin(progress * Math.PI) * cloudHeight * .45, radius * 1.15, radius, 0, 0, TAU);
        ctx.fill();
      }
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "rgba(255,255,255,.38)";
      ctx.beginPath();
      ctx.ellipse(x - cloudWidth * .08, y - cloudHeight * .55, cloudWidth * .32, cloudHeight * .18, -.08, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawAirCurrents(ctx, width, height, time) {
    const wind = clamp(Number(this.environment.windSpeed || 8), 0, 45);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.setLineDash([16, 30]);
    ctx.lineDashOffset = -time * (.004 + wind * .00018);
    for (let lane = 0; lane < 6; lane += 1) {
      const y = height * (.08 + lane * .045) + Math.sin(time * .00025 + lane) * 5;
      const airflow = ctx.createLinearGradient(0, y, width, y);
      airflow.addColorStop(0, "rgba(255,255,255,0)");
      airflow.addColorStop(.22, `rgba(239,250,246,${.05 + lane * .006})`);
      airflow.addColorStop(.78, `rgba(239,250,246,${.045 + lane * .005})`);
      airflow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = airflow;
      ctx.lineWidth = .8 + lane * .16;
      ctx.beginPath();
      ctx.moveTo(-30, y);
      ctx.bezierCurveTo(width * .26, y - 18, width * .62, y + 24, width + 30, y - 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawForest(ctx, width, height, palette) {
    const horizon = height * .34;
    ctx.save();
    ctx.globalAlpha = this.environment.weather === "fog" ? .28 : (this.environment.isDay ? .78 : .68);
    for (let index = 0; index < 48; index += 1) {
      const x = seededValue(index, 2) * width;
      const treeHeight = height * (.07 + seededValue(index, 8) * .115);
      const trunkWidth = Math.max(1.25, treeHeight * .024);
      ctx.fillStyle = index % 3 ? "#20352f" : "#34483d";
      ctx.fillRect(x - trunkWidth / 2, horizon - treeHeight, trunkWidth, treeHeight);
      const crownY = horizon - treeHeight * .78;
      ctx.fillStyle = index % 4 ? "#294838" : "#355641";
      for (let cluster = 0; cluster < 3; cluster += 1) {
        const offsetX = (cluster - 1) * treeHeight * .105;
        const offsetY = Math.abs(cluster - 1) * treeHeight * .045;
        ctx.beginPath();
        ctx.ellipse(x + offsetX, crownY + offsetY, treeHeight * .12, treeHeight * (.145 - Math.abs(cluster - 1) * .018), 0, 0, TAU);
        ctx.fill();
      }
    }
    const mist = ctx.createLinearGradient(0, horizon * .55, 0, horizon * 1.25);
    mist.addColorStop(0, "rgba(235,226,196,0)");
    mist.addColorStop(1, palette.haze);
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, width, horizon * 1.35);
    ctx.restore();
  }

  drawWater(ctx, width, height, palette, time) {
    const horizon = height * .29;
    const water = ctx.createLinearGradient(0, horizon, 0, height);
    water.addColorStop(0, palette.waterTop);
    water.addColorStop(1, palette.waterBottom);
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, width, height - horizon);

    const wind = clamp(Number(this.environment.windSpeed || 8), 0, 45);
    ctx.save();
    ctx.globalAlpha = .22 + Math.min(.18, wind / 160);
    for (let band = 0; band < 8; band += 1) {
      const y = horizon + (band / 7) ** 1.45 * (height - horizon);
      const swell = ctx.createLinearGradient(0, y, width, y);
      swell.addColorStop(0, "rgba(8,54,67,0)");
      swell.addColorStop(.25, "rgba(10,60,71,.34)");
      swell.addColorStop(.72, "rgba(7,44,60,.25)");
      swell.addColorStop(1, "rgba(8,54,67,0)");
      ctx.strokeStyle = swell;
      ctx.lineWidth = 7 + band * 2.8;
      ctx.beginPath();
      for (let x = -30; x <= width + 30; x += 15) {
        const offset = waterWaveHeight(x, y, time + band * 390) * (.7 + band * .13);
        if (x === -30) ctx.moveTo(x, y + offset);
        else ctx.lineTo(x, y + offset);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let row = 0; row < 29; row += 1) {
      const perspective = row / 22;
      const y = horizon + perspective * perspective * (height - horizon);
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 18) {
        const wave = waterWaveHeight(x, y, time) * (.3 + perspective * 1.2);
        if (x === -20) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.strokeStyle = `rgba(204,244,238,${.04 + perspective * (.12 + wind / 500)})`;
      ctx.lineWidth = .55 + perspective * 1.55;
      ctx.stroke();
    }
    const reflection = ctx.createLinearGradient(0, horizon, 0, height * .87);
    reflection.addColorStop(0, "rgba(255,226,164,.2)");
    reflection.addColorStop(.45, "rgba(255,226,164,.045)");
    reflection.addColorStop(1, "rgba(255,226,164,0)");
    ctx.fillStyle = reflection;
    ctx.beginPath();
    ctx.moveTo(width * .61, horizon);
    ctx.lineTo(width * .83, horizon);
    ctx.lineTo(width * .68, height * .9);
    ctx.lineTo(width * .52, height * .9);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.filter = "blur(5px)";
    for (const island of [[.255, .73, .19], [.745, .72, .19]]) {
      const islandReflection = ctx.createLinearGradient(0, height * .58, 0, height * .95);
      islandReflection.addColorStop(0, "rgba(88,128,78,.2)");
      islandReflection.addColorStop(.5, "rgba(43,83,74,.08)");
      islandReflection.addColorStop(1, "rgba(25,66,71,0)");
      ctx.fillStyle = islandReflection;
      ctx.beginPath();
      ctx.ellipse(width * island[0], height * island[1], width * island[2], height * .2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (let glint = 0; glint < 34; glint += 1) {
      const yProgress = seededValue(glint, 91);
      const x = width * (.54 + seededValue(glint, 92) * .24) + Math.sin(time * .0006 + glint) * 12;
      const y = horizon + yProgress * (height - horizon) * .78;
      const length = 5 + yProgress * 24;
      ctx.strokeStyle = `rgba(255,239,190,${.05 + (1 - yProgress) * .16})`;
      ctx.lineWidth = .8 + yProgress;
      ctx.beginPath();
      ctx.moveTo(x - length, y);
      ctx.lineTo(x + length, y + waterWaveHeight(x, y, time) * .18);
      ctx.stroke();
    }
    ctx.restore();

    const now = performance.now();
    this.ripples = this.ripples.filter((ripple) => now - ripple.born < 2400);
    this.ripples.forEach((ripple) => {
      const age = (now - ripple.born) / 2400;
      ctx.strokeStyle = `rgba(205,238,226,${(1 - age) * .42})`;
      ctx.lineWidth = 1.5 - age;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, 8 + age * 66, 3 + age * 19, 0, 0, TAU);
      ctx.stroke();
    });
  }

  drawBuildings(ctx, width, height, palette, time) {
    const buildings = [...this.buildings].sort((first, second) => Number(first.y3d || first.y) - Number(second.y3d || second.y));
    for (const building of buildings) {
      const x = width * Number(building.x3d ?? building.x) / 100;
      const y = height * Number(building.y3d ?? building.y) / 100;
      const scale = (width / 1200) * (.72 + y / height * .52);
      this.drawBuilding(ctx, building, x, y, scale, palette, time);
    }
  }

  drawBuilding(ctx, building, x, y, scale, palette, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(7,25,22,.34)";
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "rgba(17,41,34,.28)";
    ctx.beginPath();
    ctx.ellipse(0, 7, 34, 10, 0, 0, TAU);
    ctx.fill();
    ctx.shadowColor = "transparent";
    const label = String(building.mapLabel || "Village");
    const isNight = !this.environment.isDay;
    if (isNight) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const aura = ctx.createRadialGradient(0, -13, 3, 0, -13, 58);
      aura.addColorStop(0, "rgba(255,210,103,.2)");
      aura.addColorStop(1, "rgba(255,194,76,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(-62, -70, 124, 88);
      ctx.restore();
    }
    if (label === "School") this.drawSchool(ctx, isNight, time);
    else if (label === "Courthouse") this.drawCourthouse(ctx, isNight, time);
    else if (label === "Village") this.drawVillage(ctx, isNight, time);
    else if (label === "Park") this.drawPark(ctx, palette, time, isNight);
    else this.drawWoodsBuilding(ctx, palette, isNight, time);
    ctx.restore();
  }

  drawLitWindow(ctx, x, y, width, height, isNight, time, phase = 0) {
    const flicker = .9 + Math.sin(time * .0011 + phase) * .08;
    ctx.save();
    ctx.fillStyle = isNight ? `rgba(255,218,112,${flicker})` : "#d8f0e9";
    if (isNight) {
      ctx.shadowColor = "rgba(255,193,72,.88)";
      ctx.shadowBlur = 9;
    }
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = isNight ? "rgba(125,83,38,.72)" : "rgba(74,104,94,.5)";
    ctx.lineWidth = .8;
    ctx.strokeRect(x, y, width, height);
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y); ctx.lineTo(x + width / 2, y + height);
    ctx.moveTo(x, y + height / 2); ctx.lineTo(x + width, y + height / 2);
    ctx.stroke();
    ctx.restore();
  }

  drawSchool(ctx, isNight, time) {
    const wall = ctx.createLinearGradient(-34, -30, 34, 12);
    wall.addColorStop(0, "#f2d6a0");
    wall.addColorStop(1, "#b87845");
    ctx.fillStyle = wall;
    ctx.fillRect(-36, -27, 72, 34);
    ctx.fillStyle = "#914f38";
    ctx.beginPath(); ctx.moveTo(-43, -27); ctx.lineTo(0, -49); ctx.lineTo(43, -27); ctx.closePath(); ctx.fill();
    for (const [index, wx] of [-25, -12, 13, 26].entries()) this.drawLitWindow(ctx, wx - 4, -18, 8, 9, isNight, time, index);
    ctx.fillStyle = "#70503a"; ctx.fillRect(-5, -12, 10, 19);
    ctx.fillStyle = "#fff4c9"; ctx.beginPath(); ctx.arc(0, -34, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#6a503c"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -39); ctx.moveTo(0, -34); ctx.lineTo(4, -31); ctx.stroke();
  }

  drawCourthouse(ctx, isNight, time) {
    ctx.fillStyle = "#e9e2ce";
    ctx.fillRect(-29, -29, 58, 36);
    ctx.fillStyle = "#cbc3ad";
    ctx.beginPath(); ctx.moveTo(-36, -29); ctx.lineTo(0, -52); ctx.lineTo(36, -29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f5efdc";
    for (const cx of [-20, -7, 7, 20]) ctx.fillRect(cx - 3.2, -27, 6.4, 31);
    ctx.fillStyle = "#897b67"; ctx.fillRect(-7, -12, 14, 19);
    this.drawLitWindow(ctx, -24, -20, 8, 13, isNight, time, 1.2);
    this.drawLitWindow(ctx, 16, -20, 8, 13, isNight, time, 2.5);
    ctx.fillStyle = "#c8bea8"; ctx.fillRect(-36, 5, 72, 5); ctx.fillRect(-30, 12, 60, 4);
  }

  drawVillage(ctx, isNight, time) {
    for (const [index, home] of [{ x: -26, y: -2, s: .8, c: "#d79b63" }, { x: 0, y: -10, s: 1, c: "#c78655" }, { x: 28, y: 1, s: .72, c: "#e0ad70" }].entries()) {
      ctx.save(); ctx.translate(home.x, home.y); ctx.scale(home.s, home.s);
      ctx.fillStyle = home.c; ctx.fillRect(-14, -25, 28, 27);
      ctx.fillStyle = "#7e4b36"; ctx.beginPath(); ctx.moveTo(-18, -25); ctx.lineTo(0, -39); ctx.lineTo(18, -25); ctx.closePath(); ctx.fill();
      this.drawLitWindow(ctx, -9, -17, 6, 7, isNight, time, index); this.drawLitWindow(ctx, 4, -17, 6, 7, isNight, time, index + .7);
      ctx.fillStyle = "#69503c"; ctx.fillRect(-3, -10, 7, 12);
      ctx.restore();
    }
  }

  drawPark(ctx, palette, time, isNight) {
    ctx.strokeStyle = "#83573d"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-25, 5); ctx.lineTo(-21, -31); ctx.lineTo(22, -31); ctx.lineTo(26, 5); ctx.moveTo(-18, -22); ctx.lineTo(19, -22); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, -21); ctx.lineTo(-10, -4); ctx.moveTo(9, -21); ctx.lineTo(9, -4); ctx.stroke();
    ctx.fillStyle = "#caa566"; ctx.fillRect(-17, -5 + Math.sin(time * .002) * 1.4, 13, 3); ctx.fillRect(3, -5 - Math.sin(time * .002) * 1.4, 13, 3);
    ctx.fillStyle = palette.accent; for (let flower = 0; flower < 8; flower += 1) { ctx.beginPath(); ctx.arc(-34 + flower * 10, 4 + (flower % 2) * 3, 2.2, 0, TAU); ctx.fill(); }
    for (const lampX of [-33, 33]) {
      ctx.strokeStyle = "#574a3c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lampX, 5); ctx.lineTo(lampX, -24); ctx.stroke();
      ctx.fillStyle = isNight ? "#ffe59b" : "#edf4df"; ctx.shadowColor = isNight ? "#ffc858" : "transparent"; ctx.shadowBlur = isNight ? 12 : 0; ctx.beginPath(); ctx.arc(lampX, -26, 4.2, 0, TAU); ctx.fill(); ctx.shadowColor = "transparent";
    }
  }

  drawWoodsBuilding(ctx, palette, isNight, time) {
    for (const tree of [{ x: -25, s: .9 }, { x: -8, s: 1.15 }, { x: 13, s: .86 }, { x: 28, s: 1.05 }]) {
      ctx.save(); ctx.translate(tree.x, 1); ctx.scale(tree.s, tree.s);
      ctx.fillStyle = "#604630"; ctx.fillRect(-2, -31, 4, 31);
      ctx.fillStyle = palette.leaf;
      for (let lobe = 0; lobe < 4; lobe += 1) { ctx.beginPath(); ctx.arc((lobe - 1.5) * 6, -30 - (lobe % 2) * 5, 10, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = "#e6d3a6"; ctx.beginPath(); ctx.moveTo(-13, 3); ctx.lineTo(0, -14); ctx.lineTo(14, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b96f49"; ctx.beginPath(); ctx.moveTo(-13, 3); ctx.lineTo(0, -14); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
    this.drawLitWindow(ctx, -3, -5, 6, 7, isNight, time, 3.2);
  }

  drawIsland(ctx, cx, cy, rx, ry, palette, phase, island) {
    ctx.save();
    ctx.shadowColor = "rgba(3,22,20,.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 14;
    roundedIslandPath(ctx, cx, cy + 10, rx, ry, phase);
    ctx.fillStyle = "#5a5135";
    ctx.fill();
    ctx.shadowColor = "transparent";

    roundedIslandPath(ctx, cx, cy, rx, ry, phase);
    const land = ctx.createRadialGradient(cx - rx * .28, cy - ry * .36, rx * .06, cx, cy, rx * 1.05);
    land.addColorStop(0, this.environment.season === "winter" ? "#cad4c9" : "#a8bc68");
    land.addColorStop(.58, palette.grass);
    land.addColorStop(1, "#405f38");
    ctx.fillStyle = land;
    ctx.fill();
    ctx.strokeStyle = "rgba(226,211,154,.72)";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.save();
    roundedIslandPath(ctx, cx, cy, rx - 4, ry - 4, phase);
    ctx.clip();
    const pathColor = "rgba(222,199,139,.8)";
    ctx.strokeStyle = pathColor;
    ctx.lineWidth = Math.max(5, rx * .035);
    ctx.lineCap = "round";
    ctx.setLineDash([rx * .055, rx * .025]);
    ctx.beginPath();
    if (island === "autism") {
      ctx.moveTo(cx - rx * .72, cy + ry * .1);
      ctx.bezierCurveTo(cx - rx * .2, cy - ry * .62, cx + rx * .5, cy - ry * .4, cx + rx * .72, cy + ry * .02);
      ctx.bezierCurveTo(cx + rx * .38, cy + ry * .38, cx - rx * .1, cy + ry * .46, cx - rx * .54, cy + ry * .62);
    } else {
      ctx.moveTo(cx - rx * .76, cy + ry * .2);
      ctx.bezierCurveTo(cx - rx * .34, cy - ry * .2, cx + rx * .16, cy - ry * .58, cx + rx * .76, cy - ry * .18);
      ctx.bezierCurveTo(cx + rx * .54, cy + ry * .2, cx + rx * .22, cy + ry * .38, cx + rx * .62, cy + ry * .7);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    this.drawPond(ctx, island === "autism" ? cx - rx * .66 : cx + rx * .58, island === "autism" ? cy + ry * .05 : cy - ry * .32, rx * .19, ry * .16);
    this.drawTrees(ctx, cx, cy, rx, ry, palette, island === "autism" ? 3 : 7, island);
    ctx.restore();
    ctx.restore();
  }

  drawPond(ctx, x, y, rx, ry) {
    const pond = ctx.createRadialGradient(x - rx * .2, y - ry * .4, 1, x, y, rx);
    pond.addColorStop(0, "rgba(170,227,213,.95)");
    pond.addColorStop(1, "rgba(37,116,116,.95)");
    ctx.fillStyle = pond;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -.18, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(221,225,169,.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  drawTrees(ctx, cx, cy, rx, ry, palette, seed, island) {
    const treeCount = island === "autism" ? 17 : 20;
    const trees = Array.from({ length: treeCount }, (_, index) => {
      const angle = seededValue(index, seed) * TAU;
      const radius = .62 + seededValue(index, seed + 1) * .3;
      return {
        x: cx + Math.cos(angle) * rx * radius,
        y: cy + Math.sin(angle) * ry * radius,
        scale: .55 + seededValue(index, seed + 2) * .65
      };
    }).sort((a, b) => a.y - b.y);
    trees.forEach((tree, index) => {
      const trunkHeight = ry * .19 * tree.scale;
      if (island === "autism" && index % 3 === 0) {
        this.drawJujubeTree(ctx, tree.x, tree.y, trunkHeight, palette, index);
        return;
      }
      if (island === "adhd" && index % 4 === 0) {
        this.drawPineTree(ctx, tree.x, tree.y, trunkHeight, palette);
        return;
      }
      ctx.fillStyle = "#5c452f";
      ctx.fillRect(tree.x - 2 * tree.scale, tree.y - trunkHeight, 4 * tree.scale, trunkHeight);
      ctx.fillStyle = index % 5 === 0 ? palette.accent : palette.leaf;
      for (let cluster = 0; cluster < 5; cluster += 1) {
        const angle = cluster / 5 * TAU;
        ctx.beginPath();
        ctx.arc(tree.x + Math.cos(angle) * trunkHeight * .28, tree.y - trunkHeight + Math.sin(angle) * trunkHeight * .24, trunkHeight * .34, 0, TAU);
        ctx.fill();
      }
    });

    if (island === "adhd") {
      ctx.fillStyle = "rgba(232,169,75,.72)";
      for (let index = 0; index < 26; index += 1) {
        const x = cx + (seededValue(index, 31) - .5) * rx * 1.38;
        const y = cy + (seededValue(index, 32) - .5) * ry * 1.1;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + seededValue(index, 33) * 1.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawJujubeTree(ctx, x, y, height, palette, seed) {
    ctx.strokeStyle = "#654630";
    ctx.lineWidth = Math.max(1.8, height * .08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - height * .12, y - height * .48, x, y - height);
    ctx.moveTo(x - height * .05, y - height * .58);
    ctx.lineTo(x - height * .42, y - height * .84);
    ctx.moveTo(x, y - height * .72);
    ctx.lineTo(x + height * .4, y - height * .94);
    ctx.stroke();
    ctx.fillStyle = palette.leaf;
    for (let cluster = 0; cluster < 9; cluster += 1) {
      const angle = cluster / 9 * TAU;
      const cx = x + Math.cos(angle) * height * (.26 + (cluster % 2) * .1);
      const cy = y - height * .83 + Math.sin(angle) * height * .3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, height * .2, height * .13, angle, 0, TAU);
      ctx.fill();
      if ((cluster + seed) % 3 === 0) {
        ctx.fillStyle = "#a33f2f";
        ctx.beginPath();
        ctx.arc(cx + height * .05, cy + height * .07, Math.max(1.1, height * .035), 0, TAU);
        ctx.fill();
        ctx.fillStyle = palette.leaf;
      }
    }
  }

  drawPineTree(ctx, x, y, height, palette) {
    ctx.fillStyle = "#5a4432";
    ctx.fillRect(x - height * .05, y - height, height * .1, height);
    ctx.fillStyle = "#294f3e";
    for (let tier = 0; tier < 3; tier += 1) {
      const top = y - height * (1.18 - tier * .25);
      const halfWidth = height * (.26 + tier * .11);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x - halfWidth, top + height * .55);
      ctx.lineTo(x + halfWidth, top + height * .55);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawBridge(ctx, width, height) {
    const y = height * .55;
    const start = width * .468;
    const end = width * .532;
    ctx.save();
    ctx.translate(0, this.parallax.y * 2);
    ctx.strokeStyle = "rgba(54,39,25,.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(start, y - 9);
    ctx.quadraticCurveTo(width * .505, y + 5, end, y - 10);
    ctx.moveTo(start, y + 10);
    ctx.quadraticCurveTo(width * .505, y + 24, end, y + 9);
    ctx.stroke();
    for (let index = 0; index <= 13; index += 1) {
      const progress = index / 13;
      const x = mix(start, end, progress);
      const bow = Math.sin(progress * Math.PI) * 14;
      ctx.fillStyle = index % 2 ? "#9d7042" : "#b1814d";
      ctx.save();
      ctx.translate(x, y + bow);
      ctx.rotate((progress - .5) * .12);
      ctx.fillRect(-3, -11, 7, 26);
      ctx.restore();
    }
    ctx.restore();
  }

  drawAtmosphere(ctx, width, height, palette, time) {
    const vignette = ctx.createRadialGradient(width * .5, height * .5, width * .22, width * .5, height * .5, width * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, this.environment.isDay ? "rgba(16,34,27,.22)" : "rgba(0,8,20,.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    if (this.environment.weather === "fog") {
      ctx.fillStyle = `rgba(225,231,219,${.12 + Math.sin(time * .0003) * .03})`;
      ctx.fillRect(0, height * .18, width, height * .62);
    }
    if (this.environment.isDay && !["rain", "storm", "fog"].includes(this.environment.weather)) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const bloomX = width * .72;
      const bloomY = height * .12;
      for (let ring = 0; ring < 4; ring += 1) {
        ctx.strokeStyle = `rgba(255,232,174,${.1 - ring * .018})`;
        ctx.lineWidth = 1.2 + ring;
        ctx.beginPath();
        ctx.arc(bloomX, bloomY, 22 + ring * 26 + Math.sin(time * .0005 + ring) * 3, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,245,205,.26)";
      ctx.beginPath(); ctx.arc(bloomX, bloomY, 7, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resizeObserver?.disconnect();
    this.stage?.removeEventListener("pointermove", this.boundPointerMove);
    this.stage?.removeEventListener("pointerleave", this.boundPointerLeave);
    this.stage?.removeEventListener("pointerdown", this.boundRipple);
    document.removeEventListener("visibilitychange", this.boundVisibility);
  }
}
