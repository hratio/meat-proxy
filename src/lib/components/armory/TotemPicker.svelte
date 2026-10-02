<script lang="ts">
  import { tick } from 'svelte';
  import { ChevronDown } from '@lucide/svelte';
  import * as Popover from '$lib/components/ui/popover';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import VImage from '$lib/components/VImage.svelte';
  import { totems, firstTotemCharacter, isTotemCharacter, type TotemValue } from '$lib/totems';

  let { value, onchange, compact = false, disabled = false }: {
    value: TotemValue; onchange: (value: TotemValue) => void;
    compact?: boolean; disabled?: boolean;
  } = $props();
  let open = $state(false);
  let mode = $state('images');
  let character = $state('');
  let input = $state<HTMLInputElement | null>(null);
  let composing = $state(false);
  let focusCharacter = false;

  function changeOpen(next: boolean) {
    if (next) {
      mode = typeof value === 'string' ? 'character' : 'images';
      character = typeof value === 'string' ? value : '';
      composing = false;
      focusCharacter = false;
    }
    open = next;
  }

  function updateCharacter(target: HTMLInputElement, text = target.value) {
    character = firstTotemCharacter(text);
    target.value = character;
    target.select();
  }

  function setCharacter(event: SubmitEvent) {
    event.preventDefault();
    if (composing || !isTotemCharacter(character)) return;
    onchange(character);
    open = false;
  }
</script>

<Popover.Root {open} onOpenChange={changeOpen}>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant={compact ? 'outline' : 'ghost'} size={compact ? 'icon' : 'icon-xl'} {disabled} aria-label="Change totem">
        <VImage index={value} size={compact ? 24 : 68} />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="h-[400px] w-[400px] max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] gap-3 overflow-hidden p-4" aria-label="Choose a totem" sideOffset={8}
    onOpenAutoFocus={event => { if (mode === 'character') { event.preventDefault(); input?.focus(); } }}>
    <div class="flex shrink-0 items-center justify-between gap-3">
      <h3 class="font-semibold">Choose a totem</h3>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="sm" aria-label="Totem type">{mode === 'character' ? 'Character' : 'Images'}<ChevronDown class="size-3.5 text-muted-foreground" /></Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" onCloseAutoFocus={event => {
          if (focusCharacter) { event.preventDefault(); focusCharacter = false; void tick().then(() => input?.focus()); }
        }}>
          <DropdownMenu.RadioGroup bind:value={mode} onValueChange={value => focusCharacter = value === 'character'}>
            <DropdownMenu.RadioItem value="images">Images</DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="character">Character</DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    {#if mode === 'character'}
      <form onsubmit={setCharacter} class="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
        <!-- Native maxlength and PIN cells count UTF-16 units, splitting emoji and composed letters. -->
        <Input bind:ref={input} value={character} aria-label="Totem character" autocomplete="off" autocapitalize="off" spellcheck={false} inputmode="text"
          class="h-44 w-40 shrink-0 rounded-xl px-2 text-center font-sans text-[96px] font-semibold leading-none md:text-[96px]"
          onfocus={event => event.currentTarget.select()}
          oninput={event => { if (!composing) updateCharacter(event.currentTarget); }}
          oncompositionstart={() => composing = true}
          oncompositionend={event => { composing = false; updateCharacter(event.currentTarget); }}
          onpaste={event => { event.preventDefault(); updateCharacter(event.currentTarget, event.clipboardData?.getData('text/plain') ?? ''); }} />
        <Button type="submit" class="min-w-24" disabled={composing || !isTotemCharacter(character)}>Set</Button>
      </form>
    {:else}
      <div class="grid min-h-0 min-w-0 flex-1 auto-rows-max grid-cols-6 content-start gap-1.5 overflow-x-hidden overflow-y-auto" data-totem-grid>
        {#each totems as totem, index}
          <Button variant="ghost" size="icon-tile" class="min-w-0 w-full [&>span]:max-w-full" selected={value === index} aria-label={`Totem ${totem.id}: ${totem.name}`} aria-pressed={value === index}
            onclick={() => { onchange(index); open = false; }}>
            <VImage {index} size={48} />
          </Button>
        {/each}
      </div>
    {/if}
  </Popover.Content>
</Popover.Root>
