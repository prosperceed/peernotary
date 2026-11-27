import { arcChain } from "@/lib/web3/arcConfig";

export default function Footer() {
	return (
		<footer className="border-t border-line">
			<div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-7 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
				<span>PeerNotary · seller-funded USDC escrow</span>
				<span className="flex items-center gap-2">
					<span className="net-dot h-1.5 w-1.5 rounded-full" />
					Settles on {arcChain.name}
				</span>
			</div>
		</footer>
	);
}
