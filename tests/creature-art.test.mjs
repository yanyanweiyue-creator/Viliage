import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { creatureSpecies, getCreatureMarkup } from "../public/creature-art.mjs";

const emojiRange = /[\u{1F300}-\u{1FAFF}]/u;

test("every configured ecosystem species has original SVG artwork", async () => {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const ecosystem = context.window.CAPY_CONFIG.ecosystem;
  const configuredSpecies = new Set([...ecosystem.animals.map((animal) => animal.species), "dragon"]);

  for (const species of configuredSpecies) {
    assert.ok(creatureSpecies.includes(species), `${species} needs an SVG illustration`);
    const markup = getCreatureMarkup(species);
    assert.match(markup, /^\s*<svg/);
    assert.equal(emojiRange.test(markup), false, `${species} artwork must not contain emoji`);
  }
});

test("creature artwork avoids animated raster noise filters", () => {
  for (const species of creatureSpecies) {
    const markup = getCreatureMarkup(species);
    assert.doesNotMatch(markup, /feTurbulence|fractalNoise|model-surface/i, `${species} should not render mosaic-like SVG texture noise`);
  }
});

test("ecosystem configuration no longer stores emoji glyphs", async () => {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const ecosystem = context.window.CAPY_CONFIG.ecosystem;
  assert.equal(ecosystem.animals.some((animal) => "emoji" in animal), false);
  assert.equal("emoji" in ecosystem.events.dragon, false);
});
