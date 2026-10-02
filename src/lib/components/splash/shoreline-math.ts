import type { LandscapeConfig } from './landscape-config';
import { seededRandom } from './landscape-math';

export const coastPeriod = 2400;

/** A shared, repeating ground profile keeps the shore and building feet aligned. */
export function createShoreProfile(seed: number, settings: LandscapeConfig['docks']) {
  const random = seededRandom(seed ^ 0x53a91f);
  const bands = new Map([7, 11, 17, 23, 41, 67].map(count =>
    [count, Array.from({ length: count }, () => random() * 2 - 1)] as const));
  function noise(x: number, count: number) {
    const values = bands.get(count)!;
    const at = ((x / coastPeriod % 1) + 1) % 1 * count;
    const index = Math.floor(at), t = at - index, blend = t * t * t * (t * (t * 6 - 15) + 10);
    return values[index] + (values[(index + 1) % count] - values[index]) * blend;
  }
  function coast(x: number) {
    return -143 + settings.coastVariation * (72 * noise(x, 7) + 28 * noise(x, 17) + 7 * noise(x, 41));
  }
  function height(x: number, z: number) {
    const inland = coast(x) - z;
    const edge = settings.quay ? 3.4+settings.quayHeight+settings.relief*.35*noise(x,11)
      : Math.max(.8, 2.4 + settings.relief * (3 + 3 * noise(x, 17) + 1.5 * noise(x, 41)));
    if (settings.quay && inland < 0) return -5+inland*.04;
    if (inland < 0) return edge + inland * (edge + 5) / 20;
    const hills = 6 + 3.5 * noise(x, 11) + 2 * Math.sin(z * .016 + noise(x, 7) * 2);
    return edge + settings.relief * (1 - Math.exp(-inland / 75)) * hills;
  }
  function front(x: number, width: number, depth: number, setback: number) {
    const samples = Math.max(2, Math.ceil(width / 8));
    let limit = Infinity;
    for (let i = 0; i <= samples; i++) limit = Math.min(limit, coast(x - width / 2 + width * i / samples));
    return limit - depth / 2 - setback;
  }
  function foundation(x: number, z: number, width: number, depth: number) {
    let level = Infinity;
    for (const u of [-.5, 0, .5]) for (const v of [-.5, 0, .5]) level = Math.min(level, height(x + u * width, z + v * depth));
    return level - .35;
  }
  return { coast, height, front, foundation, noise };
}
