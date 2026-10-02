<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] duration-(--ui-motion-duration) outline-none select-none disabled:cursor-default disabled:opacity-50 aria-disabled:cursor-default aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				outline: "border-border bg-background dark:bg-input/30 dark:border-input aria-expanded:bg-muted aria-expanded:text-foreground",
				secondary: "bg-secondary text-secondary-foreground aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost: "aria-expanded:bg-muted aria-expanded:text-foreground",
				destructive: "bg-destructive/10 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40",
				link: "text-primary underline-offset-4",
				preview: "text-white/80",
				"destructive-ghost": "text-muted-foreground",
				summary: "border-input border-l-2 border-l-muted-foreground bg-secondary text-left shadow-md aria-expanded:border-primary aria-expanded:bg-accent",
			},
			selected: {
				true: "border-input bg-muted text-primary hover:bg-muted hover:text-primary dark:bg-muted dark:hover:bg-muted",
				false: "",
			},
			interactive: {
				true: "active:not-aria-[haspopup]:translate-y-px",
				false: "",
			},
			size: {
				default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				row: "h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal whitespace-normal",
				card: "h-auto flex-wrap justify-start gap-2 whitespace-normal px-3 py-3",
				summary: "h-auto w-full flex-col items-stretch gap-1 rounded-sm px-3.5 py-3",
				"icon-tile": "size-14 p-1",
				"icon-xl": "size-20 rounded-xl p-0",
				icon: "size-8",
				"icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
				"icon-lg": "size-9",
			},
		},
		compoundVariants: [
			{ variant: "preview", interactive: true, selected: false, class: "hover:bg-white/10 hover:text-white" },
			{ variant: "destructive-ghost", interactive: true, selected: false, class: "hover:bg-destructive/10 hover:text-destructive" },
			{ variant: "summary", interactive: true, selected: false, class: "hover:border-ring/60 hover:bg-accent" },
			{ variant: "default", interactive: true, selected: false, class: "hover:bg-primary/90" },
			{ variant: "outline", interactive: true, selected: false, class: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent" },
			{ variant: "secondary", interactive: true, selected: false, class: "hover:bg-secondary/80" },
			{ variant: "ghost", interactive: true, selected: false, class: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent" },
			{ variant: "destructive", interactive: true, selected: false, class: "hover:bg-destructive/20 dark:hover:bg-destructive/30" },
			{ variant: "link", interactive: true, selected: false, class: "hover:underline" },
		],
		defaultVariants: {
			variant: "default",
			size: "default",
			selected: false,
			interactive: true,
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			selected?: boolean;
			size?: ButtonSize;
			cursorMode?: "native" | "combat";
			/** Keep disabled controls dimmed but suppress hover/press feedback. */
			disabledStyle?: "static" | "dim";
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		selected = false,
		size = "default",
		cursorMode = "native",
		disabledStyle = "static",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		data-ui-control=""
		data-cursor={cursorMode}
		class={cn(buttonVariants({ variant, size, selected, interactive: !disabled || disabledStyle === "dim" }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		data-ui-control=""
		data-cursor={cursorMode}
		class={cn(buttonVariants({ variant, size, selected, interactive: !disabled || disabledStyle === "dim" }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
