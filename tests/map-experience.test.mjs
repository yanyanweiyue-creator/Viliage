import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadConfig() {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.CAPY_CONFIG;
}

test("approved PDF map raster and its single-island interaction shell are present", async () => {
  const [config, html, css] = await Promise.all([
    loadConfig(),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
  assert.equal(config.map.image, "/assets/village-map-approved.png");
  await access(new URL("../public/assets/village-map-approved.png", import.meta.url));
  assert.match(html, /id="island-transition"/);
  assert.match(html, /id="surface-motion"/);
  assert.match(html, /data-action="continue-guest"/);
  assert.match(html, /class="island-hit-area autism"/);
  assert.match(html, /class="island-hit-area adhd"/);
  assert.doesNotMatch(css, /\.map-hotspot::before/);
  assert.match(css, /\.island-hit-area[^}]*background:\s*transparent/);
  assert.match(css, /\.island-hit-area\.autism[^}]*clip-path:\s*polygon\(3\.8% 52\.4%/);
  assert.match(css, /\.island-hit-area\.adhd[^}]*clip-path:\s*polygon\(49\.2% 58\.2%/);
  assert.match(css, /\.island-label[^}]*display:\s*none/);
  assert.match(css, /body\.scene-3d \.island-label[^}]*display:\s*grid/);
  assert.match(css, /\.map-hotspot:hover[^}]*background:\s*transparent/);
  assert.match(html, /id="waffles-intro"/);
  assert.match(css, /island-transition\.active/);
  assert.match(css, /island-transition\.disperse/);
  assert.match(css, /map-stage\.focus-autism/);
  assert.match(css, /map-stage\.focus-adhd/);
});

test("single-island focus keeps the whole island in view", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  for (const island of ["autism", "adhd"]) {
    const rule = css.match(new RegExp(`\\.map-stage\\.focus-${island} \\{[^}]*transform:\\s*scale\\(([^)]+)\\) translate\\(([-0-9.]+)%`));
    assert.ok(rule, `${island} focus needs an explicit scale and translate`);
    assert.ok(Number(rule[1]) <= 1.35, `${island} focus should not crop the island`);
    assert.ok(Math.abs(Number(rule[2])) <= 16, `${island} focus should keep island edges visible`);
  }
});

test("the ocean motion mask keeps animation off islands and the bridge", async () => {
  const { normalizedStagePoint, pointIsOpenWater } = await import("../public/surface-motion.mjs");
  assert.equal(pointIsOpenWater(0.03, 0.04), true);
  assert.equal(pointIsOpenWater(0.5, 0.08), true);
  assert.equal(pointIsOpenWater(0.255, 0.615), false);
  assert.equal(pointIsOpenWater(0.745, 0.6), false);
  assert.equal(pointIsOpenWater(0.49, 0.5), true);
  assert.equal(pointIsOpenWater(0.5, 0.55), false);

  const transformedStage = {
    clientWidth: 1000,
    clientHeight: 500,
    getBoundingClientRect: () => ({ left: 100, top: 80, width: 1280, height: 640 })
  };
  assert.deepEqual(normalizedStagePoint({ clientX: 740, clientY: 400 }, transformedStage), { x: .5, y: .5 });
});

test("each island exposes the five approved map destinations", async () => {
  const config = await loadConfig();
  const expected = new Map([
    ["Village", "support"],
    ["School", "ai"],
    ["Courthouse", "ai"],
    ["Park", "ai"],
    ["Woods", "activity"]
  ]);
  for (const island of ["autism", "adhd"]) {
    const buildings = config.buildings.filter((building) => building.island === island);
    assert.equal(buildings.length, 5);
    for (const [label, type] of expected) {
      const building = buildings.find((item) => item.mapLabel === label);
      assert.ok(building, `${island} needs a ${label} hotspot`);
      assert.equal(building.type, type);
      assert.ok(building.hitWidth <= 16.5, `${building.id} hotspot should stay close to the drawing`);
      assert.ok(Array.isArray(building.hitPolygon), `${building.id} needs an explicit hit polygon`);
    }
    assert.equal(buildings.find((item) => item.mapLabel === "School").topic, "Education");
    assert.equal(buildings.find((item) => item.mapLabel === "Courthouse").topic, "Legal");
    assert.equal(buildings.find((item) => item.mapLabel === "Park").topic, "Recreation");
    assert.equal(buildings.find((item) => item.mapLabel === "Woods").topic, undefined);
  }
});

test("2D buildings stay directly clickable above island hit areas", async () => {
  const [config, css, app, surface] = await Promise.all([
    loadConfig(),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/surface-motion.mjs", import.meta.url), "utf8")
  ]);
  const autismSupport = config.buildings.find((building) => building.id === "autism-support");
  assert.ok(autismSupport.hitWidth >= 15, "Autism Village support hotspot should cover the visible building group");
  assert.ok(autismSupport.hitHeight >= 12, "Autism Village support hotspot should be easy to click");
  assert.match(css, /\.map-stage:not\(\.focus-autism\):not\(\.focus-adhd\) \.building[^}]*pointer-events:\s*auto/);
  assert.ok(app.indexOf("const building = event.target.closest(\"[data-building]\");") < app.indexOf("const islandButton = event.target.closest(\"[data-island]:not(.building)\");"));
  assert.match(surface, /closest\?\.\("\.island-hit-area, \.building, \.map-hotspot"\)/);
});
