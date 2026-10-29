import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/wallet";
import { readEscrowTrade } from "@/lib/oracle/escrow";
import { formatUsdc } from "@/lib/web3/arcConfig";
import { RATE } from "@/lib/utils";
import {
	completePeerTrade,
	createPeerOffer,
	getActivePeerOffers,
	getUserLedger,
	reconcileExpiredTrades,
	takePeerOffer,
} from "@/lib/trades/tradeStore";

export async function GET(request: NextRequest) {
	try {
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		const user = await getAuthenticatedUser(expectedAddress);
		const current = user.walletAddress.toLowerCase();

		reconcileExpiredTrades();
		const transactions = [...getUserLedger(current)];

		// Inspect recent on-chain trade slots 1..10 when RPC is reachable
		const onChainChecks = await Promise.allSettled(
			[1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n].map(async (id) => {
				const trade = await readEscrowTrade(id);
				return { id: id.toString(), trade };
			}),
		);

		for (const item of onChainChecks) {
			if (item.status !== "fulfilled") continue;
			const { id, trade } = item.value;
			const seller = String(trade.seller ?? "").toLowerCase();
			const buyer = String(trade.buyer ?? "").toLowerCase();

			if (
				seller !== "0x0000000000000000000000000000000000000000" &&
				(seller === current || buyer === current)
			) {
				const statusNum = Number(trade.status ?? 0);
				const isCompletedOnChain = statusNum === 3;

				if (isCompletedOnChain) {
					completePeerTrade(id, {
						proofId: String(trade.proofId ?? ""),
						txHash: String(trade.proofId ?? ""),
					});
				}

				if (!transactions.some((t) => t.tradeId === id)) {
					const usdc = formatUsdc(BigInt(trade.cryptoAmount ?? 0n));
					const ngn = Math.round(parseFloat(usdc) * RATE).toLocaleString("en-NG");
					const mappedStatus = isCompletedOnChain
						? "completed"
						: statusNum === 5
							? "disputed"
							: statusNum === 1 || statusNum === 2
								? "escrow"
								: "pending";
					const mappedLifecycle = isCompletedOnChain
						? "COMPLETED"
						: statusNum === 5
							? "DISPUTED"
							: statusNum === 2
								? "PAYMENT_CONFIRMED"
								: statusNum === 1
									? "AWAITING_PAYMENT"
									: "OPEN";

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
						verificationMethod: "Flutterwave Checkout",
						status: mappedStatus,
						lifecycleState: mappedLifecycle,
						txHash: String(trade.proofId ?? "0x0"),
						timestamp: isCompletedOnChain ? "Settled" : mappedLifecycle.replace(/_/g, " "),
					});
				}
			}
		}

		return NextResponse.json({
			authenticated: true,
			user: {
				id: user.id,
				walletAddress: user.walletAddress,
				username: user.username ?? null,
				onboardingCompleted: user.onboardingCompleted,
				createdAt: user.createdAt,
				lastAuthenticatedAt: user.lastAuthenticatedAt,
			},
			transactions,
			peerOffers: getActivePeerOffers(),
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
		const expectedAddress = request.headers.get("x-wallet-address") || undefined;
		const user = await getAuthenticatedUser(expectedAddress);
		const current = user.walletAddress.toLowerCase();
		const body = (await request.json()) as {
			action?: "create_offer" | "take_offer" | "update_status";
			usdcAmount?: string;
			bankName?: string;
			accountNumber?: string;
			side?: "buy" | "sell";
			tradeId?: string;
			status?: "completed" | "escrow" | "disputed" | "pending";
			txHash?: string;
			proofId?: string;
		};

		if (body.action === "create_offer" && body.usdcAmount && body.bankName) {
			const numericUsdc = parseFloat(body.usdcAmount.replace(/,/g, "")) || 0;
			if (numericUsdc <= 0) {
				return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
			}

			const { offer, transaction } = createPeerOffer(user.walletAddress, {
				usdcAmount: numericUsdc,
				bankName: body.bankName,
				accountNumber: body.accountNumber,
				side: body.side,
				txHash: body.txHash,
			});

			return NextResponse.json({
				ok: true,
				offer,
				transaction,
				transactions: getUserLedger(current),
				peerOffers: getActivePeerOffers(),
			});
		}

		if (body.action === "take_offer" && body.tradeId) {
			const activeOffers = getActivePeerOffers();
			const target = activeOffers.find((o) => o.tradeId === body.tradeId);
			if (target && target.peerAddress.toLowerCase() === current) {
				return NextResponse.json(
					{ error: "CANNOT_BUY_OWN_OFFER" },
					{ status: 400 },
				);
			}

			try {
				takePeerOffer(user.walletAddress, body.tradeId, body.txHash);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "OFFER_NOT_FOUND";
				return NextResponse.json(
					{ error: msg },
					{ status: msg === "CANNOT_BUY_OWN_OFFER" ? 400 : 404 },
				);
			}

			return NextResponse.json({
				ok: true,
				transactions: getUserLedger(current),
				peerOffers: getActivePeerOffers(),
			});
		}

		if (body.action === "update_status" && body.tradeId && body.status) {
			if (body.status === "completed") {
				completePeerTrade(body.tradeId, {
					proofId: body.proofId,
					txHash: body.txHash,
				});
			}

			return NextResponse.json({
				ok: true,
				transactions: getUserLedger(current),
				peerOffers: getActivePeerOffers(),
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
