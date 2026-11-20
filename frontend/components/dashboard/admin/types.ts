export interface AdminMetrics {
	totalVolumeUsdcUnits: string;
	totalVolumeFiatMinor: string;
	completedTransactions: number;
	queuedTransactions: number;
	activeEscrows: number;
	totalEscrowUsdcUnits: string;
	treasuryUsdcUnits: string;
	platformFeesUsdcUnits: string;
	totalUsers: number;
}

export interface AdminTransaction {
	id: string;
	sellerAddress: string;
	buyerAddress: string | null;
	usdcAmountUnits: string;
	fiatAmountMinor: string;
	fiatCurrency: string;
	status: string;
	paymentState: string;
	escrowState: string;
	txHash: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AdminOverview {
	updatedAt: string;
	metrics: AdminMetrics;
	activity: { day: string; transactions: number; volumeUsdcUnits: string }[];
	recentTransactions: AdminTransaction[];
}

export interface AdminAnalytics {
	daily: { day: string; pageviews: number; visitors: number }[];
	regions: { region: string; pageviews: number; visitors: number }[];
	totalVisitors: number;
	totalPageviews: number;
}
