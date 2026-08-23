import { NextResponse } from "next/server";

export async function GET() {
	try {
		const response = await fetch("http://127.0.0.1:7047/health", {
			cache: "no-store",
		});

		const result = await response.text();

		return NextResponse.json({
			connected: response.ok,
			tlsnResponse: result,
		});
	} catch (error) {
		return NextResponse.json(
			{
				connected: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
