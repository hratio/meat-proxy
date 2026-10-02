<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.OverlayProps = $props();
</script>

<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	data-ui-layer="sheet-overlay"
	data-cursor="native"
	class={cn(
		"bg-black/65 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-(--z-ui-overlay) duration-(--ui-motion-duration) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
		className
	)}
	{...restProps}
/>
