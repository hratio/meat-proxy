<script lang="ts">
  import type { Splash2Audio } from './splash2-audio-config';
  import { sampleSubtitle, subtitleFontFamilies, type Splash2Subtitles } from './splash2-subtitles';
  let { time, settings, audio, fixed = false, endTime = Infinity }: {
    time: number; settings: Splash2Subtitles; audio: Splash2Audio; fixed?: boolean; endTime?: number;
  } = $props();
  let cue = $derived(time < endTime ? sampleSubtitle(time, settings, audio) : undefined);
</script>

{#if cue}
  <div class="opening-subtitles" class:fixed data-opening-subtitles data-cue-id={cue.id}
    style:--subtitle-bottom={`${settings.bottom}%`} style:color={settings.color}
    style:opacity={settings.opacity} style:font-family={subtitleFontFamilies[settings.font]}
    style:font-size={`${settings.fontSize}px`} style:letter-spacing={`${settings.tracking}em`}>
    <p>{cue.text}</p>
  </div>
{/if}

<style>
  .opening-subtitles { position: absolute; z-index: 251; inset-inline: 0; bottom: var(--subtitle-bottom); padding-inline: 14%; pointer-events: none; text-align: center; font-weight: 400; line-height: 1.5; text-wrap: balance; }
  .opening-subtitles.fixed { position: fixed; bottom: max(var(--subtitle-bottom), env(safe-area-inset-bottom, 0px) + 18px); }
  p { margin: 0 auto; max-width: 760px; white-space: pre-line; text-shadow: 0 1px 3px #000, 0 0 10px #0009; }
  @media (max-width: 540px) { .opening-subtitles { padding-inline: 20px; } .opening-subtitles.fixed { bottom: max(var(--subtitle-bottom), 90px); } }
</style>
