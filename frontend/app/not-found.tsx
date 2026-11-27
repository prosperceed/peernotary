import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import WaveLines from "@/components/home/WaveLines";
import Footer from "@/components/shared/Footer";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col">
			<main className="relative flex flex-1 items-center overflow-hidden">
				<WaveLines className="pointer-events-none absolute inset-x-0 top-1/3 h-[420px] w-full" />
				<div className="relative mx-auto w-full max-w-6xl px-6 py-20">
					<p className="kicker">Error 404</p>
					<h1 className="mt-5 max-w-xl text-[38px] font-bold leading-[1.1] text-ink sm:text-[48px]">
						This page isn&apos;t in escrow.
					</h1>
					<p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-2">
						The link may be old, or the page has moved. Your trades and funds are unaffected.
					</p>
					<div className="mt-9 flex flex-wrap gap-3">
						<Link href="/" className="btn-primary h-11 px-5">
							<ArrowLeft size={15} />
							Back to home
						</Link>
						<Link href="/trade" className="btn-secondary h-11 px-5">
							Trading desk
							<ArrowRight size={15} />
						</Link>
						<Link href="/docs" className="btn-ghost h-11 px-4">
							<BookOpen size={15} />
							Docs
						</Link>
					</div>
				</div>
				<span
					aria-hidden
					className="pointer-events-none absolute -right-6 bottom-6 select-none font-display text-[180px] font-bold leading-none text-accent/[0.06] sm:text-[260px]"
				>
					404
				</span>
			</main>
			<Footer />
		</div>
	);
}
