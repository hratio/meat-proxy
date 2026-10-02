import type { Component } from 'svelte';

export type SettingsPage = { id: string; label: string; description: string };
export type SettingsGroup = { id: string; label: string; icon: Component<{ class?: string }>; pages: SettingsPage[] };
