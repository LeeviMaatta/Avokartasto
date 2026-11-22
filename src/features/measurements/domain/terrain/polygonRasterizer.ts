import type { TerrainGrid } from "./terrainTypes";

interface RingBounds {
  ring: [number, number][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function pointsClose(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;
}

/** Yhdistää OSM-multipolygonin peräkkäisistä way-segmenteistä suljetut renkaat. */
export function assembleMultipolygonRings(segments: [number, number][][]): [number, number][][] {
  const closed: [number, number][][] = [];
  const open = segments.filter((seg) => seg.length >= 2).map((seg) => [...seg]);

  const remaining: [number, number][][] = [];
  for (const seg of open) {
    if (seg.length >= 4 && pointsClose(seg[0], seg[seg.length - 1])) {
      closed.push(seg);
    } else {
      remaining.push(seg);
    }
  }

  while (remaining.length > 0) {
    const current = remaining.shift()!;
    let merged = true;
    while (merged && !pointsClose(current[0], current[current.length - 1])) {
      merged = false;
      const tail = current[current.length - 1];
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (pointsClose(tail, candidate[0])) {
          current.push(...candidate.slice(1));
          remaining.splice(i, 1);
          merged = true;
          break;
        }
        if (pointsClose(tail, candidate[candidate.length - 1])) {
          const rev = [...candidate].reverse();
          current.push(...rev.slice(1));
          remaining.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
    if (current.length >= 3) {
      if (!pointsClose(current[0], current[current.length - 1])) {
        current.push(current[0]);
      }
      closed.push(current);
    }
  }
  return closed;
}

function measureRingBounds(ring: [number, number][]): RingBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const x = ring[i][0];
    const y = ring[i][1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { ring, minX, minY, maxX, maxY };
}

function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonWithHoles(
  x: number,
  y: number,
  outer: [number, number][],
  relevantInners: RingBounds[],
): boolean {
  if (!pointInRing(x, y, outer)) return false;
  for (let k = 0; k < relevantInners.length; k++) {
    const inner = relevantInners[k];
    if (
      x >= inner.minX && x <= inner.maxX &&
      y >= inner.minY && y <= inner.maxY &&
      pointInRing(x, y, inner.ring)
    ) {
      return false;
    }
  }
  return true;
}

export function rasterizePolygonWithHoles(
  grid: TerrainGrid,
  outerRings: [number, number][][],
  innerRings: [number, number][][],
  flag: number,
): void {
  if (outerRings.length === 0) return;

  const innerBounds: RingBounds[] = innerRings
    .filter((ring) => ring.length >= 3)
    .map(measureRingBounds);
  const subDx = grid.stepX * 0.35;
  const subDy = grid.stepY * 0.35;
  const edgeStep = Math.min(grid.stepX, grid.stepY) * 0.25;

  for (const outer of outerRings) {
    if (outer.length < 3) continue;
    const outerBbox = measureRingBounds(outer);
    const gx0 = Math.max(0, Math.floor((outerBbox.minX - grid.minX) / grid.stepX));
    const gx1 = Math.min(grid.width - 1, Math.ceil((outerBbox.maxX - grid.minX) / grid.stepX));
    const gy0 = Math.max(0, Math.floor((outerBbox.minY - grid.minY) / grid.stepY));
    const gy1 = Math.min(grid.height - 1, Math.ceil((outerBbox.maxY - grid.minY) / grid.stepY));
    if (gx1 < gx0 || gy1 < gy0) continue;

    // Esisuodatetaan vain tämän ulkorenkaan bboxin kanssa leikkaavat sisäsaarekkeet
    const relevantInners = innerBounds.filter(
      (inner) =>
        inner.maxX >= outerBbox.minX && inner.minX <= outerBbox.maxX &&
        inner.maxY >= outerBbox.minY && inner.minY <= outerBbox.maxY,
    );

    for (let gy = gy0; gy <= gy1; gy++) {
      const py = grid.minY + gy * grid.stepY;
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = grid.minX + gx * grid.stepX;
        const hit =
          pointInPolygonWithHoles(px, py, outer, relevantInners) ||
          pointInPolygonWithHoles(px - subDx, py - subDy, outer, relevantInners) ||
          pointInPolygonWithHoles(px + subDx, py - subDy, outer, relevantInners) ||
          pointInPolygonWithHoles(px - subDx, py + subDy, outer, relevantInners) ||
          pointInPolygonWithHoles(px + subDx, py + subDy, outer, relevantInners);
        if (hit) {
          grid.terrainFlags[gy * grid.width + gx] |= flag;
        }
      }
    }

    // Käydään myös ulkoreunan segmentit läpi, jotta kapeat lahdelmat/salmet eivät jää ruudun keskipisteiden väliin
    for (let i = 1; i < outer.length; i++) {
      const [x0, y0] = outer[i - 1];
      const [x1, y1] = outer[i];
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const samples = Math.max(1, Math.ceil(dist / edgeStep));
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const sx = x0 + (x1 - x0) * t;
        const sy = y0 + (y1 - y0) * t;
        const gx = Math.round((sx - grid.minX) / grid.stepX);
        const gy = Math.round((sy - grid.minY) / grid.stepY);
        if (gx < 0 || gx >= grid.width || gy < 0 || gy >= grid.height) continue;
        let inHole = false;
        for (let k = 0; k < relevantInners.length; k++) {
          const inner = relevantInners[k];
          if (
            sx >= inner.minX && sx <= inner.maxX &&
            sy >= inner.minY && sy <= inner.maxY &&
            pointInRing(sx, sy, inner.ring)
          ) {
            inHole = true;
            break;
          }
        }
        if (!inHole) {
          grid.terrainFlags[gy * grid.width + gx] |= flag;
        }
      }
    }
  }
}

export function rasterizePolyline(grid: TerrainGrid, coords: [number, number][], flag: number): void {
  const step = Math.min(grid.stepX, grid.stepY) * 0.25;
  let prevGx: number | null = null;
  let prevGy: number | null = null;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const samples = Math.max(1, Math.ceil(dist / step));
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const gx = Math.round((x0 + (x1 - x0) * t - grid.minX) / grid.stepX);
      const gy = Math.round((y0 + (y1 - y0) * t - grid.minY) / grid.stepY);
      if (gx >= 0 && gx < grid.width && gy >= 0 && gy < grid.height) {
        grid.terrainFlags[gy * grid.width + gx] |= flag;
      }
      if (prevGx !== null && prevGy !== null && gx !== prevGx && gy !== prevGy) {
        if (gx >= 0 && gx < grid.width && prevGy >= 0 && prevGy < grid.height) {
          grid.terrainFlags[prevGy * grid.width + gx] |= flag;
        }
      }
      prevGx = gx;
      prevGy = gy;
    }
  }
}
