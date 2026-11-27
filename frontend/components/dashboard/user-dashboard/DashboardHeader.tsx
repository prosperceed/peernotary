"use client";

import { motion } from "framer-motion";
import { AtSign, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
	username: string | null;
	showDossier: boolean;
	setShowDossier: (show: boolean) => void;
	onOpenUsernameModal: () => void;
	onOpenPostOffer: () => void;
}

function greeting() {
	const h = new Date().getHours();
	return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardHeader({
	username,
	showDossier,
	setShowDossier,
	onOpenUsernameModal,
	onOpenPostOffer,
}: DashboardHeaderProps) {
	return (
		<motion.header
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
			className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
		>
			<div className="hidden md:block">
				<p className="text-sm text-ink-3" suppressHydrationWarning>
					{greeting()}
					{username ? `, @${username}` : ""}
				</p>
				<h1 className="mt-1 text-2xl font-semibold text-ink">Your trading desk</h1>
			</div>

			<div className="flex items-center gap-2.5">
				{username ? (
					<button
						onClick={() => setShowDossier(!showDossier)}
						className={cn("btn-secondary h-10 rounded-full px-4 font-mono text-xs", showDossier && "border-accent/40 bg-accent/10")}
						title="Merchant dossier"
					>
						<AtSign size={14} />
						{username}
					</button>
				) : (
					<button onClick={onOpenUsernameModal} className="btn-secondary h-10 rounded-full px-4 text-xs">
						<AtSign size={14} />
						Set username
					</button>
				)}
				<button onClick={onOpenPostOffer} className="btn-primary h-10 rounded-full px-4 text-xs shadow-glow">
					<Plus size={15} />
					Post offer
				</button>
			</div>
		</motion.header>
	);
}
