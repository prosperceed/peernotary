import UserDashboard from "@/components/dashboard/UserDashboard";

export default function UserDashboardPage() {
	return (
		<div className="min-h-screen bg-[#f5f9f7]">
			<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
				<div className="mb-4">
					<h1 className="text-lg font-semibold text-[#0d2b1e]">User Dashboard</h1>
					<p className="text-xs text-[#7aaa92] mt-0.5">
						Track your wallet balance, escrow trades, and open peer market orders on Arc Testnet
					</p>
				</div>
				<UserDashboard />
			</div>
		</div>
	);
}

