import DevDashboard from "@/components/dashboard/DevDashboard";

export default function DeveloperDashboard() {
	return (
		<div className="min-h-screen bg-[#f5f9f7]">
			<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
				<div className="mb-6">
					<h1 className="text-xl font-bold text-[#0d2b1e]">Developer Dashboard</h1>
					<p className="text-sm text-[#7aaa92] mt-1">
						Monitor your Arc P2P integration · API status, escrow pools, and live
						transaction feed
					</p>
				</div>
				<DevDashboard />
			</div>
		</div>
	);
}
