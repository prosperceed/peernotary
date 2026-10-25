import Footer from "@/components/shared/Footer";
import Homepage from "@/components/Homepage";

export default function HomePage() {
	return (
		<div className="min-h-screen flex flex-col bg-[#f5f9f7]">
			<main className="flex-1">
				<Homepage />
			</main>
			<Footer />
		</div>
	);
}
