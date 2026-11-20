export default function USDCIcon({ size = 28 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
			<circle cx="16" cy="16" r="14" stroke="#1a9e5c" strokeWidth="2" fill="none" />
			<path d="M16 6v2M16 24v2" stroke="#1a9e5c" strokeWidth="2" strokeLinecap="round" />
			<path
				d="M20.5 11.5C20.5 9.57 18.43 8 16 8s-4.5 1.57-4.5 3.5c0 1.65 1.3 3.04 3.14 3.38l2.72.5C19.2 15.71 20.5 17.1 20.5 18.75 20.5 20.8 18.43 22 16 22s-4.5-1.2-4.5-3.25"
				stroke="#1a9e5c"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}
