export const avatarIntros = {
  'slide-left': 'Intro 0 · Slide in from left',
  'shutter-open': 'Intro 1 · Open shutter',
  breach: 'Intro 2 · Break through'
} as const;

export const avatarOutros = {
  'shutter-close': 'Outro 1 · Close shutter',
  'slide-right': 'Outro 2 · Slide out right'
} as const;

export type AvatarIntro = keyof typeof avatarIntros;
export type AvatarOutro = keyof typeof avatarOutros;
export type AvatarTransitions = {
  intro: AvatarIntro;
  outro: AvatarOutro;
  introMs: number;
  outroMs: number;
};
export type AvatarTransitionFrame = AvatarTransitions & {
  phase: 'steady' | 'outro' | 'intro';
  progress: number;
  /** A presentation curtain can resume closing from a partially revealed shutter. */
  shutterCoverage?: number;
};

export const transitionDefaults: AvatarTransitions = {
  intro: 'shutter-open', outro: 'slide-right', introMs: 720, outroMs: 420
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const out = (n: number) => 1 - (1 - clamp(n)) ** 3;

/** Drawn in portrait space, underneath the HUD's existing bezel and clipping. */
export const createPortraitTransitionView = (overlay: HTMLCanvasElement, portrait: HTMLCanvasElement) => {
  const ctx = overlay.getContext('2d')!;
  let width = 1, height = 1;
  const resize = (w: number, h: number, ratio: number) => {
    width = w; height = h;
    overlay.width = Math.max(1, Math.round(w * ratio));
    overlay.height = Math.max(1, Math.round(h * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const slat = (row: number, y: number, h: number) => {
    const metal = ctx.createLinearGradient(0, y, 0, y + h);
    metal.addColorStop(0, '#383d40');
    metal.addColorStop(.08, '#24282b');
    metal.addColorStop(.22, '#181c1f');
    metal.addColorStop(.7, '#202528');
    metal.addColorStop(.86, '#2e3437');
    metal.addColorStop(.94, '#101315');
    metal.addColorStop(1, '#060809');
    ctx.fillStyle = metal;
    ctx.fillRect(0, y, width, h + .5);
    ctx.fillStyle = '#60696a55';ctx.fillRect(0, y + 1, width, .7);
    ctx.fillStyle = '#050708';ctx.fillRect(0, y + h - 2, width, 2);
    ctx.fillStyle = '#919a9712';
    for (let i = 0; i < 7; i++) {
      const x = ((row * 47 + i * 73) % 101) / 101 * width;
      ctx.fillRect(x, y + h * (.16 + i * .075), width * .09, .45);
    }
    for (const x of [width * .055, width * .945]) {
      ctx.fillStyle = '#080b0c';ctx.beginPath();ctx.arc(x, y + h * .45, 2, 0, Math.PI * 2);ctx.fill();
      ctx.fillStyle = '#626c6e';ctx.fillRect(x - .8, y + h * .45 - .8, 1.6, .7);
    }
  };

  const shutter = (coverage: number, shake = 0) => {
    if (coverage <= 0) return;
    ctx.save();ctx.translate(shake, -(1 - coverage) * height);
    const h = height / 11;
    for (let row = 0; row < 11; row++) slat(row, row * h, h);
    const shade = ctx.createLinearGradient(0, 0, width, 0);
    shade.addColorStop(0, '#000a');shade.addColorStop(.17, '#0000');
    shade.addColorStop(.8, '#0000');shade.addColorStop(1, '#000a');
    ctx.fillStyle = shade;ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#06090b';ctx.fillRect(0, height - 7, width, 7);
    ctx.fillStyle = '#555f62';ctx.fillRect(0, height - 7, width, 1);
    ctx.fillStyle = '#0a0d0e';ctx.fillRect(width * .39, height - 21, width * .22, 10);
    ctx.fillStyle = '#454d50';ctx.fillRect(width * .4, height - 20, width * .2, 2);
    ctx.restore();
  };

  const fragments = (progress: number) => {
    const impact = clamp((progress - .17) / .83);
    const launch = out(impact);
    const h = height / 11;
    if (progress < .17) {
      shutter(1, Math.sin(progress * 140) * progress * 7);
      // A short jagged split appears before the panels are thrown apart.
      if (progress > .1) {
        ctx.strokeStyle = '#030405';ctx.lineWidth = 2;
        ctx.beginPath();ctx.moveTo(width * .49, height * .12);
        for (let i = 0; i < 9; i++) ctx.lineTo(width * (.5 + Math.sin(i * 12) * .035), height * (.15 + i * .075));
        ctx.stroke();
      }
      return;
    }
    for (let row = 0; row < 11; row++) {
      const y = row * h;
      const edge = width * (.49 + Math.sin(row * 7.13) * .055);
      for (const side of [-1, 1]) {
        const left = side < 0;
        const pivotX = left ? 0 : width;
        const pivotY = y + h / 2;
        const velocity = .7 + ((row * 13) % 7) / 15;
        ctx.save();
        ctx.globalAlpha = 1 - smooth((impact - .65) / .35);
        ctx.translate(pivotX + side * launch * width * .66 * velocity, pivotY + (row - 5) * launch * h * .34 + impact * impact * height * .22);
        ctx.rotate(side * launch * (.14 + row % 3 * .1));
        ctx.translate(-pivotX, -pivotY);
        ctx.beginPath();
        ctx.moveTo(left ? -2 : width + 2, y - .5);
        ctx.lineTo(edge + side * 2, y - .5);
        ctx.lineTo(edge - side * width * .042, y + h * .23);
        ctx.lineTo(edge + side * width * .023, y + h * .49);
        ctx.lineTo(edge - side * width * .026, y + h * .78);
        ctx.lineTo(edge + side * 3, y + h + .5);
        ctx.lineTo(left ? -2 : width + 2, y + h + .5);
        ctx.closePath();ctx.clip();
        slat(row, y, h);
        ctx.strokeStyle = '#849092';ctx.lineWidth = 1;ctx.stroke();
        ctx.restore();
      }
    }
    // Small bright chips and a dusty impact ring, clipped inside the portrait.
    ctx.save();ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.39996;
      const distance = launch * width * (.18 + (i % 5) * .065);
      const x = width * .5 + Math.cos(angle) * distance;
      const y = height * .47 + Math.sin(angle) * distance + impact * impact * height * .25;
      ctx.globalAlpha = (1 - impact) ** 2 * .75;
      ctx.fillStyle = i % 4 === 0 ? '#f1b967' : '#7e898d';
      ctx.fillRect(x, y, i % 3 + 1, i % 2 + 1);
    }
    const dust = ctx.createRadialGradient(width / 2, height * .47, 0, width / 2, height * .47, width * .5);
    dust.addColorStop(0, '#b4bbc600');dust.addColorStop(.55, '#b4bbc626');dust.addColorStop(1, '#b4bbc600');
    ctx.globalAlpha = (1 - impact) * .7;ctx.fillStyle = dust;ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const render = (frame: AvatarTransitionFrame) => {
    const p = clamp(frame.progress);
    ctx.clearRect(0, 0, width, height);
    portrait.style.transform = '';
    overlay.style.zIndex = '2';
    // A prepared shutter must respect the portrait assembly's hidden state.
    overlay.style.visibility = frame.phase === 'steady' ? 'hidden' : 'inherit';
    if (frame.phase === 'steady') return;
    if (frame.phase === 'outro') {
      if (frame.outro === 'shutter-close') shutter(frame.shutterCoverage ?? smooth(p));
      else {
        // Prepare a shutter entrance only AFTER the departing canvas is clear.
        // Keeping a closed door behind the face exposes the next effect too early.
        const needsShutter = frame.intro !== 'slide-left';
        const slide = needsShutter ? clamp(p / .72) : p;
        portrait.style.transform = `translateX(${slide * slide * 115}%) rotate(${slide * slide * 4}deg)`;
        if (needsShutter && p > .72) shutter(smooth((p - .72) / .28));
      }
    } else if (frame.intro === 'slide-left') {
      portrait.style.transform = `translateX(${-115 * (1 - out(p))}%)`;
      if (frame.outro === 'shutter-close') shutter(1 - out(p / .5));
    } else if (frame.intro === 'shutter-open') {
      shutter(1 - out(p));
    } else {
      fragments(p);
      const impact = clamp((p - .17) / .83);
      const scale = p < .17 ? .88 : 1 + Math.sin(impact * Math.PI * 1.7) * .075 * (1 - impact);
      const shake = Math.sin(impact * 58) * (1 - impact) ** 3 * (p >= .17 ? 1.3 : 0);
      portrait.style.transform = `translateX(${shake}%) scale(${scale})`;
    }
  };
  return { resize, render, dispose() { portrait.style.transform = '';ctx.clearRect(0, 0, width, height); } };
};
