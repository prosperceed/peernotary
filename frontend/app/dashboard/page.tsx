import UserDashboard from "@/components/dashboard/UserDashboard";

export default function UserDashboardPage() {
	return (
		<div className="min-h-screen bg-[#f5f9f7]">
			<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
				<div className="mb-6">
					<h1 className="text-xl font-bold text-[#0d2b1e]">User Dashboard</h1>
					<p className="text-sm text-[#7aaa92] mt-1">
						Manage your USDC balances, escrow positions, transaction history, and
						active peer trades on Arc Network
					</p>
				</div>
				<UserDashboard />
			</div>
		</div>
	);
}

