/** A ribbon of thin curves sweeping across the hero, like a contour map of money moving. */
export default function WaveLines({ className }: { className?: string }) {
	const lines = Array.from({ length: 34 }, (_, i) => {
		const t = i / 33;
		const y0 = 250 + t * 70;
		const y1 = 120 + t * 150;
		const y2 = 330 - t * 40;
		const y3 = 150 + t * 120;
		return `M-40 ${y0} C 320 ${y1}, 620 ${y2}, 1480 ${y3}`;
	});
	return (
		<svg aria-hidden viewBox="0 0 1440 420" preserveAspectRatio="none" className={className} fill="none">
			<defs>
				<linearGradient id="wave-fade" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stopColor="#2f4096" stopOpacity="0" />
					<stop offset="0.35" stopColor="#2f4096" stopOpacity="0.16" />
					<stop offset="0.75" stopColor="#2f4096" stopOpacity="0.12" />
					<stop offset="1" stopColor="#2f4096" stopOpacity="0" />
				</linearGradient>
			</defs>
			{lines.map((d, i) => (
				<path key={i} d={d} stroke="url(#wave-fade)" strokeWidth="0.8" />
			))}
		</svg>
	);
}
