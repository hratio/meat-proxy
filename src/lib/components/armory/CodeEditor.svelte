<script lang="ts">
  import { onMount } from 'svelte';
  import { Compartment, EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { syntaxHighlighting, bracketMatching } from '@codemirror/language';
  import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
  import { javascript } from '@codemirror/lang-javascript';

  let { value = $bindable(''), label, language = 'typescript', disabled = false, invalid = false, describedBy }: {
    value?: string; label: string; language?: 'typescript' | 'text'; disabled?: boolean; invalid?: boolean; describedBy?: string;
  } = $props();
  let host: HTMLDivElement;
  let editor = $state.raw<EditorView>();

  const interaction = new Compartment();
  const attributes = () => [EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled), EditorView.contentAttributes.of({
    'aria-label': label, 'aria-invalid': String(invalid), ...(describedBy ? { 'aria-describedby': describedBy } : {})
  })];
  const appearance = [
    syntaxHighlighting(oneDarkHighlightStyle),
    EditorView.theme({
      '&': { backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '13px' },
      '.cm-scroller': { fontFamily: 'var(--mono)', minHeight: '130px', maxHeight: '260px', overflow: 'auto' },
      '.cm-content': { padding: '10px 0', caretColor: 'var(--primary)' },
      '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: 'none' },
      '.cm-activeLine': { backgroundColor: 'var(--editor-active)' },
      '&.cm-focused': { outline: 'none' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--editor-selection)' }
    }, { dark: true })
  ];

  $effect(() => { editor?.dispatch({ effects: interaction.reconfigure(attributes()) }); });

  onMount(() => {
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), history(), highlightActiveLine(), bracketMatching(),
          language === 'typescript' ? javascript({ typescript: true }) : [], ...appearance,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          interaction.of(attributes()),
          EditorView.updateListener.of(update => {
            if (update.docChanged) value = update.state.doc.toString();
          })
        ]
      })
    });
    editor = view;
    return () => { editor = undefined; view.destroy(); };
  });

  $effect(() => {
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  });
</script>

<div class="overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring/50 aria-invalid:border-destructive" aria-invalid={invalid} data-cursor="native" bind:this={host}></div>
