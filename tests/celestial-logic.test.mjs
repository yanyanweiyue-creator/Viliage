import test from "node:test";
import assert from "node:assert/strict";
import { celestialOrbit, moonPhaseForDate, moonPhaseName } from "../public/celestial-logic.mjs";

const approx = (actual, expected, tolerance = .0001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);

test("2D sun and moon centers follow the high drawn parabolic sky orbit", () => {
  assert.deepEqual(celestialOrbit(0), { x: -3, y: 7 });
  approx(celestialOrbit(.5).x, 50);
  approx(celestialOrbit(.5).y, 2.75);
  approx(celestialOrbit(1).x, 103);
  approx(celestialOrbit(1).y, 8.5);
  assert.ok(celestialOrbit(.25).y < celestialOrbit(0).y);
  assert.ok(celestialOrbit(.75).y < celestialOrbit(1).y);
  for (const progress of [0, .1, .25, .5, .75, .9, 1]) {
    assert.ok(celestialOrbit(progress).y >= 2.75);
    assert.ok(celestialOrbit(progress).y <= 8.5);
  }
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
