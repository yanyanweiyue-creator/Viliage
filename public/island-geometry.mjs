export const LAND_POLYGONS = Object.freeze({
  autism: Object.freeze([
    [3.8, 52.4], [5.8, 42.8], [9.8, 34.2], [14.2, 27.8],
    [21.8, 23.0], [29.0, 22.6], [35.4, 28.2], [39.8, 38.4],
    [43.8, 50.8], [47.0, 64.0], [44.0, 75.0], [36.8, 82.4],
    [26.2, 85.4], [16.4, 82.8], [8.6, 74.8], [4.6, 64.4]
  ]),
  adhd: Object.freeze([
    [49.2, 58.2], [51.2, 46.8], [57.0, 34.0], [64.0, 26.0],
    [75.2, 22.8], [87.0, 24.8], [94.0, 38.6], [98.8, 55.0],
    [97.8, 70.0], [91.0, 81.0], [80.8, 86.6], [69.2, 85.8],
    [58.6, 80.0], [51.4, 70.4]
  ]),
  bridge: Object.freeze([
    [42.8, 55.0], [46.0, 52.4], [52.2, 52.4], [56.2, 55.0],
    [54.6, 60.8], [48.8, 61.2], [43.2, 58.8]
  ])
});

export function pointInPolygon(point, polygon) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Array.isArray(polygon)) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointIsLand(point, island) {
  if (island && LAND_POLYGONS[island]) return pointInPolygon(point, LAND_POLYGONS[island]);
  return pointInPolygon(point, LAND_POLYGONS.autism) || pointInPolygon(point, LAND_POLYGONS.adhd);
}

export function pointIsWalkable(point) {
  return pointIsLand(point) || pointInPolygon(point, LAND_POLYGONS.bridge);
}

export function cssPolygon(points) {
  return `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;
}
