/** @type {import('tailwindcss').Config} */
const config = {
	content: [
		"./pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			colors: {
				void: "#080C14",
				"card-bg": "#0D1322",
				violet: {
					DEFAULT: "#7C3AED",
					400: "#A78BFA",
					500: "#8B5CF6",
					600: "#7C3AED",
					700: "#6D28D9",
				},
				mint: "#10B981",
				amber: "#F59E0B",
				slash: "#EF4444",
			},
			fontFamily: {
				sans: ["Inter", "system-ui", "sans-serif"],
				mono: ["SF Mono", "Fira Code", "ui-monospace", "monospace"],
			},
			backgroundImage: {
				"glow-violet":
					"radial-gradient(ellipse at 0% 0%, #7C3AED15 0%, transparent 60%)",
				"glow-mint":
					"radial-gradient(ellipse at 100% 100%, #10B98110 0%, transparent 60%)",
			},
			animation: {
				"pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
			},
		},
	},
	plugins: [],
};

export default config;
