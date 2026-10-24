export default function Footer() {
	return (
		<footer className="bg-[#f5f9f7] border-t border-[#d1e8dc] mt-12 py-4">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
				<div className="text-[11px] text-[#7aaa92]">
					© 2026 Arc Network · PeerNotary · NGN/USDC Escrow Protocol
				</div>
				<div className="hidden sm:flex items-center gap-3 text-[11px] text-[#7aaa92] divide-x divide-[#d1e8dc]">
					<span>Powered by Arc Testnet</span>
					<span className="pl-3">ZK Proofs via TLSNotary</span>
				</div>
			</div>
		</footer>
	);
}
