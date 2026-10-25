"use client";

import HeroSection from "@/components/home/HeroSection";
import HowItWorks from "@/components/home/HowItWorks";
import ApiWorkflow from "@/components/home/ApiWorkflow";
import MetricsBanner from "@/components/home/MetricsBanner";

export default function Homepage() {
	return (
		<div className="min-h-screen bg-[#f5f9f7]">
			<HeroSection />
			<HowItWorks />
			<ApiWorkflow />
			<MetricsBanner />
		</div>
	);
}
