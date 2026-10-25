import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";
import { readEscrowTrade } from "@/lib/oracle/escrow";
import { formatUsdc } from "@/lib/web3/arcConfig";
import { RATE } from "@/lib/utils";
import type { PeerTradeOffer, UserTransaction } from "@/types";

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

const userLedgerStore = new Map<string, UserTransaction[]>();
const peerOfferStore: PeerTradeOffer[] = [...initialPeerOffers];

function seedUserTransactions(address: string): UserTransaction[] {
	const key = address.toLowerCase();
	const existing = userLedgerStore.get(key);
	if (existing) return existing;

	const seeded: UserTransaction[] = [
		{
			id: "TX-9042",
			tradeId: "42",
			type: "buy",
			role: "buyer",
			counterparty: "OluwaseunAd_Arc",
			counterpartyAddress: "0x8C4b1A7E290d5f1c3E4802a9B7F510293847561a",
			usdcAmount: "306.75",
			ngnAmount: "₦500,000",
			bankName: "GTBank",
			verificationMethod: "TLSNotary ZK",
			status: "escrow",
			txHash: "0x7fa3c8b21940e219d8f4a72c5e61b03c91a4e72b8d10234a90c12f8e3d901e2b",
			timestamp: "6m ago",
		},
		{
			id: "TX-9041",
			tradeId: "42",
			type: "collateral",
			role: "buyer",
			counterparty: "Arc Escrow Vault",
			counterpartyAddress: "0x5042f1114C6F272f5909f16510399986EF0D734D",
			usdcAmount: "50.00",
			ngnAmount: "₦81,500",
			bankName: "GTBank",
			verificationMethod: "On-Chain Escrow",
			status: "completed",
			txHash: "0x4e81b20c9a3f7128d4051e7a6b92c3018f4d5e6a7b8c9d0e1f2a3b4c5d6e7f80",
			timestamp: "7m ago",
		},
		{
			id: "TX-9038",
			tradeId: "39",
			type: "buy",
			role: "buyer",
			counterparty: "kemi_liquidity",
			counterpartyAddress: "0x4F902c18a3D74E9b621a0987C43120bA9823dE11",
			usdcAmount: "613.50",
			ngnAmount: "₦1,000,000",
			bankName: "OPay",
			verificationMethod: "TLSNotary ZK",
			status: "completed",
			txHash: "0x9b12d4e6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2",
			proofId: "0x3c91f482a0e1b72940c82e19a7b63d504f1e2d3c4b5a69788796a5b4c3d2e1f0",
			timestamp: "2h ago",
		},
		{
			id: "TX-9035",
			tradeId: "36",
			type: "sell",
			role: "seller",
			counterparty: "chidi.arc",
			counterpartyAddress: "0x3B11a22C33d44E55f66A77b88C99d00E11f22A33",
			usdcAmount: "460.12",
			ngnAmount: "₦750,000",
			bankName: "Access Bank",
			verificationMethod: "Open Banking",
			status: "completed",
			txHash: "0x1d3f5a7c9e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f",
			proofId: "0x8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
			timestamp: "1d ago",
		},
		{
			id: "TX-9031",
			tradeId: "31",
			type: "release",
			role: "buyer",
			counterparty: "tunde_fx",
			counterpartyAddress: "0x2E71B4A8d90C1123456789aBcDeF0123456789C2",
			usdcAmount: "1,287.73",
			ngnAmount: "₦2,100,000",
			bankName: "GTBank",
			verificationMethod: "TLSNotary ZK",
			status: "completed",
			txHash: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
			proofId: "0x2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e",
			timestamp: "3d ago",
		},
		{
			id: "TX-9024",
			tradeId: "24",
			type: "dispute",
			role: "seller",
			counterparty: "fatima_w",
			counterpartyAddress: "0x7C88d99E00f11A22b33C44d55E66f77A88b99C00",
			usdcAmount: "214.72",
			ngnAmount: "₦350,000",
			bankName: "Zenith Bank",
			verificationMethod: "TLSNotary ZK",
			status: "disputed",
			txHash: "0x6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
			timestamp: "5d ago",
		},
	];

	userLedgerStore.set(key, seeded);
	return seeded;
}

export async function GET() {
	try {
		const user = await getAuthenticatedUser();
		const transactions = [...seedUserTransactions(user.walletAddress)];

		// Inspect recent on-chain trade slots 1..5 when RPC is reachable
		const onChainChecks = await Promise.allSettled(
			[1n, 2n, 3n].map(async (id) => {
				const trade = await readEscrowTrade(id);
				return { id: id.toString(), trade };
			}),
		);

		for (const item of onChainChecks) {
			if (item.status !== "fulfilled") continue;
			const { id, trade } = item.value;
			const seller = String(trade.seller ?? "").toLowerCase();
			const buyer = String(trade.buyer ?? "").toLowerCase();
			const current = user.walletAddress.toLowerCase();

			if (
				seller !== "0x0000000000000000000000000000000000000000" &&
				(seller === current || buyer === current) &&
				!transactions.some((t) => t.tradeId === id)
			) {
				const usdc = formatUsdc(BigInt(trade.cryptoAmount ?? 0n));
				const ngn = Math.round(parseFloat(usdc) * RATE).toLocaleString("en-NG");
				const statusNum = Number(trade.status ?? 0);
				const mappedStatus =
					statusNum === 3
						? "completed"
						: statusNum === 5
						? "disputed"
						: statusNum === 1 || statusNum === 2
						? "escrow"
						: "pending";

				transactions.unshift({
					id: `ONCHAIN-${id}`,
					tradeId: id,
					type: buyer === current ? "buy" : "sell",
					role: buyer === current ? "buyer" : "seller",
					counterparty:
						buyer === current
							? `${trade.seller.slice(0, 6)}…${trade.seller.slice(-4)}`
							: `${trade.buyer.slice(0, 6)}…${trade.buyer.slice(-4)}`,
					counterpartyAddress:
						buyer === current ? String(trade.seller) : String(trade.buyer),
					usdcAmount: usdc,
					ngnAmount: `₦${ngn}`,
					bankName: "Arc Escrow",
					verificationMethod: "TLSNotary ZK",
					status: mappedStatus,
					txHash: String(trade.proofId ?? "0x0"),
					timestamp: "On-chain",
				});
			}
		}

		return NextResponse.json({
			authenticated: true,
			user: {
				walletAddress: user.walletAddress,
				createdAt: user.createdAt,
				lastAuthenticatedAt: user.lastAuthenticatedAt,
			},
			transactions,
			peerOffers: peerOfferStore,
		});
	} catch {
		return NextResponse.json(
			{ authenticated: false, error: "AUTHENTICATION_REQUIRED" },
			{ status: 401 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const user = await getAuthenticatedUser();
		const body = (await request.json()) as {
			action?: "create_offer" | "take_offer" | "update_status";
			usdcAmount?: string;
			bankName?: string;
			side?: "buy" | "sell";
			tradeId?: string;
			status?: "completed" | "escrow" | "disputed" | "pending";
			txHash?: string;
			proofId?: string;
		};

		const ledger = seedUserTransactions(user.walletAddress);

		if (body.action === "create_offer" && body.usdcAmount && body.bankName) {
			const numericUsdc = parseFloat(body.usdcAmount.replace(/,/g, "")) || 0;
			if (numericUsdc <= 0) {
				return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
			}
			const newTradeId = String(105 + peerOfferStore.length);
			const formattedUsdc = numericUsdc.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
			const formattedNgn = `₦${Math.round(numericUsdc * RATE).toLocaleString("en-NG")}`;

			const offer: PeerTradeOffer = {
				tradeId: newTradeId,
				peerHandle: `${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}`,
				peerAddress: user.walletAddress,
				side: body.side ?? "sell",
				availableUsdc: formattedUsdc,
				ngnAmount: formattedNgn,
				rateNgn: RATE,
				minLimitUsdc: "50.00",
				maxLimitUsdc: formattedUsdc,
				requiredCollateralUsdc: "50.00",
				bankName: body.bankName,
				completionRate: "100%",
				completedTrades: ledger.filter((t) => t.status === "completed").length,
				avgReleaseTime: "4.1s",
				createdAt: "Just now",
			};

			peerOfferStore.unshift(offer);

			const newTx: UserTransaction = {
				id: `TX-${9050 + ledger.length}`,
				tradeId: newTradeId,
				type: body.side === "buy" ? "buy" : "sell",
				role: body.side === "buy" ? "buyer" : "seller",
				counterparty: "Open Peer Market",
				counterpartyAddress: "0x5042f1114C6F272f5909f16510399986EF0D734D",
				usdcAmount: formattedUsdc,
				ngnAmount: formattedNgn,
				bankName: body.bankName,
				verificationMethod: "On-Chain Escrow",
				status: "pending",
				txHash:
					body.txHash ??
					"0x8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e",
				timestamp: "Just now",
			};
			ledger.unshift(newTx);

			return NextResponse.json({
				ok: true,
				offer,
				transaction: newTx,
				transactions: ledger,
				peerOffers: peerOfferStore,
			});
		}

		if (body.action === "take_offer" && body.tradeId) {
			const offer = peerOfferStore.find((o) => o.tradeId === body.tradeId);
			if (!offer) {
				return NextResponse.json({ error: "OFFER_NOT_FOUND" }, { status: 404 });
			}

			const collateralTx: UserTransaction = {
				id: `TX-${9050 + ledger.length}`,
				tradeId: offer.tradeId,
				type: "collateral",
				role: "buyer",
				counterparty: offer.peerHandle,
				counterpartyAddress: offer.peerAddress,
				usdcAmount: offer.requiredCollateralUsdc,
				ngnAmount: `₦${Math.round(parseFloat(offer.requiredCollateralUsdc) * offer.rateNgn).toLocaleString("en-NG")}`,
				bankName: offer.bankName,
				verificationMethod: "On-Chain Escrow",
				status: "completed",
				txHash:
					body.txHash ??
					"0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
				timestamp: "Just now",
			};

			const tradeTx: UserTransaction = {
				id: `TX-${9051 + ledger.length}`,
				tradeId: offer.tradeId,
				type: offer.side === "sell" ? "buy" : "sell",
				role: offer.side === "sell" ? "buyer" : "seller",
				counterparty: offer.peerHandle,
				counterpartyAddress: offer.peerAddress,
				usdcAmount: offer.availableUsdc,
				ngnAmount: offer.ngnAmount,
				bankName: offer.bankName,
				verificationMethod: "TLSNotary ZK",
				status: "escrow",
				txHash:
					body.txHash ??
					"0x7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c",
				timestamp: "Just now",
			};

			ledger.unshift(tradeTx, collateralTx);

			return NextResponse.json({
				ok: true,
				transactions: ledger,
				peerOffers: peerOfferStore,
			});
		}

		if (body.action === "update_status" && body.tradeId && body.status) {
			for (const tx of ledger) {
				if (tx.tradeId === body.tradeId && tx.type !== "collateral") {
					tx.status = body.status;
					if (body.proofId) tx.proofId = body.proofId;
					if (body.txHash) tx.txHash = body.txHash;
					tx.timestamp = "Just now";
				}
			}
			return NextResponse.json({
				ok: true,
				transactions: ledger,
				peerOffers: peerOfferStore,
			});
		}

		return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
	} catch {
		return NextResponse.json(
			{ authenticated: false, error: "AUTHENTICATION_REQUIRED" },
			{ status: 401 },
		);
	}
}

