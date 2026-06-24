import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { environmentPalette, waterWaveHeight } from "../public/immersive-scene.mjs";

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
