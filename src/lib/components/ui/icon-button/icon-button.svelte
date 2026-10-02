<script lang="ts" module>
  import type { ButtonProps } from '$lib/components/ui/button';

  export type IconButtonProps = ButtonProps & {
    /** Resolving shows confirmation; return false when the action was cancelled or failed. */
    action?: (event: MouseEvent) => void | boolean | Promise<void | boolean>;
    onactionerror?: (error: unknown) => void;
    successDurationMs?: number;
    /** Announced after success. Give the button its own accessible name with aria-label. */
    successLabel?: string;
  };
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { mergeProps } from 'bits-ui';
  import { Check } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';

  let {
    action,
    onactionerror,
    successDurationMs = 1400,
    successLabel = 'Done',
    variant = 'ghost',
    size = 'icon',
    ref = $bindable(null),
    disabled = false,
    children,
    ...restProps
  }: IconButtonProps = $props();

  let pending = $state(false);
  let succeeded = $state(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  onDestroy(() => {
    disposed = true;
    clearTimeout(resetTimer);
  });

  async function runAction(event: MouseEvent) {
    if (disabled || pending) { event.preventDefault(); return; }
    if (!action || event.defaultPrevented) return;
    clearTimeout(resetTimer);
    succeeded = false;
    pending = true;

    try {
      const result = await action(event);
      if (disposed || result === false) return;
      succeeded = true;
      resetTimer = setTimeout(() => succeeded = false, successDurationMs);
    } catch (error) {
      if (!disposed) {
        if (onactionerror) onactionerror(error);
        else console.error('Icon button action failed.', error);
      }
    } finally {
      if (!disposed) pending = false;
    }
  }
</script>

<Button
  {...mergeProps(restProps, { onclick: runAction })}
  bind:ref
  {variant}
  {size}
  {disabled}
  aria-disabled={disabled || pending || restProps['aria-disabled']}
  aria-busy={pending || restProps['aria-busy']}
  data-success={succeeded}
>
  <span class="icon-button-content" data-success={succeeded} aria-hidden="true">
    <span class="icon-button-original">{@render children?.()}</span>
    <span class="icon-button-check"><Check class="size-full" strokeWidth={1.75} /></span>
  </span>
  <span class="sr-only" role="status">{succeeded ? successLabel : ''}</span>
</Button>

<style>
  .icon-button-content { position: relative; display: inline-grid; place-items: center; }
  .icon-button-original { display: inline-flex; }
  .icon-button-check { position: absolute; inset: 0; display: flex; opacity: 0; transform: translateY(2px) scale(.85); }
  .icon-button-original, .icon-button-check {
    transition: opacity var(--ui-motion-duration, 160ms) ease, transform var(--ui-motion-duration, 160ms) ease;
  }
  [data-success='true'] > .icon-button-original { opacity: 0; transform: scale(.92); }
  [data-success='true'] > .icon-button-check { opacity: .85; transform: translateY(0) scale(1); }
  @media (prefers-reduced-motion: reduce) {
    .icon-button-original, .icon-button-check { transition: none; }
  }
</style>
