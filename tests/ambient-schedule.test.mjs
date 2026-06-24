import test from "node:test";
import assert from "node:assert/strict";
import { activeAmbientScenes, ambientSceneActive } from "../public/ambient-schedule.mjs";

const summerInsects = { src: "/summer.mp3", seasons: ["summer"], startMinute: 600, endMinute: 960 };
const sunriseFarm = { src: "/farm.mp3", sunriseOffsetStart: -15, sunriseOffsetEnd: 45 };

test("summer insect ambience runs only from 10:00 through 15:59 in local summer", () => {
  assert.equal(ambientSceneActive(summerInsects, { season: "summer", currentMinutes: 600, sunrise: 360 }), true);
  assert.equal(ambientSceneActive(summerInsects, { season: "summer", currentMinutes: 959, sunrise: 360 }), true);
  assert.equal(ambientSceneActive(summerInsects, { season: "summer", currentMinutes: 960, sunrise: 360 }), false);
  assert.equal(ambientSceneActive(summerInsects, { season: "winter", currentMinutes: 720, sunrise: 360 }), false);
});

test("farm ambience is limited to the local sunrise window", () => {
  assert.equal(ambientSceneActive(sunriseFarm, { season: "summer", currentMinutes: 345, sunrise: 360 }), true);
  assert.equal(ambientSceneActive(sunriseFarm, { season: "summer", currentMinutes: 404, sunrise: 360 }), true);
  assert.equal(ambientSceneActive(sunriseFarm, { season: "summer", currentMinutes: 405, sunrise: 360 }), false);
});

test("active ambience can layer sunrise and summer scenes when their windows overlap", () => {
  const scenes = { summerInsects, sunriseFarm };
  assert.deepEqual(activeAmbientScenes(scenes, { season: "summer", currentMinutes: 605, sunrise: 600 }), ["summerInsects", "sunriseFarm"]);
});
