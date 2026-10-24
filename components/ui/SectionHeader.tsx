interface SectionHeaderProps {
	tag: string;
	heading: string;
	subtext: string;
}

export default function SectionHeader({ tag, heading, subtext }: SectionHeaderProps) {
	return (
		<div className="text-center mb-16">
			<span className="inline-block px-3 py-1 rounded-full border border-[#d1e8dc] bg-[#f0f7f3] text-[11px] font-mono text-[#1a9e5c] tracking-widest mb-4">
				{tag}
			</span>
			<h2 className="text-3xl sm:text-4xl font-black text-[#0d2b1e] tracking-tight mb-3">
				{heading}
			</h2>
			<p className="text-[#3d6b55] max-w-md mx-auto text-sm leading-relaxed">
				{subtext}
			</p>
		</div>
	);
}
