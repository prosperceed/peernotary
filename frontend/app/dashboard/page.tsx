import { Suspense } from "react";
import UserDashboard, {
	DashboardSkeleton,
} from "@/components/dashboard/UserDashboard";

export default function UserDashboardPage() {
	return (
		<div className="min-h-screen px-3 py-6 sm:px-5 sm:py-8">
			<div className="max-w-[1380px] w-full mx-auto">
				<Suspense fallback={<DashboardSkeleton />}>
					<UserDashboard />
				</Suspense>
			</div>
		</div>
	);
}
