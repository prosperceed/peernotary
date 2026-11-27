/** Route-level loading state: the escrow lock with a dot travelling its ring. */
export default function Loading() {
	return (
		<div className="flex min-h-[70vh] flex-col items-center justify-center gap-5" role="status" aria-live="polite">
			<div className="relative h-16 w-16">
				<svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" aria-hidden>
					<circle cx="32" cy="32" r="29" fill="none" stroke="rgb(47 64 150 / 0.12)" strokeWidth="2" />
				</svg>
				<svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full animate-spin [animation-duration:1.4s]" aria-hidden>
					<circle
						cx="32"
						cy="32"
						r="29"
						fill="none"
						stroke="rgb(47 64 150)"
						strokeWidth="2"
						strokeLinecap="round"
						strokeDasharray="40 200"
					/>
				</svg>
				<div className="absolute inset-[14px] flex items-center justify-center rounded-full bg-[#1a2148] shadow-card">
					<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
						<path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#e9ecf8" strokeWidth="2" strokeLinecap="round" />
						<rect x="5.5" y="10.5" width="13" height="10" rx="3" fill="#e9ecf8" />
					</svg>
				</div>
			</div>
			<p className="text-sm text-ink-3">Loading…</p>
		</div>
	);
}
