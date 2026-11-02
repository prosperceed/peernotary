import { NextRequest, NextResponse } from "next/server";

export interface FlutterwaveBank {
	id: number | string;
	code: string;
	name: string;
}

const COMPREHENSIVE_NIGERIAN_BANKS: FlutterwaveBank[] = [
	{ id: 1, code: "044", name: "Access Bank" },
	{ id: 2, code: "063", name: "Access Bank (Diamond)" },
	{ id: 3, code: "023", name: "Citibank Nigeria" },
	{ id: 4, code: "050", name: "Ecobank Nigeria" },
	{ id: 5, code: "070", name: "Fidelity Bank" },
	{ id: 6, code: "011", name: "First Bank of Nigeria" },
	{ id: 7, code: "214", name: "First City Monument Bank (FCMB)" },
	{ id: 8, code: "00103", name: "Globus Bank" },
	{ id: 9, code: "058", name: "Guaranty Trust Bank (GTBank)" },
	{ id: 10, code: "030", name: "Heritage Bank" },
	{ id: 11, code: "301", name: "Jaiz Bank" },
	{ id: 12, code: "082", name: "Keystone Bank" },
	{ id: 13, code: "090267", name: "Kuda Bank" },
	{ id: 14, code: "303", name: "Lotus Bank" },
	{ id: 15, code: "090405", name: "Moniepoint MFB" },
	{ id: 16, code: "999992", name: "OPay" },
	{ id: 17, code: "107", name: "Optimus Bank" },
	{ id: 18, code: "999991", name: "PalmPay" },
	{ id: 19, code: "104", name: "Parallex Bank" },
	{ id: 20, code: "076", name: "Polaris Bank" },
	{ id: 21, code: "105", name: "PremiumTrust Bank" },
	{ id: 22, code: "101", name: "Providus Bank" },
	{ id: 23, code: "125", name: "Rubies MFB" },
	{ id: 24, code: "106", name: "Signature Bank" },
	{ id: 25, code: "221", name: "Stanbic IBTC Bank" },
	{ id: 26, code: "068", name: "Standard Chartered Bank" },
	{ id: 27, code: "232", name: "Sterling Bank" },
	{ id: 28, code: "100", name: "SunTrust Bank" },
	{ id: 29, code: "302", name: "TAJ Bank" },
	{ id: 30, code: "102", name: "Titan Trust Bank" },
	{ id: 31, code: "032", name: "Union Bank of Nigeria" },
	{ id: 32, code: "033", name: "United Bank for Africa (UBA)" },
	{ id: 33, code: "215", name: "Unity Bank" },
	{ id: 34, code: "090110", name: "VFD Microfinance Bank" },
	{ id: 35, code: "035", name: "Wema Bank" },
	{ id: 36, code: "057", name: "Zenith Bank" },
	{ id: 37, code: "100004", name: "Carbon" },
	{ id: 38, code: "090551", name: "FairMoney MFB" },
	{ id: 39, code: "090325", name: "Sparkle MFB" },
	{ id: 40, code: "090470", name: "Dot MFB" },
	{ id: 41, code: "100002", name: "Paga" },
	{ id: 42, code: "100022", name: "Gomoney" },
	{ id: 43, code: "090175", name: "HighStreet MFB" },
	{ id: 44, code: "090115", name: "TCF MFB" },
	{ id: 45, code: "090393", name: "Shecluded MFB" },
	{ id: 46, code: "090512", name: "Baines Credit MFB" },
	{ id: 47, code: "090136", name: "Microvis MFB" },
	{ id: 48, code: "090171", name: "Mainstreet MFB" },
	{ id: 49, code: "090280", name: "Megapraise MFB" },
	{ id: 50, code: "090298", name: "Federal University of Technology MFB" },
	{ id: 51, code: "090441", name: "Bowen MFB" },
	{ id: 52, code: "090154", name: "QuickFund MFB" },
	{ id: 53, code: "090317", name: "PatrickGold MFB" },
	{ id: 54, code: "090177", name: "Lapo MFB" },
	{ id: 55, code: "090271", name: "Fidelity MFB" },
	{ id: 56, code: "090328", name: "TagPay MFB" },
	{ id: 57, code: "090411", name: "Gig MFB" },
	{ id: 58, code: "090432", name: "Mint MFB" },
	{ id: 59, code: "090133", name: "Al-Barakah MFB" },
	{ id: 60, code: "090262", name: "Amju Unique MFB" },
	{ id: 61, code: "090385", name: "Girei MFB" },
	{ id: 62, code: "090123", name: "Verdant MFB" },
	{ id: 63, code: "090180", name: "Amoye MFB" },
	{ id: 64, code: "090116", name: "Empire MFB" },
	{ id: 65, code: "090156", name: "e-Barcs MFB" },
	{ id: 66, code: "090134", name: "Accion MFB" },
	{ id: 67, code: "090137", name: "PecanTrust MFB" },
	{ id: 68, code: "090141", name: "Chikum MFB" },
	{ id: 69, code: "090143", name: "Apeks MFB" },
	{ id: 70, code: "090144", name: "CIT MFB" },
	{ id: 71, code: "090145", name: "Fullrange MFB" },
	{ id: 72, code: "090146", name: "Trident MFB" },
	{ id: 73, code: "090147", name: "Hackman MFB" },
	{ id: 74, code: "090148", name: "Bowen Microfinance Bank" },
	{ id: 75, code: "090149", name: "FBN Microfinance Bank" },
	{ id: 76, code: "090150", name: "Virtue MFB" },
	{ id: 77, code: "090151", name: "Mutual Trust MFB" },
	{ id: 78, code: "090152", name: "Nagarta MFB" },
	{ id: 79, code: "090153", name: "FFS MFB" },
	{ id: 80, code: "090155", name: "Advans La Fayette MFB" },
];

let cachedBanks: FlutterwaveBank[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory cache

export async function GET(request: NextRequest) {
	const country = request.nextUrl.searchParams.get("country") || "NG";
	const now = Date.now();

	if (cachedBanks && now - cacheTimestamp < CACHE_TTL_MS) {
		return NextResponse.json({
			ok: true,
			source: "cache",
			count: cachedBanks.length,
			banks: cachedBanks,
		});
	}

	const flwBaseUrl = (
		process.env.FLW_BASE_URL ?? "https://api.flutterwave.com/v3"
	).replace(/\/$/, "");
	const flwSecret = process.env.FLW_SECRET_KEY?.trim();

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (flwSecret) {
			headers["Authorization"] = `Bearer ${flwSecret}`;
		}

		const res = await fetch(`${flwBaseUrl}/banks/${encodeURIComponent(country)}`, {
			method: "GET",
			headers,
			signal: AbortSignal.timeout(6000),
			cache: "no-store",
		});

		if (res.ok) {
			const body = (await res.json()) as {
				status?: string;
				data?: Array<{ id: number; code: string; name: string }>;
			};

			if (body.status === "success" && Array.isArray(body.data) && body.data.length > 0) {
				const mergedMap = new Map<string, FlutterwaveBank>();

				for (const item of body.data) {
					if (item && item.name && item.code) {
						mergedMap.set(item.code, {
							id: item.id,
							code: String(item.code).trim(),
							name: String(item.name).trim(),
						});
					}
				}

				for (const fallback of COMPREHENSIVE_NIGERIAN_BANKS) {
					if (!mergedMap.has(fallback.code)) {
						mergedMap.set(fallback.code, fallback);
					}
				}

				const sortedBanks = Array.from(mergedMap.values()).sort((a, b) =>
					a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
				);

				cachedBanks = sortedBanks;
				cacheTimestamp = now;

				return NextResponse.json({
					ok: true,
					source: "flutterwave_api",
					count: sortedBanks.length,
					banks: sortedBanks,
				});
			}
		}
	} catch {
		// Fallback to static comprehensive Nigerian bank registry
	}

	const fallbackSorted = [...COMPREHENSIVE_NIGERIAN_BANKS].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);

	cachedBanks = fallbackSorted;
	cacheTimestamp = now;

	return NextResponse.json({
		ok: true,
		source: "comprehensive_catalog",
		count: fallbackSorted.length,
		banks: fallbackSorted,
	});
}

