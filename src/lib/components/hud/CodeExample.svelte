<script lang="ts">
  let { code, label = 'Code example', wordWrap = false }: { code: string; label?: string; wordWrap?: boolean } = $props();
  // Deliberately small example lexer, not an editor/parser. Svelte escapes all text.
  function tokenize(line: string) {
    return Array.from(line.matchAll(/(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b(?:const|let|var|if|else|return|await|async|function|throw|new|import|from|export|true|false|null|undefined)\b|\b\d+\b|\b[A-Za-z_$][\w$]*(?=\s*\())|([^"'`\w]+|[\w$]+|.)/g), match => {
      const value = match[0];
      let kind = '';
      if (match[1]) {
        kind = value.startsWith('//') ? 'text-(--tint-708a7f)' : /^["'`]/.test(value) ? 'text-[#e3ba6f]'
          : /^\d/.test(value) ? 'text-[#f1a484]' : /^(const|let|var|if|else|return|await|async|function|throw|new|import|from|export|true|false|null|undefined)$/.test(value) ? 'text-[#c2a3d6]' : 'text-[#7db9cb]';
      }
      return { value, kind };
    });
  }
  let lines = $derived(code.replace(/\r\n/g, '\n').split('\n').map(tokenize));
</script>

<!-- Keyboard focus lets users scroll a code example without a mouse. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="example-scroll size-full overflow-auto overscroll-contain [scrollbar-color:var(--tint-52635866)_transparent] [scrollbar-width:thin]" class:word-wrap={wordWrap} tabindex="0" role="region" aria-label={label}>
  <pre class="m-0 w-max min-w-full py-[3px] font-mono text-[length:var(--hud-code-size,12px)]/[1.55] whitespace-pre"><code class="block text-(--tint-ced4cc) [font:inherit]">{#each lines as tokens, index}<span class="code-line flex min-h-[1.55em]"><span class="line-number sticky left-0 inline-block flex-[0_0_36px] border-r border-[#ffffff10] bg-[#111111] pr-2.5 text-right text-(--tint-6a7a74) select-none" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span class="line-text inline-block px-[13px]">{#each tokens as token}<span class={token.kind}>{token.value}</span>{/each}{'\n'}</span></span>{/each}</code></pre>
</div>

<style>
  .word-wrap pre { width: 100%; white-space: pre-wrap; }
  .word-wrap .line-text { min-width: 0; flex: 1; overflow-wrap: anywhere; }
</style>
