<script lang="ts">
	import { pauseCombatWhile, pauseWeaponTrackingWhile } from "$lib/ui/combat.svelte";
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		open = $bindable(false), pauseWeaponTracking = true,
		value = $bindable(),
		...restProps
	}: SelectPrimitive.RootProps & { pauseWeaponTracking?: boolean } = $props();

	pauseCombatWhile(() => open);
	pauseWeaponTrackingWhile(() => open && pauseWeaponTracking);
</script>

<SelectPrimitive.Root bind:open bind:value={value as never} {...restProps} />
