import test from "node:test";
import assert from "node:assert/strict";
import { celestialOrbit, moonPhaseForDate, moonPhaseName } from "../public/celestial-logic.mjs";

test("sun and moon follow an upper-screen quadratic orbit", () => {
  assert.deepEqual(celestialOrbit(0), { x: 8, y: 43 });
  assert.deepEqual(celestialOrbit(.5), { x: 50, y: 13 });
  assert.deepEqual(celestialOrbit(1), { x: 92, y: 43 });
  for (const progress of [0, .1, .25, .5, .75, .9, 1]) assert.ok(celestialOrbit(progress).y <= 43);
});

test("moon phase calculation is stable around a known new moon", () => {
  const newMoon = moonPhaseForDate(new Date("2000-01-06T18:14:00Z"));
  assert.ok(newMoon.phase < .00001);
  assert.ok(newMoon.illumination < .00001);
  assert.equal(moonPhaseName(newMoon.phase), "New moon");
  assert.equal(moonPhaseName(.25), "First quarter");
  assert.equal(moonPhaseName(.5), "Full moon");
  assert.equal(moonPhaseName(.75), "Last quarter");
});
