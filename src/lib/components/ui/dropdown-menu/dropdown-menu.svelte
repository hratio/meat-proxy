<script lang="ts">
	import { pauseCombatWhile, pauseWeaponTrackingWhile } from "$lib/ui/combat.svelte";
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

	let { open = $bindable(false), ...restProps }: DropdownMenuPrimitive.RootProps = $props();
	pauseCombatWhile(() => open);
	pauseWeaponTrackingWhile(() => open);
</script>

<DropdownMenuPrimitive.Root bind:open {...restProps} />
