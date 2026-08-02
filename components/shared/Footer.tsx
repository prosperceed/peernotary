export default function Footer() {
	return (
		<footer className="bg-bg border-t border-secondary/20 mt-12 py-4">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
				<div className="text-[11px] text-slate-600">
					© 2026 Arc Network · P2P As-a-Service · NGN/USDC Escrow Protocol
				</div>
				<div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-600 divide-x divide-slate-800">
					<span>Powered by Arc Testnet</span>
					<span className="pl-3">ZK Proofs via TLSNotary</span>
					{/* <span className="pl-3">Open Banking via Mono/Fincra</span> */}
					{/* <span className="pl-3">Smart Contracts · Solidity 0.8.24</span> */}
				</div>
			</div>
		</footer>
	);
}
