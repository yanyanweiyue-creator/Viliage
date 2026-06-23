import { nextLivestockAction, shouldLaunchSunsetFlock, shouldShowDragon } from "./ecosystem-logic.mjs";

const clampIndex = (value, length) => Math.max(0, Math.min(length - 1, Number(value) || 0));
const randomBetween = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);

export class EcosystemController {
  constructor({ config, stage, creatureLayer, skyLayer, onSound = () => {} }) {
    this.config = config || {};
    this.stage = stage;
    this.creatureLayer = creatureLayer;
    this.skyLayer = skyLayer;
    this.onSound = onSound;
    this.actors = new Map();
    this.clock = { isDay: true, currentMinutes: 720, sunrise: 360, sunset: 1080, localDate: "", locationSeed: "village" };
    this.weather = "clear";
    this.calm = false;
    this.timer = null;
    this.dragonShownDate = "";
    this.flockShownDate = "";
    this.initialized = false;
  }

  init() {
    if (this.initialized || !this.creatureLayer || !this.skyLayer) return;
    this.initialized = true;
    this.renderActors();
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick(true);
  }

  renderActors() {
    this.creatureLayer.replaceChildren();
    this.skyLayer.replaceChildren();
    const now = Date.now();
    for (const definition of this.config.animals || []) {
      const route = this.config.routes?.[definition.route] || [];
      if (!route.length) continue;
      const routeIndex = clampIndex(definition.start, route.length);
      const point = route[routeIndex];
      const element = document.createElement("span");
      element.className = "ecosystem-actor state-idle";
      element.dataset.actorId = definition.id;
      element.dataset.species = definition.species;
      element.dataset.island = definition.island;
      element.dataset.flying = String(Boolean(definition.flying));
      element.title = definition.label;
      element.style.left = `${point.x}%`;
      element.style.top = `${point.y}%`;
      const glyph = document.createElement("span");
      glyph.className = "actor-glyph";
      glyph.textContent = definition.emoji;
      element.append(glyph);
      (definition.flying ? this.skyLayer : this.creatureLayer).append(element);
      this.actors.set(definition.id, {
        definition, element, route, routeIndex,
        nextMoveAt: now + randomBetween(1200, 4500),
        arriveAt: 0, arrivalState: "", inside: false,
        lastGrazeAt: now,
        lastDrinkAt: now
      });
    }

    const dragon = document.createElement("span");
    dragon.className = "dawn-dragon";
    dragon.id = "dawn-dragon";
    dragon.title = this.config.events?.dragon?.label || "Azure dawn dragon";
    dragon.textContent = this.config.events?.dragon?.emoji || "🐉";
    this.skyLayer.append(dragon);
  }

  setActorState(actor, stateName) {
    [...actor.element.classList].filter((name) => name.startsWith("state-")).forEach((name) => actor.element.classList.remove(name));
    actor.element.classList.add(`state-${stateName}`);
  }

  moveTo(actor, targetIndex, arrivalState = "idle", pauseMs = 5000) {
    const point = actor.route[clampIndex(targetIndex, actor.route.length)];
    const current = actor.route[actor.routeIndex];
    const distance = Math.hypot(point.x - current.x, point.y - current.y);
    const durationMs = Math.max(2600, Math.min(actor.definition.flying ? 12_000 : 7200, distance * (actor.definition.flying ? 390 : 290)));
    actor.routeIndex = clampIndex(targetIndex, actor.route.length);
    actor.element.style.transitionDuration = `${durationMs}ms, ${durationMs}ms, .5s, .8s`;
    actor.element.style.left = `${point.x}%`;
    actor.element.style.top = `${point.y}%`;
    this.setActorState(actor, actor.definition.flying ? "flying" : "walking");
    actor.arriveAt = Date.now() + durationMs;
    actor.arrivalState = arrivalState;
    actor.nextMoveAt = actor.arriveAt + pauseMs;
  }

  adjacentIndex(actor) {
    const last = actor.route.length - 1;
    if (actor.routeIndex <= 0) return 1;
    if (actor.routeIndex >= last) return last - 1;
    return actor.routeIndex + (Math.random() < .5 ? -1 : 1);
  }

  tick(force = false) {
    const now = Date.now();
    for (const actor of this.actors.values()) {
      if (actor.arrivalState && now >= actor.arriveAt) {
        this.setActorState(actor, actor.arrivalState);
        actor.inside = actor.arrivalState === "inside";
        actor.arrivalState = "";
      }
      if (!force && now < actor.nextMoveAt) continue;

      if (actor.definition.villager) {
        if (!this.clock.isDay) {
          if (!actor.inside && !actor.arrivalState) {
            const home = clampIndex(actor.definition.home, actor.route.length);
            const nextStep = actor.routeIndex === home ? home : actor.routeIndex + Math.sign(home - actor.routeIndex);
            this.moveTo(actor, nextStep, nextStep === home ? "inside" : "idle", nextStep === home ? 60_000 : 900);
          }
          else actor.nextMoveAt = now + 30_000;
          continue;
        }
        if (actor.inside) {
          actor.inside = false;
          this.setActorState(actor, "idle");
        }
      }

      if (actor.definition.flying && !this.clock.isDay) {
        this.setActorState(actor, "resting");
        actor.nextMoveAt = now + 30_000;
        continue;
      }

      if (!actor.definition.flying && !actor.definition.villager && ["rain", "storm"].includes(this.weather)) {
        this.setActorState(actor, "resting");
        actor.nextMoveAt = now + randomBetween(12_000, 24_000);
        continue;
      }

      if (actor.definition.livestock) {
        const action = nextLivestockAction({
          now,
          lastGrazeAt: actor.lastGrazeAt,
          lastDrinkAt: actor.lastDrinkAt,
          grazeEvery: Number(this.config.timings?.grazeEveryMinutes || 5) * 60_000,
          drinkEvery: Number(this.config.timings?.drinkEveryMinutes || 10) * 60_000
        });
        if (action === "drink") {
          actor.lastDrinkAt = now;
          this.moveTo(actor, actor.definition.waterPoint, "drinking", 16_000);
          continue;
        }
        if (action === "graze") {
          actor.lastGrazeAt = now;
          this.moveTo(actor, actor.definition.grazePoint, "grazing", 18_000);
          continue;
        }
      }

      this.moveTo(actor, this.adjacentIndex(actor), Math.random() < .3 ? "looking" : "idle", randomBetween(3500, 8500));
    }
  }

  setClock(clock) {
    const previousDayState = this.clock.isDay;
    this.clock = { ...this.clock, ...clock };
    if (previousDayState !== this.clock.isDay) this.tick(true);
    if (this.calm) return;

    const dragon = this.config.events?.dragon || {};
    if (shouldShowDragon({
      dateKey: this.clock.localDate,
      seed: this.clock.locationSeed,
      minute: this.clock.currentMinutes,
      sunrise: this.clock.sunrise,
      weather: this.weather,
      lastShownDate: this.dragonShownDate,
      probability: dragon.probability ?? .12,
      minutesBefore: dragon.dawnBeforeMinutes ?? 20,
      minutesAfter: dragon.dawnAfterMinutes ?? 40
    })) this.launchDragon();

    const flock = this.config.events?.sunsetFlock || {};
    if (shouldLaunchSunsetFlock({
      dateKey: this.clock.localDate,
      minute: this.clock.currentMinutes,
      sunset: this.clock.sunset,
      lastLaunchDate: this.flockShownDate,
      minutesBefore: flock.beforeMinutes ?? 8,
      minutesAfter: flock.afterMinutes ?? 6
    })) this.launchSunsetFlock(Number(flock.count || 9));
  }

  launchDragon() {
    const dragon = this.skyLayer.querySelector("#dawn-dragon");
    if (!dragon) return;
    this.dragonShownDate = this.clock.localDate;
    dragon.classList.remove("in-flight");
    void dragon.offsetWidth;
    dragon.classList.add("in-flight");
    this.onSound("dragon");
    setTimeout(() => dragon.classList.remove("in-flight"), 12_500);
  }

  launchSunsetFlock(count) {
    this.flockShownDate = this.clock.localDate;
    const flock = document.createElement("div");
    flock.className = "sunset-flock";
    for (let index = 0; index < count; index += 1) {
      const bird = document.createElement("span");
      bird.className = "sunset-gull";
      bird.textContent = "⌁";
      bird.style.setProperty("--flock-left", `${8 + (index % 4) * 7}%`);
      bird.style.setProperty("--flock-top", `${46 + (index % 3) * 5}%`);
      bird.style.setProperty("--flock-delay", `${index * .24}s`);
      flock.append(bird);
    }
    this.skyLayer.append(flock);
    this.onSound("gull");
    setTimeout(() => flock.remove(), 14_000);
  }

  setWeather(kind) { this.weather = kind || "clear"; }
  setCalm(value) { this.calm = Boolean(value); }

  audibleSpecies(selectedIsland = null) {
    return [...this.actors.values()]
      .filter((actor) => !actor.inside && (actor.definition.island === "sky" || actor.definition.island === "village" || !selectedIsland || actor.definition.island === selectedIsland))
      .map((actor) => actor.definition.species);
  }

  destroy() {
    clearInterval(this.timer);
    this.timer = null;
    this.initialized = false;
  }
}
