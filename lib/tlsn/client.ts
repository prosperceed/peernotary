import "server-only";

const verifierUrl = (): string => {
	const value = process.env.TLSN_VERIFIER_URL;
	if (!value) throw new Error("Missing required server configuration: TLSN_VERIFIER_URL");
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("TLSN_VERIFIER_URL must use HTTP or HTTPS");
	}
	return url.toString().replace(/\/$/, "");
};

export interface TlsnSessionMetadata {
	verificationId: string;
	tradeId: string;
	purpose: "payment_verification";
}

export async function verifierHealth(): Promise<boolean> {
	try {
		const response = await fetch(`${verifierUrl()}/health`, {
			cache: "no-store",
			signal: AbortSignal.timeout(5_000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

export function getVerifierUrl(): string {
	return verifierUrl();
}
