import DevDashboard from "@/components/dashboard/DevDashboard";

export default function DeveloperDashboard() {
	return (
		<div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-10">
			<div className="mb-6">
				<h1 className="text-xl font-bold text-white">Developer Dashboard</h1>
				<p className="text-sm text-slate-500 mt-1">
					Monitor your Arc P2P integration · API status, escrow pools, and live
					transaction feed
				</p>
			</div>
			<DevDashboard />
		</div>
	);
}
