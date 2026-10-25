export type ViewMode = "dev" | "trader";
export type View = "home" | "trade" | "dev" | "dashboard";
export type TradeStep = 0 | 1 | 2 | 3;
export type VerifyMode = "bank" | "zk" | null;
export type TxStatus = "completed" | "escrow" | "disputed" | "pending";
export type TxCategory =
	| "buy"
	| "sell"
	| "collateral"
	| "release"
	| "dispute";
export type BadgeColor =
	| "violet"
	| "green"
	| "amber"
	| "red"
	| "blue"
	| "slate"
	| "cyan";

export interface Transaction {
	id: string;
	buyer: string;
	ngnAmount: string;
	usdc: string;
	status: TxStatus;
	time: string;
}

export interface UserTransaction {
	id: string;
	tradeId: string;
	type: TxCategory;
	role: "buyer" | "seller";
	counterparty: string;
	counterpartyAddress: string;
	usdcAmount: string;
	ngnAmount: string;
	bankName: string;
	verificationMethod: "TLSNotary ZK" | "Open Banking" | "On-Chain Escrow";
	status: TxStatus;
	txHash: string;
	proofId?: string;
	timestamp: string;
}

export interface PeerTradeOffer {
	tradeId: string;
	peerHandle: string;
	peerAddress: string;
	side: "buy" | "sell";
	availableUsdc: string;
	ngnAmount: string;
	rateNgn: number;
	minLimitUsdc: string;
	maxLimitUsdc: string;
	requiredCollateralUsdc: string;
	bankName: string;
	completionRate: string;
	completedTrades: number;
	avgReleaseTime: string;
	createdAt: string;
}

export interface ChatMessage {
	from: "buyer" | "seller" | "system";
	text: string;
	time: string;
	danger?: boolean;
}

export interface EscrowState {
	sellerLocked: string;
	buyerCollateral: string;
	arcStatus: "Secured" | "Pending" | "Released";
	verificationMethod: string;
}
