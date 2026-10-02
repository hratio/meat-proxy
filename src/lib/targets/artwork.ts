import bladeRunner from './blade-runner.json';
import nuclearReactor from './nuclear-reactor.json';
import rune from './rune.json';
import type { TargetArtworkId } from './config';

const edges = (points: number[][]) => points.map(([x, y], i) => {
  const [nextX, nextY] = points[(i + 1) % points.length];
  return { x, y, length: Math.hypot(nextX - x, nextY - y), angle: Math.atan2(nextY - y, nextX - x) * 180 / Math.PI };
});

function createArtwork(artwork: typeof rune) {
  return {
    ...artwork,
    edges: edges(artwork.outline),
    carvingEdges: edges(artwork.carving),
    check: `M${artwork.carving.map(point => point.join(' ')).join(' ')}Z`
  };
}

// Geometry and masks come from the same authored alpha, including the check hole.
const artworks = {
  'blade-runner': createArtwork(bladeRunner),
  'nuclear-reactor': createArtwork(nuclearReactor),
  rune: createArtwork(rune)
};
export const getTargetArtwork = (id: TargetArtworkId) => artworks[id];
