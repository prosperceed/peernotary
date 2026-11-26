import { ARCSCAN_ADDR, ESCROW_ADDRESS } from "@/lib/web3/arcConfig";

export default function Footer() {
	return (
		<footer className="border-t border-line bg-canvas">
			<div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
				<span>PeerNotary · seller-funded USDC escrow on Arc Testnet</span>
				<a
					href={ARCSCAN_ADDR(ESCROW_ADDRESS)}
					target="_blank"
					rel="noreferrer"
					className="font-mono hover:text-ink"
				>
					Escrow {ESCROW_ADDRESS.slice(0, 6)}…{ESCROW_ADDRESS.slice(-4)}
				</a>
			</div>
		</footer>
	);
}
