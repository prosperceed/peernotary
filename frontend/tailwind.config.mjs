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
			 * White canvas with a soft periwinkle wash. Navy ink scale, one
			 * royal-blue accent. Status colours use Tailwind's amber/red scales.
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
				card: "0 1px 2px rgba(22, 28, 56, 0.04), 0 12px 32px -18px rgba(22, 28, 56, 0.14)",
				pop: "0 2px 8px rgba(22, 28, 56, 0.06), 0 28px 60px -28px rgba(47, 64, 150, 0.22)",
				glow: "inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 10px 26px -8px rgba(47, 64, 150, 0.55)",
			},
			borderRadius: {
				card: "14px",
			},
			backgroundImage: {
				grid: "linear-gradient(to right, rgb(47 64 150 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(47 64 150 / 0.06) 1px, transparent 1px)",
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
