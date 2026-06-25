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

test("the ocean motion mask keeps animation off islands and the bridge", async () => {
  const { pointIsOpenWater } = await import("../public/surface-motion.mjs");
  assert.equal(pointIsOpenWater(0.03, 0.04), true);
  assert.equal(pointIsOpenWater(0.5, 0.08), true);
  assert.equal(pointIsOpenWater(0.255, 0.615), false);
  assert.equal(pointIsOpenWater(0.745, 0.6), false);
  assert.equal(pointIsOpenWater(0.49, 0.5), true);
  assert.equal(pointIsOpenWater(0.5, 0.55), false);
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
