import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/web3/Providers";
import GlobalNav from "@/components/shared/GlobalNav";
import PostHogAnalytics from "@/components/analytics/PostHogAnalytics";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	weight: ["500", "600", "700"],
	variable: "--font-display",
	display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
	title: {
		default: "PeerNotary · USDC to fiat, settled on proof",
		template: "%s · PeerNotary",
	},
	description:
		"Peer-to-peer USDC and fiat trading. The seller's USDC is held in escrow on Arc and released only when the buyer's bank payment is proven.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${inter.variable} ${jakarta.variable} ${mono.variable}`}>
			<body className="bg-canvas text-ink antialiased">
				<Providers>
					<PostHogAnalytics />
					<GlobalNav />
					{children}
				</Providers>
			</body>
		</html>
	);
}
