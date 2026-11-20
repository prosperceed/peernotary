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
				/* Light background system */
				bg: "#f5f9f7",
				"bg-secondary": "#edf5f1",
				surface: "#ffffff",
				"surface-alt": "#f0f7f3",

				/* Green accent palette */
				"green-primary": "#1a9e5c",
				"green-mid": "#22c972",
				"green-light": "#4dd68c",
				"green-pale": "#d4f0e3",

				/* Text */
				"text-primary": "#0d2b1e",
				"text-secondary": "#3d6b55",
				"text-muted": "#7aaa92",

				/* Borders */
				border: "#d1e8dc",
			},
			fontFamily: {
				sans: ["Inter", "system-ui", "sans-serif"],
				mono: ["SF Mono", "Fira Code", "ui-monospace", "monospace"],
			},
			backgroundImage: {
				"glow-green":
					"radial-gradient(ellipse at 50% 0%, rgba(34,201,114,0.18) 0%, transparent 65%)",
				"glow-green-bottom":
					"radial-gradient(ellipse at 50% 100%, rgba(34,201,114,0.12) 0%, transparent 60%)",
				"ring-gradient":
					"radial-gradient(ellipse at center, rgba(34,201,114,0.15) 0%, rgba(245,249,247,0) 70%)",
			},
			animation: {
				"pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
				"float-bob": "float-bob 4s ease-in-out infinite",
				"orbit-cw": "orbit-slow 28s linear infinite",
				"orbit-ccw": "orbit-slower 36s linear infinite",
			},
			keyframes: {
				"float-bob": {
					"0%, 100%": { transform: "translateY(0px)" },
					"50%": { transform: "translateY(-8px)" },
				},
				"orbit-slow": {
					from: { transform: "translate(-50%, -50%) rotate(0deg)" },
					to:   { transform: "translate(-50%, -50%) rotate(360deg)" },
				},
				"orbit-slower": {
					from: { transform: "translate(-50%, -50%) rotate(0deg)" },
					to:   { transform: "translate(-50%, -50%) rotate(-360deg)" },
				},
			},
		},
	},
	plugins: [],
};

export default config;
