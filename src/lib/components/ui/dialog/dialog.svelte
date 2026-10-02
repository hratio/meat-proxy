<script lang="ts">
	import { pauseCombatWhile, pauseWeaponTrackingWhile } from "$lib/ui/combat.svelte";
	import { Dialog as DialogPrimitive } from "bits-ui";

	let { open = $bindable(false), pauseGameplay = true, pauseWeaponTracking = true, ...restProps }: DialogPrimitive.RootProps & { pauseGameplay?: boolean; pauseWeaponTracking?: boolean } = $props();

	pauseCombatWhile(() => open && pauseGameplay);
	pauseWeaponTrackingWhile(() => open && pauseWeaponTracking);
</script>

<DialogPrimitive.Root bind:open {...restProps} />
