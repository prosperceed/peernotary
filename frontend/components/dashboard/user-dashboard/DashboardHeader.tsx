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
			<div>
				<h1 className="text-xl font-bold tracking-tight text-[#0d2b1e]">
					Secure, Automated P2P
				</h1>
			</div>

			<div className="flex items-center gap-2.5">
				{username ? (
					<button
						onClick={() => setShowDossier(!showDossier)}
						className={cn(
							"rounded-full px-4 py-2 text-xs font-mono font-medium border transition-all shadow-sm",
							showDossier
								? "bg-[#0d2b1e] text-white border-[#0d2b1e]"
								: "bg-white border-[#d1e8dc] text-[#0d2b1e] hover:bg-[#f0f7f3]",
						)}
						title="Toggle Merchant Dossier"
					>
						@{username}
					</button>
				) : (
					<button
						onClick={onOpenUsernameModal}
						className="rounded-full px-4 py-2 text-xs font-medium border border-[#1a9e5c] text-[#1a9e5c] hover:bg-[#f0f7f3] transition-all shadow-sm"
					>
						Set Username
					</button>
				)}

				<button
					onClick={onOpenPostOffer}
					className="rounded-full bg-[#1a9e5c] hover:bg-[#15854c] text-white font-medium px-4 py-2 text-xs shadow-sm transition-all"
				>
					+ Post Offer
				</button>
			</div>
		</header>
	);
}
