import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  stableDailyChance,
  minuteInWindow,
  shouldShowDragon,
  shouldLaunchSunsetFlock,
  nextLivestockAction,
  routeIsConfined,
  shouldAnimalRest,
  villagerRouteIsWalkable
} from "../public/ecosystem-logic.mjs";
import { projectActorPoint } from "../public/ecosystem-runtime.mjs";

test("land actors project safely inside their island in both scene modes", () => {
  const islands = {
    autism: { "2d": { x: 25, y: 52, rx: 22.5, ry: 30.5 }, "3d": { x: 25.5, y: 61.5, rx: 19.6, ry: 25.2 } },
    adhd: { "2d": { x: 75, y: 51, rx: 23, ry: 31 }, "3d": { x: 74.5, y: 60, rx: 19.6, ry: 25.2 } }
  };
  for (const island of Object.keys(islands)) {
    for (const mode of ["2d", "3d"]) {
      const projected = projectActorPoint({ x: island === "autism" ? -20 : 130, y: -40 }, island, mode, { x: .2, y: -.1 });
      const bounds = islands[island][mode];
      const normalized = ((projected.x - bounds.x) / bounds.rx) ** 2 + ((projected.y - bounds.y) / bounds.ry) ** 2;
      assert.ok(normalized < 1, `${island} ${mode} actor must stay inside land`);
    }
  }
});

test("stableDailyChance is deterministic, date-sensitive, and honors probability boundaries", () => {
  const first = stableDailyChance("dragon:37.3,-122.0", "2026-06-23", 0.42);
  assert.equal(stableDailyChance("dragon:37.3,-122.0", "2026-06-23", 0.42), first);
  assert.equal(stableDailyChance("dragon", "2026-06-23", 0), false);
  assert.equal(stableDailyChance("dragon", "2026-06-23", 1), true);

  const week = Array.from({ length: 7 }, (_, index) => stableDailyChance("dragon", `2026-06-${23 + index}`, 0.5));
  assert.ok(new Set(week).size > 1, "the local date must contribute to the daily sample");
});

test("minuteInWindow handles ordinary and wrap-around local-time windows", () => {
  assert.equal(minuteInWindow(360, 340, 400), true);
  assert.equal(minuteInWindow(401, 340, 400), false);
  assert.equal(minuteInWindow(1435, 1420, 20), true);
  assert.equal(minuteInWindow(10, 1420, 20), true);
  assert.equal(minuteInWindow(100, 1420, 20), false);
  assert.equal(minuteInWindow(-5, 1420, 20), true);
});

test("dragon eligibility is dawn-only, stable for the date, and once per date", () => {
  const base = { sunrise: 360, dateKey: "2026-06-23", seed: "test-place", probability: 1 };
  assert.equal(shouldShowDragon({ ...base, minute: 340 }), true);
  assert.equal(shouldShowDragon({ ...base, minute: 400 }), true);
  assert.equal(shouldShowDragon({ ...base, minute: 401 }), false);
  assert.equal(shouldShowDragon({ ...base, minute: 360, lastShownDate: base.dateKey }), false);
  assert.equal(shouldShowDragon({ ...base, minute: 360, weather: "storm" }), false);

  const midnightDawn = { sunrise: 10, dateKey: "2026-06-24", probability: 1 };
  assert.equal(shouldShowDragon({ ...midnightDawn, minute: 1435 }), true);
});

test("sunset flock launches only in its sunset window and once per local date", () => {
  const base = { sunset: 1200, dateKey: "2026-06-23" };
  assert.equal(shouldLaunchSunsetFlock({ ...base, minute: 1192 }), true);
  assert.equal(shouldLaunchSunsetFlock({ ...base, minute: 1206 }), true);
  assert.equal(shouldLaunchSunsetFlock({ ...base, minute: 1191 }), false);
  assert.equal(shouldLaunchSunsetFlock({ ...base, minute: 1200, lastLaunchDate: base.dateKey }), false);
});

test("livestock drink every ten minutes, graze every five, with drink priority", () => {
  const minute = 60_000;
  assert.equal(nextLivestockAction({ now: 4 * minute, lastGrazeAt: 0, lastDrinkAt: 0 }), null);
  assert.equal(nextLivestockAction({ now: 5 * minute, lastGrazeAt: 0, lastDrinkAt: 0 }), "graze");
  assert.equal(nextLivestockAction({ now: 10 * minute, lastGrazeAt: 0, lastDrinkAt: 0 }), "drink");
  assert.equal(nextLivestockAction({ now: 12 * minute, lastGrazeAt: 7 * minute, lastDrinkAt: 3 * minute }), "graze");
  assert.equal(nextLivestockAction({ now: 20 * minute, lastGrazeAt: null, lastDrinkAt: null }), null);
  assert.equal(nextLivestockAction({ now: 10 * minute, nextGrazeAt: 5 * minute, nextDrinkAt: 10 * minute }), "drink");
});

test("animal activity follows weather and configured day-night behavior", () => {
  assert.equal(shouldAnimalRest({ definition: { activePeriod: "day" }, isDay: false }), true);
  assert.equal(shouldAnimalRest({ definition: { activePeriod: "night" }, isDay: true }), true);
  assert.equal(shouldAnimalRest({ definition: { activePeriod: "night" }, isDay: false }), false);
  assert.equal(shouldAnimalRest({ definition: { flying: true }, isDay: false }), true);
  assert.equal(shouldAnimalRest({ definition: { activePeriod: "day" }, isDay: true, weather: "storm" }), true);
  assert.equal(shouldAnimalRest({ definition: { villager: true }, isDay: false, weather: "storm" }), false);
});

test("event helpers accept the runtime controller field names", () => {
  assert.equal(shouldShowDragon({
    date: "2026-06-23", currentMinutes: 360, sunrise: 360,
    probability: 1, alreadyShown: false, beforeMinutes: 20, afterMinutes: 40
  }), true);
  assert.equal(shouldLaunchSunsetFlock({
    date: "2026-06-23", currentMinutes: 1200, sunset: 1200,
    alreadyShown: false, beforeMinutes: 8, afterMinutes: 6
  }), true);
});

test("routeIsConfined rejects mixed-island and invalid routes", () => {
  const autismRoute = {
    island: "autism",
    points: [{ x: 11, y: 57 }, { x: 22, y: 64 }, { x: 31, y: 69 }]
  };
  assert.equal(routeIsConfined(autismRoute, "autism"), true);
  assert.equal(routeIsConfined(autismRoute, "adhd"), false);
  assert.equal(routeIsConfined({ ...autismRoute, points: [...autismRoute.points, { x: 60, y: 60, island: "adhd" }] }, "autism"), false);
  assert.equal(routeIsConfined({ island: "autism", points: [{ x: 101, y: 50 }] }, "autism"), false);
  assert.equal(routeIsConfined({ island: "autism", points: [] }, "autism"), false);

  assert.equal(routeIsConfined([{ x: 60, y: 55, island: "adhd" }, { x: 72, y: 64, island: "adhd" }], "adhd"), true);
  assert.equal(routeIsConfined([{ x: 60, y: 55, island: "adhd" }, { x: 30, y: 60, island: "autism" }], "adhd"), false);
});

test("every configured land animal is bound to a route on its own island", async () => {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const ecosystem = context.window.CAPY_CONFIG.ecosystem;
  for (const animal of ecosystem.animals.filter((item) => ["autism", "adhd"].includes(item.island))) {
    assert.equal(
      routeIsConfined({ island: animal.island, points: ecosystem.routes[animal.route] }, animal.island),
      true,
      `${animal.id} must stay on ${animal.island}`
    );
  }
});

test("configured livestock targets stay on their island and villagers sleep in buildings", async () => {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const ecosystem = context.window.CAPY_CONFIG.ecosystem;
  for (const animal of ecosystem.animals.filter((item) => item.livestock)) {
    const route = ecosystem.routes[animal.route];
    assert.ok(route[animal.grazePoint], `${animal.id} needs a grazing point`);
    assert.ok(route[animal.waterPoint], `${animal.id} needs a pond-edge point`);
  }
  for (const villager of ecosystem.animals.filter((item) => item.villager)) {
    assert.ok(ecosystem.routes[villager.route][villager.home]?.building, `${villager.id} must enter a building at night`);
    assert.equal(villagerRouteIsWalkable(ecosystem.routes[villager.route]), true, `${villager.id} must remain on land or the bridge`);
  }
});

test("villager route validation rejects shortcuts across open water", () => {
  assert.equal(villagerRouteIsWalkable([{ x: 38, y: 59 }, { x: 44, y: 57 }, { x: 50, y: 55 }, { x: 56, y: 58 }, { x: 62, y: 58 }]), true);
  assert.equal(villagerRouteIsWalkable([{ x: 20, y: 65 }, { x: 75, y: 70 }]), false);
  assert.equal(villagerRouteIsWalkable([{ x: 20, y: 50 }]), false);
});
