<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AlertDialogPrimitive.OverlayProps = $props();
</script>

<AlertDialogPrimitive.Overlay
	bind:ref
	data-slot="alert-dialog-overlay"
	data-ui-layer="alert-dialog-overlay"
	data-cursor="native"
	class={cn("data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/65 duration-(--ui-motion-duration) supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-(--z-ui-overlay)", className)}
	{...restProps}
/>
