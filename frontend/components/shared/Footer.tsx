import { arcChain } from "@/lib/web3/arcConfig";

export default function Footer() {
	return (
		<footer className="border-t border-line bg-canvas">
			<div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
				<span>PeerNotary · seller-funded USDC escrow</span>
				<span>Settles on {arcChain.name}</span>
			</div>
		</footer>
	);
}
