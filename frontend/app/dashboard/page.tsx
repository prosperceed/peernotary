import { Suspense } from "react";
import UserDashboard, {
	DashboardSkeleton,
} from "@/components/dashboard/UserDashboard";

export default function UserDashboardPage() {
	return (
		<div className="min-h-screen bg-[#edf2ee] py-6 sm:py-10 px-3 sm:px-6">
			<div className="max-w-[1380px] w-full mx-auto">
				<Suspense fallback={<DashboardSkeleton />}>
					<UserDashboard />
				</Suspense>
			</div>
		</div>
	);
}
