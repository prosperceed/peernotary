import Footer from "@/components/shared/Footer";
import Homepage from "@/components/Homepage";

export default function HomePage() {
	return (
		<div className="min-h-screen flex flex-col bg-[#060809]">
			<main className="flex-1">
				<Homepage />
			</main>

			<Footer />
		</div>
	);
}
