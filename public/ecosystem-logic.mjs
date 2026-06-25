import { pointIsLand, pointIsWalkable } from "./island-geometry.mjs?v=land-map-20260624";

const MINUTES_PER_DAY = 24 * 60;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeMinute(value) {
  const minute = finiteNumber(value);
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function stableHash(value) {
  // FNV-1a with Math.imul is identical in browsers and Node.
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  // Avalanche the bits so similar date strings do not cluster together.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Return one deterministic yes/no result for a seed, local date, and probability. */
export function stableDailyChance(seed, dateKey, probability = 0.12) {
  const threshold = Math.max(0, Math.min(1, finiteNumber(probability)));
  if (threshold === 0) return false;
  if (threshold === 1) return true;
  const sample = stableHash(`${String(seed)}\u001f${String(dateKey)}`) / 0x100000000;
  return sample < threshold;
}

/** Test a minute against an inclusive local-time window, including one crossing midnight. */
export function minuteInWindow(minute, startMinute, endMinute) {
  const current = normalizeMinute(minute);
  const start = normalizeMinute(startMinute);
  const end = normalizeMinute(endMinute);
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

/** Decide whether today's one-off dawn dragon flight should launch. */
export function shouldShowDragon({
  minute,
  currentMinutes,
  sunrise,
  dateKey,
  date,
  seed = "village-dragon",
  probability = 0.12,
  lastShownDate = null,
  alreadyShown = false,
  minutesBefore = 20,
  minutesAfter = 40,
  beforeMinutes,
  afterMinutes,
  weather = "clear"
} = {}) {
  const localDate = dateKey || date;
  const localMinute = minute ?? currentMinutes;
  const before = beforeMinutes ?? minutesBefore;
  const after = afterMinutes ?? minutesAfter;
  if (!localDate || alreadyShown || lastShownDate === localDate) return false;
  if (["storm", "snow"].includes(String(weather))) return false;
  const dawn = normalizeMinute(sunrise);
  const inDawnWindow = minuteInWindow(
    localMinute,
    dawn - Math.max(0, finiteNumber(before)),
    dawn + Math.max(0, finiteNumber(after))
  );
  return inDawnWindow && stableDailyChance(seed, localDate, probability);
}

/** Decide whether today's one-off sunset flock should launch. */
export function shouldLaunchSunsetFlock({
  minute,
  currentMinutes,
  sunset,
  dateKey,
  date,
  lastLaunchDate = null,
  alreadyShown = false,
  minutesBefore = 8,
  minutesAfter = 6,
  beforeMinutes,
  afterMinutes
} = {}) {
  const localDate = dateKey || date;
  const localMinute = minute ?? currentMinutes;
  const before = beforeMinutes ?? minutesBefore;
  const after = afterMinutes ?? minutesAfter;
  if (!localDate || alreadyShown || lastLaunchDate === localDate) return false;
  const dusk = normalizeMinute(sunset);
  return minuteInWindow(
    localMinute,
    dusk - Math.max(0, finiteNumber(before)),
    dusk + Math.max(0, finiteNumber(after))
  );
}

/**
 * Return "drink", "graze", or null for a livestock actor.
 * Timestamps and intervals are milliseconds. Drinking wins if both are due.
 */
export function nextLivestockAction({
  now,
  lastGrazeAt,
  lastDrinkAt,
  nextGrazeAt,
  nextDrinkAt,
  grazeEvery = FIVE_MINUTES_MS,
  drinkEvery = TEN_MINUTES_MS
} = {}) {
  const current = finiteNumber(now, Date.now());
  const scheduledDrink = nextDrinkAt != null && Number.isFinite(Number(nextDrinkAt));
  const scheduledGraze = nextGrazeAt != null && Number.isFinite(Number(nextGrazeAt));
  if (scheduledDrink && current >= Number(nextDrinkAt)) return "drink";
  if (scheduledGraze && current >= Number(nextGrazeAt)) return "graze";
  if (scheduledDrink || scheduledGraze) return null;
  const grazeInterval = Math.max(0, finiteNumber(grazeEvery, FIVE_MINUTES_MS));
  const drinkInterval = Math.max(0, finiteNumber(drinkEvery, TEN_MINUTES_MS));
  const hasGrazed = lastGrazeAt != null && Number.isFinite(Number(lastGrazeAt));
  const hasDrunk = lastDrinkAt != null && Number.isFinite(Number(lastDrinkAt));
  const drinkDue = hasDrunk && current - Number(lastDrinkAt) >= drinkInterval;
  const grazeDue = hasGrazed && current - Number(lastGrazeAt) >= grazeInterval;
  if (drinkDue) return "drink";
  if (grazeDue) return "graze";
  return null;
}

/** Keep configured animals in plausible activity windows and shelter weather. */
export function shouldAnimalRest({ definition = {}, isDay = true, weather = "clear" } = {}) {
  if (definition.villager) return false;
  if (!definition.flying && ["rain", "storm", "snow"].includes(String(weather))) return true;
  if (definition.flying && !isDay) return true;
  const activePeriod = String(definition.activePeriod || "always");
  if (activePeriod === "day" && !isDay) return true;
  if (activePeriod === "night" && isDay) return true;
  return false;
}

/**
 * Validate that a route is safe for one island.
 * A route is `{ island, points: [{ x, y, island? }, ...] }`; an array of points
 * is also accepted when every point declares its island.
 */
export function routeIsConfined(route, island) {
  if (!island || !route) return false;
  const points = Array.isArray(route) ? route : route.points;
  if (!Array.isArray(points) || points.length === 0) return false;
  if (!Array.isArray(route) && route.island !== island) return false;
  return points.every((point) => {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return false;
    if (Number(point.x) < 0 || Number(point.x) > 100 || Number(point.y) < 0 || Number(point.y) > 100) return false;
    if (!pointIsLand({ x: Number(point.x), y: Number(point.y) }, island)) return false;
    return Array.isArray(route) ? point.island === island : point.island == null || point.island === island;
  });
}

/** Sample every route segment so a villager cannot cut across open water. */
export function villagerRouteIsWalkable(points = []) {
  if (!Array.isArray(points) || points.length < 2) return false;
  const onWalkableSurface = ({ x, y }) => pointIsWalkable({ x, y });

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    for (let step = 0; step <= 24; step += 1) {
      const progress = step / 24;
      if (!onWalkableSurface({
        x: Number(from.x) + (Number(to.x) - Number(from.x)) * progress,
        y: Number(from.y) + (Number(to.y) - Number(from.y)) * progress
      })) return false;
    }
  }
  return true;
}
