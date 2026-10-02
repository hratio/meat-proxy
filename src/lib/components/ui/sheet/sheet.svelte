<script lang="ts">
	import { pauseCombatWhile, pauseWeaponTrackingWhile } from "$lib/ui/combat.svelte";
	import { Dialog as SheetPrimitive } from "bits-ui";

	let { open = $bindable(false), pauseGameplay = true, pauseWeaponTracking = true, ...restProps }: SheetPrimitive.RootProps & { pauseGameplay?: boolean; pauseWeaponTracking?: boolean } = $props();

	pauseCombatWhile(() => open && pauseGameplay);
	pauseWeaponTrackingWhile(() => open && pauseWeaponTracking);
</script>

<SheetPrimitive.Root bind:open {...restProps} />
