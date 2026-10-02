export type PortraitSignalPhase = 'off' | 'live' | 'connecting' | 'disconnecting';
export type PortraitSignalFrame = {
  time: number;
  breakup: number;
  visibility: number;
  framed: boolean;
  moving: boolean;
};

/** The link has its own clock: head-motion speed must not change the receiver. */
export function portraitSignalFrame(phase: PortraitSignalPhase, time: number, elapsed: number, durationMs: number, framed: boolean, reduced: boolean): PortraitSignalFrame | undefined {
  if (phase === 'off') return;
  let breakup = 0, visibility = 1;
  if (!reduced) {
    const duration = Math.max(1, durationMs);
    if (phase === 'connecting') {
      const progress = Math.min(1, elapsed / Math.min(380, duration));
      breakup = (1 - progress) ** 2;
      visibility = Math.min(1, progress * 2.5);
    } else if (phase === 'disconnecting') {
      const tail = Math.min(260, duration);
      const progress = Math.max(0, Math.min(1, (elapsed - duration + tail) / tail));
      breakup = progress ** 1.5;
      visibility = 1 - progress ** 3;
    }
  }
  return { time: reduced ? 0 : time, breakup, visibility, framed, moving: !reduced };
}

// Runs inside the existing color-grade pass. All scene taps are premultiplied;
// distortion carries alpha with the image, including smoke and transparent edges.
export const portraitSignalShader = /* glsl */ `
  uniform float signalEnabled, signalTime, signalBreakup, signalVisibility, signalFramed, signalMoving;
  uniform vec2 signalSize;

  float signalHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  vec4 signalTap(vec2 uv) {
    vec2 inside = step(vec2(0.), uv) * step(uv, vec2(1.));
    return texture2D(tDiffuse, clamp(uv, 0., 1.)) * inside.x * inside.y;
  }
  float signalFault() {
    float cycle = mod(signalTime + 1.3, 3.8);
    float burst = 1. - smoothstep(.09, .32, cycle);
    return clamp(signalBreakup + burst * mix(.32, .8, 1. - signalFramed) * signalMoving, 0., 1.);
  }
  vec4 signalSource(vec2 uv) {
    if (signalEnabled < .5) return texture2D(tDiffuse, uv);
    vec2 p = uv * 2. - 1.;
    uv += p * dot(p, p) * .006 * signalFramed;
    float tick = floor(signalTime * 18.);
    float row = floor(uv.y * signalSize.y / 3.);
    float fault = signalFault(), broadcast = 1. - signalFramed;
    float tear = step(.65, signalHash(vec2(row, tick))) * fault;
    float distanceToBand = abs(fract(uv.y + signalTime * .19 + .5) - .5);
    float band = (1. - smoothstep(.025, .075, distanceToBand)) * signalMoving;
    float shift = sin(uv.y * 21. + signalTime * .9) * .35 * signalMoving;
    shift += (signalHash(vec2(row, tick + 7.)) - .5) * (tear * 22. + band * (2. + broadcast * 5.));
    uv.x += shift / signalSize.x;
    uv.y += (signalHash(vec2(tick, 19.)) - .5) * fault * .025;
    vec2 pixel = vec2(1. / signalSize.x, 0.);
    vec4 center = signalTap(uv);
    vec4 source = center * (.62 - fault * .1) + signalTap(uv - pixel * .7) * .16
      + signalTap(uv + pixel * .7) * .16 + signalTap(uv - pixel * (1.8 + fault * 6.)) * (.06 + fault * .1);
    float chroma = .4 + fault * 4.5 + band * broadcast;
    vec4 red = signalTap(uv + pixel * chroma), blue = signalTap(uv - pixel * chroma);
    source.r = mix(source.r, red.r / max(red.a, .001) * source.a, .3 + fault * .35);
    source.b = mix(source.b, blue.b / max(blue.a, .001) * source.a, .3 + fault * .35);
    return source;
  }
  vec4 signalDisplay(vec3 color, float alpha, vec2 uv) {
    if (signalEnabled < .5) return vec4(color * alpha, alpha);
    vec2 pixel = uv * signalSize;
    float tick = floor(signalTime * 14.);
    float grain = signalHash(floor(pixel * 1.4) + vec2(tick * 13., tick * 7.)) - .5;
    float lineNoise = signalHash(vec2(floor(pixel.y), tick)) - .5;
    float fault = signalFault(), broadcast = 1. - signalFramed;
    float luma = dot(color, vec3(.2126, .7152, .0722));
    // A weak chroma carrier with neutral static, rather than green phosphor.
    // Color drops out further during the receiver's existing fault bursts.
    color = mix(vec3(luma), color, .46 - fault * .24) * vec3(.98, .985, 1.015);
    color = color * .89 + vec3(.019, .019, .024);
    vec2 p = uv * 2. - 1.;
    float vignette = 1. - .28 * smoothstep(.25, 1.65, dot(p, p));
    vec3 screen = mix(vec3(.022, .022, .027), vec3(.06, .06, .069), max(0., 1. - dot(p * vec2(.8, .65), p * vec2(.8, .65))));
    float feather = (1. - smoothstep(.52, .95, abs(p.x))) * (1. - smoothstep(.58, .95, abs(p.y)));
    float snow = signalHash(floor(pixel * .9) + vec2(tick * 3., tick * 17.));
    vec3 staticScreen = vec3(.195) + snow * (.38 + fault * .15) + lineNoise * .08;
    screen = mix(screen, staticScreen, broadcast);
    float screenAlpha = mix(1., feather * .82, broadcast);
    float outAlpha = alpha + screenAlpha * (1. - alpha);
    color = color * alpha + screen * screenAlpha * (1. - alpha);
    // The raster is specified in CSS pixels, keeping it consistent at every DPR.
    float raster = .5 + .5 * cos(pixel.y * 2.617994);
    float scan = 1. - (.28 + broadcast * .06) * raster * raster;
    float sweep = fract(signalTime * .12 + .2);
    float distanceToBand = abs(fract(uv.y - sweep + .5) - .5);
    float roll = exp(-distanceToBand * distanceToBand / .0035);
    color *= scan * vignette * (1. + roll * .13);
    color += (grain * (.035 + broadcast * .025) + lineNoise * .032) * outAlpha;
    float dropout = step(.7, signalHash(vec2(floor(pixel.y / 4.), tick + 3.))) * fault;
    color *= 1. - dropout * .55;
    color = mix(color, vec3(.34 + grain * .6) * outAlpha, fault * .4);
    float reveal = smoothstep(uv.y - .035, uv.y + .035, signalVisibility * 1.07);
    float carrier = signalVisibility * reveal;
    return vec4(clamp(color, vec3(0.), vec3(outAlpha)) * carrier, outAlpha * carrier);
  }
`;
