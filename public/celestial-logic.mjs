const SYNODIC_MONTH_DAYS = 29.53058867;
const DAY_MS = 86_400_000;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0);

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

/** Track the 2D celestial body's geometric center along the high sky arc. */
export function celestialOrbit(progress) {
  const normalized = clamp(progress);
  const arc = 4 * normalized * (1 - normalized);
  return {
    x: -3 + normalized * 106,
    y: 7 - arc * 5 + normalized * 1.5
  };
}

export function moonPhaseForDate(date = new Date()) {
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const ageDays = ((timestamp - KNOWN_NEW_MOON) / DAY_MS % SYNODIC_MONTH_DAYS + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  const phase = ageDays / SYNODIC_MONTH_DAYS;
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  return { phase, ageDays, illumination };
}

export function moonPhaseName(phase) {
  const value = ((Number(phase) % 1) + 1) % 1;
  if (value < .035 || value >= .965) return "New moon";
  if (value < .215) return "Waxing crescent";
  if (value < .285) return "First quarter";
  if (value < .465) return "Waxing gibbous";
  if (value < .535) return "Full moon";
  if (value < .715) return "Waning gibbous";
  if (value < .785) return "Last quarter";
  return "Waning crescent";
}
