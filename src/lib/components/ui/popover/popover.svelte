<script lang="ts">
	import { pauseCombatWhile, pauseWeaponTrackingWhile } from "$lib/ui/combat.svelte";
	import { Popover as PopoverPrimitive } from "bits-ui";

	let { open = $bindable(false), pauseCombat = true, pauseWeaponTracking = true, ...restProps }: PopoverPrimitive.RootProps & { pauseCombat?: boolean; pauseWeaponTracking?: boolean } = $props();

	pauseCombatWhile(() => open && pauseCombat);
	pauseWeaponTrackingWhile(() => open && pauseWeaponTracking);
</script>

<PopoverPrimitive.Root bind:open {...restProps} />
