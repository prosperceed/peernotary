"use client";

import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
	username: string | null;
	showDossier: boolean;
	setShowDossier: (show: boolean) => void;
	onOpenUsernameModal: () => void;
	onOpenPostOffer: () => void;
}

export function DashboardHeader({
	username,
	showDossier,
	setShowDossier,
	onOpenUsernameModal,
	onOpenPostOffer,
}: DashboardHeaderProps) {
	return (
		<header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
			<div className="hidden md:block">
				<h1 className="text-xl font-semibold tracking-tight text-ink">
					Secure, Automated P2P
				</h1>
			</div>

			<div className="flex items-center gap-2.5">
				{username ? (
					<button
						onClick={() => setShowDossier(!showDossier)}
						className={cn(
							"rounded-md px-4 py-2 text-xs font-mono font-medium border transition-colors shadow-card",
							showDossier
								? "bg-ink text-white border-ink"
								: "bg-surface border-line text-ink hover:bg-subtle",
						)}
						title="Toggle Merchant Dossier"
					>
						@{username}
					</button>
				) : (
					<button
						onClick={onOpenUsernameModal}
						className="rounded-md px-4 py-2 text-xs font-medium border border-accent text-accent hover:bg-subtle transition-colors shadow-card"
					>
						Set Username
					</button>
				)}

				<button
					onClick={onOpenPostOffer}
					className="rounded-full bg-accent hover:bg-accent-hover text-white font-medium px-4 py-2 text-xs shadow-card transition-colors"
				>
					+ Post Offer
				</button>
			</div>
		</header>
	);
}
