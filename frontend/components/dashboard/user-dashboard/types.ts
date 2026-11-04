import type { ReactNode } from "react";
import type {
	PeerTradeOffer,
	QueueEntryItem,
	TxCategory,
	TxStatus,
	UserTransaction,
	UserTrustSummary,
} from "@/types";

export type DashboardTab =
	| "overview"
	| "escrows"
	| "transactions"
	| "peers"
	| "create";

export interface NavItem {
	id: DashboardTab;
	label: string;
	icon: ReactNode;
	count?: number;
}

export interface DashboardStats {
	walletUsdc: number;
	walletNgn: number;
	lockedEscrowUsdc: number;
	totalVolumeUsdc: number;
	totalVolumeNgn: number;
	completedCount: number;
}
