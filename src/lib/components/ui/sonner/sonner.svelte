<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	import { useUi } from '$lib/ui/context.svelte';
	import { defaults } from '$lib/config';
	const ui = useUi();

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme="dark"
	class="toaster group hud-toaster"
	position={ui.config?.display.toastPosition ?? defaults.display.toastPosition}
	duration={ui.config?.display.toastMs ?? defaults.display.toastMs}
	offset={16}
	mobileOffset={12}
	pauseWhenPageIsHidden
	closeButton
	style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border);"
	toastOptions={{
		classes: {
			toast: "cn-toast hud-toast",
		},
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>

<style>
	:global(.hud-toaster [data-sonner-toast][data-styled='false']) { width: var(--width); max-width: 100%; padding: 0; border: 0; background: transparent; box-shadow: none; }
	:global([data-ui-reduced-motion='true'] .hud-toaster [data-sonner-toast]) { transition-duration: 0ms !important; animation: none !important; }
	:global([data-ui-reduced-motion='true'] .hud-notification .animate-spin) { animation: none; }
	@media (max-width: 600px) {
		:global(.hud-toaster [data-sonner-toast][data-styled='false']) { width: calc(100% - var(--mobile-offset-left) * 2); }
	}
</style>
