import test from "node:test";
import assert from "node:assert/strict";
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
