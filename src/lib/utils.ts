export { cn } from 'cn';

export type WithElementRef<T, Element extends HTMLElement = HTMLElement> = T & { ref?: Element | null };
// Preserve Bits UI's single/multiple discriminated unions when omitting props.
export type WithoutChild<T> = T extends unknown ? Omit<T, 'child'> : never;
export type WithoutChildren<T> = T extends unknown ? Omit<T, 'children'> : never;
export type WithoutChildrenOrChild<T> = T extends unknown ? Omit<T, 'children' | 'child'> : never;
