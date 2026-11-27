"use client";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6 animate-pulse">
			<div className="flex items-center justify-between pb-4 border-b border-subtle">
				<div className="h-7 w-36 bg-subtle rounded-full" />
				<div className="flex gap-2">
					<div className="h-8 w-24 bg-subtle rounded-full" />
					<div className="h-8 w-28 bg-subtle rounded-full" />
				</div>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="h-36 rounded-card bg-surface/60 border border-line p-5 space-y-3"
					>
						<div className="h-3.5 w-24 bg-subtle rounded" />
						<div className="h-7 w-32 bg-subtle rounded" />
						<div className="h-6 w-full bg-subtle rounded-full mt-4" />
					</div>
				))}
			</div>
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
				<div className="lg:col-span-8 h-80 rounded-card bg-surface/60 border border-line" />
				<div className="lg:col-span-4 h-80 rounded-card bg-surface/60 border border-line" />
			</div>
		</div>
	);
}
