import { NextResponse } from "next/server";

export async function POST() {
	if (!process.env.AUTHENTICATION_PROVIDER || !process.env.DATABASE_URL) {
		return NextResponse.json(
			{
				error: "VERIFICATION_NOT_CONFIGURED",
				message: "Authentication and persistent verification storage are required.",
			},
			{ status: 503 },
		);
	}
	return NextResponse.json(
		{ error: "AUTHENTICATION_PROVIDER_NOT_IMPLEMENTED" },
		{ status: 503 },
	);
}
