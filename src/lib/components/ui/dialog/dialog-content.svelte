<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import XIcon from '@lucide/svelte/icons/x';
	import MoveDiagonal2Icon from '@lucide/svelte/icons/move-diagonal-2';
	import { panelLayout } from "$lib/ui/panel-layout";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import * as Dialog from "./index.js";
	import DialogPortal from "./dialog-portal.svelte";
	import type { Snippet } from "svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		modal = true,
		cinematic = false,
		variant = "default",
		size = "default",
		fixedHeight = false,
		layoutKey,
		overlayClass,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
		modal?: boolean;
		cinematic?: boolean;
		variant?: "default" | "panel";
		size?: "default" | "md" | "lg" | "xl";
		fixedHeight?: boolean;
		layoutKey?: string;
		overlayClass?: string;
	} = $props();
</script>

<DialogPortal {...portalProps}>
	{#if modal}<Dialog.Overlay class={overlayClass} />{/if}
	{#if !modal}
		<div class="cinematic-backdrop" data-cinematic-backdrop data-active={cinematic} aria-hidden="true"></div>
	{/if}
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		data-ui-layer="dialog-content"
		data-cursor="native"
		trapFocus={modal || cinematic}
		preventScroll={modal || cinematic}
		class={cn(
			"bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 grid max-w-[calc(100%_-_2rem)] gap-4 rounded-xl p-4 text-sm ring-1 duration-(--ui-motion-duration) sm:max-w-sm fixed top-1/2 left-1/2 z-(--z-ui-dialog) w-full -translate-x-1/2 -translate-y-1/2 outline-none",
			variant === "panel" && "flex flex-col gap-0 overflow-hidden border border-border p-0 ring-0 max-h-[min(86dvh,850px)]",
			size !== "default" && "sm:max-w-none",
			size === "md" && "w-[min(560px,calc(100vw-32px))]",
			size === "lg" && "w-[min(850px,calc(100vw-32px))]",
			size === "xl" && "w-[min(1100px,calc(100vw-32px))]",
			fixedHeight && "h-[min(800px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)]",
			layoutKey && "animate-none! transition-none! max-h-[calc(100dvh-32px)] sm:max-w-[calc(100vw-32px)]",
			className
		)}
		{...restProps}
	>
		{#snippet child({ props })}
		<div {...props} use:panelLayout={layoutKey} data-panel-layout={layoutKey} aria-modal={modal || cinematic || undefined}>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close data-slot="dialog-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="absolute top-2 right-2" size="icon-sm" {...props}>
						<XIcon  />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</DialogPrimitive.Close>
		{/if}
		{#if layoutKey}
			<Button variant="ghost" size="icon-sm" class="absolute right-0.5 bottom-0.5 z-10 size-6 touch-none select-none text-muted-foreground"
				data-panel-resize aria-label="Resize panel" title="Resize panel: drag or use arrow keys">
				<MoveDiagonal2Icon class="size-3.5" />
			</Button>
		{/if}
		</div>
		{/snippet}
	</DialogPrimitive.Content>
</DialogPortal>

<style>
	/* Keep footer actions clear of the resize handle in every movable panel. */
	:global([data-panel-layout] footer) { padding-right: max(2.5rem, 32px); }
	.cinematic-backdrop { position: fixed; inset: 0; z-index: var(--z-ui-overlay); background: #000; opacity: 0; pointer-events: none; transition: opacity 450ms ease; }
	.cinematic-backdrop[data-active='true'] { opacity: .78; pointer-events: auto; }
	:global([data-ui-reduced-motion='true']) .cinematic-backdrop { transition: none; }
	@media (prefers-reduced-motion: reduce) { .cinematic-backdrop { transition: none; } }
</style>
