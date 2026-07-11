import { nextLivestockAction, shouldAnimalRest, shouldLaunchSunsetFlock, shouldShowDragon } from "./ecosystem-logic.mjs";
import { createCreatureArt } from "./creature-art.mjs?v=land-map-20260624";

const clampIndex = (value, length) => Math.max(0, Math.min(length - 1, Number(value) || 0));
const randomBetween = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);
const movementRate = (definition) => ({ fox: 1.12, deer: .92, capybara: .72, villager: .82, gull: 1.16, bird: 1.3 }[definition.species] || 1);
const POSITIVE_CHAT = Object.freeze({
  clear: ["Lovely sunshine today.", "The sky looks bright and peaceful.", "A gentle day for exploring."],
  cloudy: ["The clouds look soft today.", "A calm breeze is moving through the village."],
  fog: ["The village feels quiet and cozy.", "A lovely morning for a slow stroll."],
  rain: ["The rain makes the gardens sparkle.", "Perfect weather for a warm cup of tea."],
  snow: ["The snow makes everything glow.", "What a cozy winter day."],
  storm: ["We are warm and safe together.", "A cozy moment to listen to the rain."],
  spring: ["The spring flowers are waking up.", "I spotted a tiny butterfly!"],
  summer: ["The summer breeze feels wonderful.", "The songbirds sound cheerful today."],
  autumn: ["The autumn leaves are dancing.", "The village looks golden today."],
  winter: ["The village lights feel extra cozy.", "A peaceful winter walk sounds nice."],
  night: ["The stars are keeping us company.", "The village feels peaceful tonight."]
});
const ISLAND_PROJECTIONS = Object.freeze({
  autism: {
    "2d": { x: 25, y: 52, rx: 22.5, ry: 30.5 },
    "3d": { x: 25.5, y: 61.5, rx: 19.6, ry: 25.2 }
  },
  adhd: {
    "2d": { x: 75, y: 51, rx: 23, ry: 31 },
    "3d": { x: 74.5, y: 60, rx: 19.6, ry: 25.2 }
  }
});

function actorOffset(id) {
  let hash = 0;
  for (const character of String(id)) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return { x: ((hash % 7) - 3) * .12, y: (((hash >>> 3) % 5) - 2) * .1 };
}

export function projectActorPoint(point, island, sceneMode = "2d", offset = { x: 0, y: 0 }) {
  if (!point || !ISLAND_PROJECTIONS[island]) return { x: Number(point?.x || 0) + Number(offset.x || 0), y: Number(point?.y || 0) + Number(offset.y || 0) };
  const source = ISLAND_PROJECTIONS[island]["2d"];
  const target = ISLAND_PROJECTIONS[island][sceneMode === "3d" ? "3d" : "2d"];
  let nx = (Number(point.x) - source.x) / source.rx;
  let ny = (Number(point.y) - source.y) / source.ry;
  const radius = Math.hypot(nx, ny);
  const safeRadius = .78;
  if (radius > safeRadius) {
    nx *= safeRadius / radius;
    ny *= safeRadius / radius;
  }
  return {
    x: target.x + nx * target.rx + Number(offset.x || 0),
    y: target.y + ny * target.ry + Number(offset.y || 0)
  };
}

export class EcosystemController {
  constructor({ config, stage, creatureLayer, skyLayer, onSound = () => {}, onBuilding = () => {} }) {
    this.config = config || {};
    this.stage = stage;
    this.creatureLayer = creatureLayer;
    this.skyLayer = skyLayer;
    this.onSound = onSound;
    this.onBuilding = onBuilding;
    this.actors = new Map();
    this.clock = { isDay: true, currentMinutes: 720, sunrise: 360, sunset: 1080, localDate: "", locationSeed: "village" };
    this.weather = "clear";
    this.season = "summer";
    this.calm = false;
    this.sceneMode = "2d";
    this.timer = null;
    this.dragonShownDate = "";
    this.flockShownDate = "";
    this.initialized = false;
    this.lastChatAt = 0;
    this.chatTimer = null;
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
      const offset = actorOffset(definition.id);
      const element = document.createElement(definition.buildingTarget ? "button" : "span");
      element.className = "ecosystem-actor state-idle";
      if (definition.buildingTarget) {
        element.type = "button";
        element.dataset.building = definition.buildingTarget;
        element.classList.add("interactive-actor");
        let pointerActivated = false;
        element.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          pointerActivated = true;
          event.stopPropagation();
          this.onBuilding(definition.buildingTarget);
        });
        element.addEventListener("pointerenter", () => this.holdInteractiveActor(definition.id));
        element.addEventListener("pointerleave", () => this.releaseInteractiveActor(definition.id));
        element.addEventListener("pointercancel", () => { pointerActivated = false; });
        element.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pointerActivated) {
            pointerActivated = false;
            return;
          }
          this.onBuilding(definition.buildingTarget);
        });
      }
      element.dataset.actorId = definition.id;
      element.dataset.species = definition.species;
      element.dataset.island = definition.island;
      element.dataset.flying = String(Boolean(definition.flying));
      if (definition.buildingTarget) element.setAttribute("aria-label", `${definition.label}: open ${definition.buildingTarget.replaceAll("-", " ")}`);
      else {
        element.setAttribute("role", "img");
        element.setAttribute("aria-label", definition.label);
      }
      this.positionActor({ definition, element, route, routeIndex, offset }, point);
      element.style.setProperty("--actor-facing", definition.start % 2 ? "-1" : "1");
      element.dataset.gait = definition.species;
      const glyph = document.createElement("span");
      glyph.className = "actor-glyph";
      if (definition.imageSrc) {
        const image = document.createElement("img");
        image.className = "actor-art actor-image";
        image.src = definition.imageSrc;
        image.alt = "";
        image.decoding = "async";
        glyph.append(image);
      } else {
        glyph.append(createCreatureArt(document, definition.species, definition.artVariant || 0));
      }
      element.append(glyph);
      if (definition.species === "capybara") {
        const chat = document.createElement("span");
        chat.className = "actor-chat-bubble";
        chat.setAttribute("aria-hidden", "true");
        element.append(chat);
      }
      (definition.flying ? this.skyLayer : this.creatureLayer).append(element);
      this.actors.set(definition.id, {
        definition, element, route, routeIndex, offset,
        nextMoveAt: now + randomBetween(definition.species === "capybara" ? 1800 : 1200, definition.species === "capybara" ? 6200 : 4500),
        arriveAt: 0, arrivalState: "", inside: false,
        lastAction: "idle",
        lastGrazeAt: now,
        lastDrinkAt: now
      });
    }

    const dragon = document.createElement("span");
    dragon.className = "dawn-dragon";
    dragon.id = "dawn-dragon";
    dragon.title = this.config.events?.dragon?.label || "Azure dawn dragon";
    dragon.setAttribute("role", "img");
    dragon.setAttribute("aria-label", dragon.title);
    dragon.append(createCreatureArt(document, "dragon"));
    this.skyLayer.append(dragon);
  }

  setActorState(actor, stateName) {
    if (actor.element.classList.contains(`state-${stateName}`)) return;
    [...actor.element.classList].filter((name) => name.startsWith("state-")).forEach((name) => actor.element.classList.remove(name));
    actor.element.classList.add(`state-${stateName}`);
    actor.element.classList.add("state-transitioning");
    setTimeout(() => actor.element.classList.remove("state-transitioning"), 180);
    actor.lastAction = stateName;
  }

  nextCapybaraAction(actor) {
    const actions = Array.isArray(actor.definition.actions) && actor.definition.actions.length ? actor.definition.actions : ["looking", "idle"];
    const choices = actions.filter((action) => action !== actor.lastAction);
    return (choices.length ? choices : actions)[Math.floor(Math.random() * (choices.length || actions.length))];
  }

  maybeStartConversation(actor, now) {
    if (actor.definition.species !== "capybara" || actor.arrivalState || now - this.lastChatAt < 14_000 || Math.random() > .009) return;
    const bubble = actor.element.querySelector(".actor-chat-bubble");
    if (!bubble) return;
    const pool = [...(POSITIVE_CHAT[this.weather] || POSITIVE_CHAT.clear), ...(POSITIVE_CHAT[this.season] || POSITIVE_CHAT.summer), ...(!this.clock.isDay ? POSITIVE_CHAT.night : [])];
    bubble.textContent = pool[Math.floor(Math.random() * pool.length)];
    actor.element.classList.add("chatting");
    this.lastChatAt = now;
    clearTimeout(this.chatTimer);
    this.chatTimer = setTimeout(() => actor.element.classList.remove("chatting"), 4600);
  }

  celebrate() {
    const capybaras = [...this.actors.values()].filter((actor) => actor.definition.species === "capybara");
    capybaras.forEach((actor, index) => {
      setTimeout(() => {
        this.setActorState(actor, "waving");
        const bubble = actor.element.querySelector(".actor-chat-bubble");
        if (bubble && index < 2) {
          bubble.textContent = index === 0 ? "Hello from the village!" : "What a lovely surprise!";
          actor.element.classList.add("chatting");
          setTimeout(() => actor.element.classList.remove("chatting"), 3600);
        }
        actor.nextMoveAt = Date.now() + 4200;
      }, index * 90);
    });
  }

  holdInteractiveActor(actorId) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    const computed = getComputedStyle(actor.element);
    const left = computed.left;
    const top = computed.top;
    actor.element.style.transitionDuration = "0s, 0s, .5s, .8s, 0s";
    actor.element.style.left = left;
    actor.element.style.top = top;
    actor.arriveAt = 0;
    actor.arrivalState = "";
    actor.nextMoveAt = Number.POSITIVE_INFINITY;
    this.setActorState(actor, "looking");
  }

  releaseInteractiveActor(actorId) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.nextMoveAt = Date.now() + 650;
  }

  positionActor(actor, point) {
    const projected = actor.definition.flying
      ? { x: Number(point.x) + actor.offset.x, y: Number(point.y) + actor.offset.y }
      : projectActorPoint(point, actor.definition.island, this.sceneMode, actor.offset);
    actor.element.style.left = `${projected.x}%`;
    actor.element.style.top = `${projected.y}%`;
    actor.element.style.setProperty("--depth-scale", String(.72 + projected.y * .006));
  }

  moveTo(actor, targetIndex, arrivalState = "idle", pauseMs = 5000) {
    const point = actor.route[clampIndex(targetIndex, actor.route.length)];
    const current = actor.route[actor.routeIndex];
    const distance = Math.hypot(point.x - current.x, point.y - current.y);
    const rate = movementRate(actor.definition);
    const durationMs = Math.max(2200, Math.min(actor.definition.flying ? 11_000 : 8200, distance * (actor.definition.flying ? 390 : 310) / rate));
    actor.routeIndex = clampIndex(targetIndex, actor.route.length);
    actor.element.style.transitionDuration = `${durationMs}ms, ${durationMs}ms, .5s, .8s, ${durationMs}ms`;
    actor.element.style.setProperty("--actor-facing", point.x >= current.x ? "1" : "-1");
    this.positionActor(actor, point);
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
      this.maybeStartConversation(actor, now);
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

      if (shouldAnimalRest({ definition: actor.definition, isDay: this.clock.isDay, weather: this.weather })) {
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

      const pauseScale = actor.definition.species === "capybara" ? 1.3 : 1;
      const arrivalState = actor.definition.species === "capybara" ? this.nextCapybaraAction(actor) : Math.random() < .34 ? "looking" : "idle";
      this.moveTo(actor, this.adjacentIndex(actor), arrivalState, randomBetween(3500, 8500) * pauseScale);
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
      bird.append(createCreatureArt(document, "gull", index % 3));
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
  setAtmosphere({ weather, season } = {}) {
    this.weather = weather || this.weather;
    this.season = ["spring", "summer", "autumn", "winter"].includes(season) ? season : this.season;
  }
  setCalm(value) { this.calm = Boolean(value); }
  setSceneMode(mode) {
    this.sceneMode = mode === "3d" ? "3d" : "2d";
    for (const actor of this.actors.values()) this.positionActor(actor, actor.route[actor.routeIndex]);
  }

  audibleSpecies(selectedIsland = null) {
    return [...this.actors.values()]
      .filter((actor) => !actor.inside && (actor.definition.island === "sky" || actor.definition.island === "village" || !selectedIsland || actor.definition.island === selectedIsland))
      .map((actor) => actor.definition.species);
  }

  destroy() {
    clearInterval(this.timer);
    clearTimeout(this.chatTimer);
    this.timer = null;
    this.initialized = false;
  }
}
