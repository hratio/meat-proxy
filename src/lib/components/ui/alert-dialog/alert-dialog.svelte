<script lang="ts">
	import { pauseCombatWhile, pauseWeaponTrackingWhile } from "$lib/ui/combat.svelte";
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let { open = $bindable(false), pauseWeaponTracking = true, ...restProps }: AlertDialogPrimitive.RootProps & { pauseWeaponTracking?: boolean } = $props();

	pauseCombatWhile(() => open);
	pauseWeaponTrackingWhile(() => open && pauseWeaponTracking);
</script>

<AlertDialogPrimitive.Root bind:open {...restProps} />
