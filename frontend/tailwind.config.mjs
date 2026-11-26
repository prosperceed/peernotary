/** @type {import('tailwindcss').Config} */
const config = {
	content: [
		"./pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			/*
			 * One neutral ink scale + one accent. Status colours come from
			 * Tailwind's amber/red/sky scales. Keep new colours out of components.
			 */
			colors: {
				canvas: "#f7f8f7",
				surface: "#ffffff",
				subtle: "#f2f4f3",
				line: "#e3e6e4",
				"line-strong": "#cfd5d2",

				ink: "#0f1412",
				"ink-2": "#47514c",
				"ink-3": "#78817c",
				"ink-4": "#a3aba7",

				accent: "#0e7a4b",
				"accent-hover": "#0a6540",
				"accent-soft": "#e8f3ed",
				"accent-ink": "#0a5c39",
			},
			fontFamily: {
				sans: ["Geist", "Inter", "system-ui", "sans-serif"],
				mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
			},
			boxShadow: {
				card: "0 1px 2px rgba(15, 20, 18, 0.04)",
				pop: "0 8px 24px -8px rgba(15, 20, 18, 0.16), 0 1px 2px rgba(15, 20, 18, 0.06)",
			},
			borderRadius: {
				card: "12px",
			},
		},
	},
	plugins: [],
};

export default config;
