import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/web3/Providers";
import GlobalNav from "@/components/shared/GlobalNav";

export const metadata: Metadata = {
	title: "PeerNotary · P2P As-a-Service",
	description:
		"P2P Crypto-to-Fiat platform. Embedded secure escrow, and trade with ZK-proof verification on Arc Network.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<Providers>
				<body className="bg-[#060809] text-slate-50 antialiased">
					<GlobalNav />
					{children}
				</body>
			</Providers>
		</html>
	);
}
