import { RATE } from "@/lib/utils";
import type { PeerTradeOffer, UserTransaction } from "@/types";

export interface SharedTrade {
	tradeId: string;
	sellerAddress: string;
	buyerAddress?: string;
	side: "sell" | "buy";
	usdcAmount: string;
	ngnAmount: string;
	rateNgn: number;
	bankName: string;
	requiredCollateralUsdc: string;
	status: "open" | "escrow" | "completed" | "disputed";
	proofId?: string;
	txHash?: string;
	createdAt: string;
}

const initialPeerOffers: PeerTradeOffer[] = [
	{
		tradeId: "104",
		peerHandle: "OluwaseunAd_Arc",
		peerAddress: "0x8C4b1A7E290d5f1c3E4802a9B7F510293847561a",
		side: "sell",
		availableUsdc: "1,250.00",
		ngnAmount: "₦2,037,500",
		rateNgn: 1630,
		minLimitUsdc: "50.00",
		maxLimitUsdc: "1,250.00",
		requiredCollateralUsdc: "50.00",
		bankName: "GTBank",
		completionRate: "99.4%",
		completedTrades: 482,
		avgReleaseTime: "4.2s",
		createdAt: "4m ago",
	},
	{
		tradeId: "103",
		peerHandle: "kemi_liquidity",
		peerAddress: "0x4F902c18a3D74E9b621a0987C43120bA9823dE11",
		side: "sell",
		availableUsdc: "480.00",
		ngnAmount: "₦781,440",
		rateNgn: 1628,
		minLimitUsdc: "50.00",
		maxLimitUsdc: "480.00",
		requiredCollateralUsdc: "50.00",
		bankName: "OPay",
		completionRate: "99.8%",
		completedTrades: 914,
		avgReleaseTime: "3.6s",
		createdAt: "11m ago",
	},
	{
		tradeId: "102",
		peerHandle: "tunde_fx",
		peerAddress: "0x2E71B4A8d90C1123456789aBcDeF0123456789C2",
		side: "sell",
		availableUsdc: "3,000.00",
		ngnAmount: "₦4,896,000",
		rateNgn: 1632,
		minLimitUsdc: "200.00",
		maxLimitUsdc: "3,000.00",
		requiredCollateralUsdc: "50.00",
		bankName: "Access Bank",
		completionRate: "98.9%",
		completedTrades: 319,
		avgReleaseTime: "5.1s",
		createdAt: "19m ago",
	},
	{
		tradeId: "101",
		peerHandle: "amina_desk",
		peerAddress: "0x9A12c34D56e78F90123456789aBCdEf01234567D",
		side: "buy",
		availableUsdc: "850.00",
		ngnAmount: "₦1,382,100",
		rateNgn: 1626,
		minLimitUsdc: "100.00",
		maxLimitUsdc: "850.00",
		requiredCollateralUsdc: "50.00",
		bankName: "Zenith Bank",
		completionRate: "99.2%",
		completedTrades: 267,
		avgReleaseTime: "4.7s",
		createdAt: "27m ago",
	},
	{
		tradeId: "100",
		peerHandle: "chinedu_arc",
		peerAddress: "0x6D44e55F66a77B88c99D00e11F22a33B44c55D66",
		side: "sell",
		availableUsdc: "620.00",
		ngnAmount: "₦1,010,600",
		rateNgn: 1630,
		minLimitUsdc: "50.00",
		maxLimitUsdc: "620.00",
		requiredCollateralUsdc: "50.00",
		bankName: "Moniepoint",
		completionRate: "99.6%",
		completedTrades: 605,
		avgReleaseTime: "3.9s",
		createdAt: "34m ago",
	},
];

// In-memory singletons for the session
const userLedgerStore = new Map<string, UserTransaction[]>();
const sharedTradesMap = new Map<string, SharedTrade>();
const activePeerOffers: PeerTradeOffer[] = [...initialPeerOffers];

// Seed initial peer offers in shared registry
for (const off of initialPeerOffers) {
	sharedTradesMap.set(off.tradeId, {
		tradeId: off.tradeId,
		sellerAddress: off.peerAddress.toLowerCase(),
		side: off.side,
		usdcAmount: off.availableUsdc,
		ngnAmount: off.ngnAmount,
		rateNgn: off.rateNgn,
		bankName: off.bankName,
		requiredCollateralUsdc: off.requiredCollateralUsdc,
		status: "open",
		createdAt: off.createdAt,
	});
}

function shortAddress(addr: string): string {
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function getActivePeerOffers(): PeerTradeOffer[] {
	return activePeerOffers;
}

export function getUserLedger(address: string): UserTransaction[] {
	const key = address.toLowerCase();
	const existing = userLedgerStore.get(key);
	if (existing) return existing;
	const fresh: UserTransaction[] = [];
	userLedgerStore.set(key, fresh);
	return fresh;
}

export function createPeerOffer(
	sellerAddress: string,
	params: {
		usdcAmount: number;
		bankName: string;
		side?: "sell" | "buy";
		txHash?: string;
	},
): { offer: PeerTradeOffer; transaction: UserTransaction } {
	const sAddr = sellerAddress.toLowerCase();
	const newTradeId = String(105 + sharedTradesMap.size);
	const formattedUsdc = params.usdcAmount.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const formattedNgn = `₦${Math.round(params.usdcAmount * RATE).toLocaleString("en-NG")}`;

	const sellerLedger = getUserLedger(sAddr);

	const offer: PeerTradeOffer = {
		tradeId: newTradeId,
		peerHandle: shortAddress(sellerAddress),
		peerAddress: sellerAddress,
		side: params.side ?? "sell",
		availableUsdc: formattedUsdc,
		ngnAmount: formattedNgn,
		rateNgn: RATE,
		minLimitUsdc: "50.00",
		maxLimitUsdc: formattedUsdc,
		requiredCollateralUsdc: "50.00",
		bankName: params.bankName,
		completionRate: "100%",
		completedTrades: sellerLedger.filter((t) => t.status === "completed").length,
		avgReleaseTime: "4.1s",
		createdAt: "Just now",
	};

	activePeerOffers.unshift(offer);

	sharedTradesMap.set(newTradeId, {
		tradeId: newTradeId,
		sellerAddress: sAddr,
		side: params.side ?? "sell",
		usdcAmount: formattedUsdc,
		ngnAmount: formattedNgn,
		rateNgn: RATE,
		bankName: params.bankName,
		requiredCollateralUsdc: "50.00",
		status: "open",
		txHash: params.txHash,
		createdAt: "Just now",
	});

	const sellerTx: UserTransaction = {
		id: `TX-${newTradeId}-S`,
		tradeId: newTradeId,
		type: params.side === "buy" ? "buy" : "sell",
		role: params.side === "buy" ? "buyer" : "seller",
		counterparty: "Open Peer Market",
		counterpartyAddress: "0x5042f1114C6F272f5909f16510399986EF0D734D",
		usdcAmount: formattedUsdc,
		ngnAmount: formattedNgn,
		bankName: params.bankName,
		verificationMethod: "On-Chain Escrow",
		status: "pending",
		txHash: params.txHash ?? "0x0",
		timestamp: "Just now",
	};
	sellerLedger.unshift(sellerTx);

	return { offer, transaction: sellerTx };
}

export function takePeerOffer(
	buyerAddress: string,
	tradeId: string,
	txHash?: string,
): { tradeTx: UserTransaction; collateralTx: UserTransaction } {
	const bAddr = buyerAddress.toLowerCase();
	const shared = sharedTradesMap.get(tradeId);
	if (!shared) {
		throw new Error("OFFER_NOT_FOUND");
	}

	shared.buyerAddress = bAddr;
	shared.status = "escrow";
	if (txHash) shared.txHash = txHash;

	// Update seller's ledger (Seller end)
	const sAddr = shared.sellerAddress;
	const sellerLedger = getUserLedger(sAddr);
	const existingSellerTx = sellerLedger.find((t) => t.tradeId === tradeId && t.role === "seller");
	if (existingSellerTx) {
		existingSellerTx.status = "escrow";
		existingSellerTx.counterparty = shortAddress(buyerAddress);
		existingSellerTx.counterpartyAddress = buyerAddress;
		existingSellerTx.timestamp = "In Escrow";
	} else {
		sellerLedger.unshift({
			id: `TX-${tradeId}-S`,
			tradeId,
			type: "sell",
			role: "seller",
			counterparty: shortAddress(buyerAddress),
			counterpartyAddress: buyerAddress,
			usdcAmount: shared.usdcAmount,
			ngnAmount: shared.ngnAmount,
			bankName: shared.bankName,
			verificationMethod: "TLSNotary ZK",
			status: "escrow",
			txHash: txHash ?? "0x0",
			timestamp: "In Escrow",
		});
	}

	// Update buyer's ledger (Buyer end)
	const buyerLedger = getUserLedger(bAddr);
	const collateralTx: UserTransaction = {
		id: `TX-${tradeId}-COL`,
		tradeId,
		type: "collateral",
		role: "buyer",
		counterparty: shortAddress(shared.sellerAddress),
		counterpartyAddress: shared.sellerAddress,
		usdcAmount: shared.requiredCollateralUsdc,
		ngnAmount: `₦${Math.round(parseFloat(shared.requiredCollateralUsdc) * shared.rateNgn).toLocaleString("en-NG")}`,
		bankName: shared.bankName,
		verificationMethod: "On-Chain Escrow",
		status: "escrow",
		txHash: txHash ?? "0x0",
		timestamp: "In Escrow",
	};

	const tradeTx: UserTransaction = {
		id: `TX-${tradeId}-B`,
		tradeId,
		type: shared.side === "sell" ? "buy" : "sell",
		role: shared.side === "sell" ? "buyer" : "seller",
		counterparty: shortAddress(shared.sellerAddress),
		counterpartyAddress: shared.sellerAddress,
		usdcAmount: shared.usdcAmount,
		ngnAmount: shared.ngnAmount,
		bankName: shared.bankName,
		verificationMethod: "TLSNotary ZK",
		status: "escrow",
		txHash: txHash ?? "0x0",
		timestamp: "In Escrow",
	};

	buyerLedger.unshift(tradeTx, collateralTx);

	return { tradeTx, collateralTx };
}

export function completePeerTrade(
	tradeId: string,
	params?: {
		proofId?: string;
		txHash?: string;
	},
): void {
	// 1. Remove the settled offer from the publishing list
	const offIdx = activePeerOffers.findIndex((o) => o.tradeId === tradeId);
	if (offIdx !== -1) {
		activePeerOffers.splice(offIdx, 1);
	}

	// 2. Mark shared trade as completed
	const shared = sharedTradesMap.get(tradeId);
	if (shared) {
		shared.status = "completed";
		if (params?.proofId) shared.proofId = params.proofId;
		if (params?.txHash) shared.txHash = params.txHash;
	}

	// 3. Mark completed across ALL user ledgers (both Buyer AND Seller ends)
	for (const ledger of userLedgerStore.values()) {
		for (const tx of ledger) {
			if (tx.tradeId === tradeId) {
				tx.status = "completed";
				if (params?.proofId) tx.proofId = params.proofId;
				if (params?.txHash) tx.txHash = params.txHash;
				tx.timestamp = "Completed";
			}
		}
	}
}
