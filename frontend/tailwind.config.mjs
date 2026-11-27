/** @type {import('tailwindcss').Config} */

/** Token backed by a CSS variable holding an "r g b" triplet, so `/opacity` modifiers work. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const config = {
	content: [
		"./pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			/*
			 * Light glass theme on a soft green gradient. One neutral ink scale,
			 * one green accent. Status colours use Tailwind's amber/red scales.
			 * Values live in app/globals.css so they can be tuned in one place.
			 */
			colors: {
				canvas: token("canvas"),
				surface: token("surface"),
				subtle: token("subtle"),
				raised: token("raised"),
				line: token("line"),
				"line-strong": token("line-strong"),

				ink: token("ink"),
				"ink-2": token("ink-2"),
				"ink-3": token("ink-3"),
				"ink-4": token("ink-4"),

				accent: token("accent"),
				"accent-hover": token("accent-hover"),
				"accent-soft": token("accent-soft"),
				"accent-ink": token("accent-ink"),

				mint: token("mint"),
				"mint-soft": token("mint-soft"),

			},
			fontFamily: {
				sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
				display: ["var(--font-display)", '"Plus Jakarta Sans"', "system-ui", "sans-serif"],
				mono: ["var(--font-mono)", '"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
			},
			boxShadow: {
				card: "0 1px 2px rgba(16, 48, 33, 0.04), 0 10px 28px -16px rgba(16, 64, 42, 0.16)",
				pop: "0 2px 6px rgba(16, 48, 33, 0.05), 0 24px 56px -24px rgba(16, 64, 42, 0.3)",
				glow: "inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 10px 26px -8px rgba(14, 122, 75, 0.55)",
			},
			borderRadius: {
				card: "16px",
			},
			backgroundImage: {
				grid: "linear-gradient(to right, rgb(14 122 75 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(14 122 75 / 0.06) 1px, transparent 1px)",
			},
			keyframes: {
				shimmer: {
					"0%, 100%": { backgroundPosition: "0% 50%" },
					"50%": { backgroundPosition: "100% 50%" },
				},
				float: {
					"0%, 100%": { transform: "translateY(0)" },
					"50%": { transform: "translateY(-6px)" },
				},
			},
			animation: {
				float: "float 6s ease-in-out infinite",
				shimmer: "shimmer 8s ease-in-out infinite",
			},
		},
	},
	plugins: [],
};

export default config;
