import background from './assets/splash2/background.webp';
import pylonLeft from './assets/splash2/pylon-left.webp';
import pylonRight from './assets/splash2/pylon-right.webp';
import firstRing from './assets/splash2/first-ring.webp';
import secondRing from './assets/splash2/second-ring.webp';
import mainFrame from './assets/splash2/main-frame.webp';
import logo from './assets/splash2/meat-proxy.webp';
import subtitleText from './assets/splash2/subtitle-text.webp';
import lgtm from './assets/splash2/lgtm.webp';
import version1 from './assets/splash2/dude-1.webp';
import version2 from './assets/splash2/dude-2.webp';
import type { Splash2LayerName, Splash2Portrait } from './splash2-playback-config';

export const splash2Portraits: Record<Splash2Portrait, { src: string; label: string; width: number; height: number }> = {
  version1: { src: version1, label: 'Version 1', width: 1536, height: 1024 },
  version2: { src: version2, label: 'Version 2', width: 1536, height: 1024 }
};

// Complementary clips retain the original pixels. Each logical ring has one
// timeline cue and two paint passes, with its rear arc behind the pylons.
const ringDividers = {
  firstRing: [[0, 55], [4, 50], [41, 51], [45, 50.4], [55.5, 50.4], [59, 51], [96, 50], [100, 55]],
  secondRing: [[0, 55], [4, 48], [41, 46], [45.3, 38], [54.7, 38], [59, 46], [96, 48], [100, 55]]
};
export const splash2RingClips = Object.fromEntries(Object.entries(ringDividers).map(([name, divider]) => {
  const points = divider.map(([x, y]) => `${x}% ${y}%`);
  return [name, { front: `polygon(${points.join(', ')}, 100% 100%, 0% 100%)`, rear: `polygon(0% 0%, 100% 0%, ${points.toReversed().join(', ')})` }];
})) as Record<'firstRing' | 'secondRing', { front: string; rear: string }>;

export const splash2PaintLayers: { name: Splash2LayerName; section?: 'front' | 'rear' }[] = [
  { name: 'background' },
  { name: 'firstRing', section: 'rear' }, { name: 'secondRing', section: 'rear' },
  { name: 'pylonLeft' }, { name: 'pylonRight' },
  { name: 'firstRing', section: 'front' }, { name: 'secondRing', section: 'front' },
  { name: 'dude' }, { name: 'mainFrame' }, { name: 'logo' },
  { name: 'subtitleText' }, { name: 'lgtm' }
];
// Boxes are percentages of a 1536 × 1024 composition. Preserve the artist's
// transparent margins and aspect ratios; the editor applies offsets to these.
// The pylon and ring boxes follow FULL EXAMPLE POSITION, scaled into this canvas.
export const splash2Artwork: Record<Splash2LayerName, { src: string; label: string; color: string; left: number; top: number; width: number; pixelWidth: number; pixelHeight: number }> = {
  background: { src: background, label: 'Back 1', color: '#8e9d92', left: 0, top: 0, width: 100, pixelWidth: 1536, pixelHeight: 1024 },
  pylonLeft: { src: pylonLeft, label: 'Left pylon', color: '#a4aaa2', left: 10.35, top: 3.9, width: 61.33, pixelWidth: 1254, pixelHeight: 1254 },
  pylonRight: { src: pylonRight, label: 'Right pylon', color: '#a4aaa2', left: 29.66, top: 4.9, width: 60.4, pixelWidth: 1254, pixelHeight: 1254 },
  firstRing: { src: firstRing, label: 'First ring', color: '#bdac90', left: 23, top: 18, width: 54, pixelWidth: 1448, pixelHeight: 1086 },
  secondRing: { src: secondRing, label: 'Second ring', color: '#c45949', left: 23, top: 24, width: 54, pixelWidth: 1448, pixelHeight: 1086 },
  dude: { src: version1, label: 'Reviewer', color: '#bbab8a', left: 14, top: 8, width: 72, pixelWidth: 1536, pixelHeight: 1024 },
  mainFrame: { src: mainFrame, label: 'Main frame', color: '#a7a69a', left: 5, top: 48, width: 90, pixelWidth: 2172, pixelHeight: 724 },
  logo: { src: logo, label: 'Meat Proxy', color: '#ed965d', left: 9.5, top: 46, width: 81, pixelWidth: 2172, pixelHeight: 724 },
  subtitleText: { src: subtitleText, label: 'Hostile Review', color: '#c45949', left: 29.5, top: 62.1, width: 41, pixelWidth: 1672, pixelHeight: 941 },
  lgtm: { src: lgtm, label: 'LGTM', color: '#e04e35', left: 20, top: 61, width: 60, pixelWidth: 1930, pixelHeight: 815 }
};
