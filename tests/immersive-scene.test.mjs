import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { celestialTrackPoint, environmentPalette, waterSurfaceState, waterWaveHeight } from "../public/immersive-scene.mjs";

test("3D environment palettes react to weather, season, and day state", () => {
  const clear = environmentPalette({ isDay: true, weather: "clear", season: "summer" });
  const storm = environmentPalette({ isDay: true, weather: "storm", season: "summer" });
  const night = environmentPalette({ isDay: false, weather: "clear", season: "summer" });
  const autumn = environmentPalette({ isDay: true, weather: "clear", season: "autumn" });
  assert.notEqual(clear.skyTop, storm.skyTop);
  assert.notEqual(clear.skyTop, night.skyTop);
  assert.notEqual(clear.leaf, autumn.leaf);
  assert.notEqual(clear.waterBottom, night.waterBottom);
});

test("water surface is deterministic at one instant and changes over time", () => {
  const first = waterWaveHeight(320, 180, 1000);
  assert.equal(waterWaveHeight(320, 180, 1000), first);
  assert.notEqual(waterWaveHeight(320, 180, 2200), first);
  assert.ok(Number.isFinite(first));
});

test("water can switch between mirror calm and whitecap states", () => {
  const calm = waterSurfaceState({ weather: "clear", windSpeed: 1, isDay: true }, 0);
  const rough = waterSurfaceState({ weather: "storm", windSpeed: 30, isDay: true }, 0);
  assert.equal(calm.mode, "mirror");
  assert.ok(calm.mirror > calm.foam);
  assert.equal(rough.mode, "whitecaps");
  assert.ok(rough.foam > rough.mirror);
  assert.ok(rough.wave > calm.wave);
});

test("3D celestial track rises through the day and moves horizontally", () => {
  const sunrise = celestialTrackPoint({ currentMinutes: 360, sunrise: 360, sunset: 1080 }, 100, 100);
  const noon = celestialTrackPoint({ currentMinutes: 720, sunrise: 360, sunset: 1080 }, 100, 100);
  const sunset = celestialTrackPoint({ currentMinutes: 1080, sunrise: 360, sunset: 1080 }, 100, 100);
  assert.ok(sunrise.x < noon.x);
  assert.ok(noon.x < sunset.x);
  assert.ok(noon.y < sunrise.y);
  assert.ok(noon.y < sunset.y);
  assert.equal(sunrise.y, 31);
  assert.equal(noon.y, 13);
  assert.equal(sunset.y, 31);
});

test("3D buildings render dedicated night lighting", async () => {
  const source = await readFile(new URL("../public/immersive-scene.mjs", import.meta.url), "utf8");
  assert.match(source, /drawLitWindow/);
  assert.match(source, /isNight/);
  assert.match(source, /rgba\(255,218,112/);
});

test("every 3D building center is grounded inside its own island", async () => {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const islands = {
    autism: { x: 25.5, y: 61.5, rx: 21.8, ry: 30.2 },
    adhd: { x: 74.5, y: 60, rx: 21.8, ry: 30.2 }
  };
  for (const building of context.window.CAPY_CONFIG.buildings) {
    const island = islands[building.island];
    assert.ok(Number.isFinite(building.x3d) && Number.isFinite(building.y3d), `${building.id} needs a 3D ground position`);
    const normalized = ((building.x3d - island.x) / island.rx) ** 2 + ((building.y3d - island.y) / island.ry) ** 2;
    assert.ok(normalized <= .78, `${building.id} must sit within the visible ${building.island} land area`);
  }
});

test("settings use a dedicated header icon, avatar opens My Record, and no settings building remains", async () => {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  assert.equal(context.window.CAPY_CONFIG.buildings.some((building) => building.type === "settings"), false);
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /settings-icon-button" data-action="open-settings"/);
  assert.match(html, /avatar-button" data-action="open-profile"/);
});
