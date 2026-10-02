import background from '../assets/source/splash2/originals/background.webp?url';
import pylonLeft from '../assets/source/splash2/originals/pylon-left.webp?url';
import pylonRight from '../assets/source/splash2/originals/pylon-right.webp?url';
import firstRing from '../assets/source/splash2/originals/first-ring.webp?url';
import secondRing from '../assets/source/splash2/originals/second-ring.webp?url';
import mainFrame from '../assets/source/splash2/originals/main-frame.webp?url';
import logo from '../assets/source/splash2/originals/meat-proxy.webp?url';
import subtitleText from '../assets/source/splash2/originals/subtitle-text.webp?url';
import lgtm from '../assets/source/splash2/originals/lgtm.webp?url';
import version1 from '../assets/source/splash2/originals/dude-1.webp?url';
import version2 from '../assets/source/splash2/originals/dude-2.webp?url';
import type { Splash2LayerName, Splash2Portrait } from '$lib/components/splash/splash2-playback-config';

const portraits = { version1, version2 };
export function splash2ColorSources(portrait: Splash2Portrait): Record<Splash2LayerName, string> {
  return { background, pylonLeft, pylonRight, firstRing, secondRing, mainFrame, logo, subtitleText, lgtm, dude: portraits[portrait] };
}
