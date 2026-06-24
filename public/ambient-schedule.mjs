const minuteOfDay = (value) => ((Number(value) % 1440) + 1440) % 1440;

function minuteInRange(current, start, end) {
  const value = minuteOfDay(current);
  const from = minuteOfDay(start);
  const to = minuteOfDay(end);
  return from <= to ? value >= from && value < to : value >= from || value < to;
}

export function ambientSceneActive(scene, { season, currentMinutes, sunrise }) {
  if (!scene?.src) return false;
  if (Array.isArray(scene.seasons) && scene.seasons.length && !scene.seasons.includes(season)) return false;
  if (Number.isFinite(scene.startMinute) && Number.isFinite(scene.endMinute)) {
    return minuteInRange(currentMinutes, scene.startMinute, scene.endMinute);
  }
  if (Number.isFinite(scene.sunriseOffsetStart) && Number.isFinite(scene.sunriseOffsetEnd)) {
    return minuteInRange(currentMinutes, Number(sunrise) + scene.sunriseOffsetStart, Number(sunrise) + scene.sunriseOffsetEnd);
  }
  return false;
}

export function activeAmbientScenes(scenes, clock) {
  return Object.entries(scenes || {}).filter(([, scene]) => ambientSceneActive(scene, clock)).map(([key]) => key);
}
