import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/web3/Providers";

export const metadata: Metadata = {
	title: "PeerSwap · NGN/USDC Escrow As-a-Service",
	description:
		"B2B2C P2P Crypto-to-Naira platform. Embed secure escrow widgets, manage API keys, and trade with ZK-proof verification on Arc Network.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<Providers>
				<body className="bg-[#080C14] text-slate-50 antialiased">
					{children}
				</body>
			</Providers>
		</html>
	);
}
