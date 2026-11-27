"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Dark code panel with a filename/language tab and a copy button. */
export default function CodeBlock({ code, label }: { code: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	const copy = () => {
		navigator.clipboard.writeText(code).catch(() => {});
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1400);
	};
	return (
		<div className="group my-4 overflow-hidden rounded-lg border border-[#262c47] bg-[#161c38]">
			<div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
				<span className="font-mono text-[11px] text-[#9aa1c2]">{label ?? "example"}</span>
				<button
					onClick={copy}
					className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-[#9aa1c2] transition-colors hover:bg-white/[0.06] hover:text-white"
					aria-label="Copy code"
				>
					{copied ? <Check size={12} /> : <Copy size={12} />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-relaxed text-[#dfe3f5]">
				<code className="font-mono">{code}</code>
			</pre>
		</div>
	);
}
