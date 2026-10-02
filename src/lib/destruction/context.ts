import { getContext, setContext } from 'svelte';
import { DestructionController } from './model';

const key = Symbol('destruction');
export function provideDestruction() { return setContext(key, new DestructionController()); }
export function useDestruction() { return getContext<DestructionController | undefined>(key); }
