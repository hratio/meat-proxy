<script lang="ts" module>
	export type Side = "top" | "right" | "bottom" | "left";
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import SheetOverlay from "./sheet-overlay.svelte";
	import SheetPortal from "./sheet-portal.svelte";
	import type { Snippet } from "svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		side = "right",
		variant = "default",
		showCloseButton = true,
		nonModal = false,
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
		side?: Side;
		variant?: "default" | "inset" | "findings";
		showCloseButton?: boolean;
		nonModal?: boolean;
		children: Snippet;
	} = $props();

	const appearance = $derived(variant === "inset"
		? "gap-0 overflow-hidden rounded-lg border border-border p-0 data-[side=right]:top-[76px] data-[side=right]:right-6 data-[side=right]:bottom-6 data-[side=right]:h-auto data-[side=right]:w-[min(455px,calc(100vw-48px))] data-[side=right]:sm:max-w-none"
		: variant === "findings" ? "inset-y-0 left-0 right-auto h-dvh w-[min(355px,100vw)] max-w-none rounded-none border-r border-border bg-card/95 p-0 shadow-2xl backdrop-blur-xl" : "");
</script>

<SheetPortal {...portalProps}>
	{#if !nonModal}<SheetOverlay />{/if}
	{#if nonModal}
		<SheetPrimitive.Content
			bind:ref
			data-slot="sheet-content"
			data-ui-layer="sheet-content"
			data-cursor="native"
			data-side={side}
			class={cn("bg-popover text-popover-foreground fixed z-(--z-ui-dialog) flex flex-col gap-0 text-sm shadow-lg outline-none data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 data-[side=left]:data-open:slide-in-from-left-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=right]:data-closed:slide-out-to-right-10 duration-(--ui-motion-duration)", appearance, className)}
			trapFocus={false}
			preventScroll={false}
			preventOverflowTextSelection={false}
			{...restProps}
		>
			{#snippet child({ props })}
				<div {...props} role="dialog" aria-modal="false">
					{@render children?.()}
					{#if showCloseButton}
						<SheetPrimitive.Close data-slot="sheet-close">
							{#snippet child({ props: closeProps })}
								<Button variant="ghost" class="absolute top-3 right-3" size="icon-sm" {...closeProps}>
									<XIcon /><span class="sr-only">Close</span>
								</Button>
							{/snippet}
						</SheetPrimitive.Close>
					{/if}
				</div>
			{/snippet}
		</SheetPrimitive.Content>
	{:else}
	<SheetPrimitive.Content
		bind:ref
		data-slot="sheet-content"
		data-ui-layer="sheet-content"
		data-cursor="native"
		data-side={side}
		class={cn(
			"bg-popover text-popover-foreground fixed z-(--z-ui-dialog) flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-(--ui-motion-duration) ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
			appearance,
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<SheetPrimitive.Close data-slot="sheet-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="absolute top-3 right-3" size="icon-sm" {...props}>
						<XIcon  />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</SheetPrimitive.Close>
		{/if}
	</SheetPrimitive.Content>
	{/if}
</SheetPortal>
