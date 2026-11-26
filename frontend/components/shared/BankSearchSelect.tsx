"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Landmark, Search, ChevronDown, Check, X } from "lucide-react";

export interface BankItem {
	id: number | string;
	code: string;
	name: string;
}

interface BankSearchSelectProps {
	value: string;
	onChange: (bankName: string, bankCode?: string) => void;
	placeholder?: string;
	allowAll?: boolean;
	allLabel?: string;
	compact?: boolean;
	disabled?: boolean;
	className?: string;
	label?: string;
}

// Module-level cache so all instances share the loaded list without repeated fetches
let cachedBankList: BankItem[] | null = null;
let isFetchingBanks = false;
const listeners: Array<(banks: BankItem[]) => void> = [];

const POPULAR_BANK_NAMES = [
	"OPay",
	"PalmPay",
	"Guaranty Trust Bank (GTBank)",
	"Moniepoint MFB",
	"Kuda Bank",
	"Access Bank",
	"Zenith Bank",
	"United Bank for Africa (UBA)",
	"First Bank of Nigeria",
];

const FINTECH_KEYWORDS = [
	"opay",
	"palmpay",
	"moniepoint",
	"kuda",
	"carbon",
	"fairmoney",
	"dot",
	"sparkle",
	"paga",
	"vfd",
	"rubies",
];

const INITIAL_FALLBACK_BANKS: BankItem[] = [
	{ id: 1, code: "044", name: "Access Bank" },
	{ id: 2, code: "023", name: "Citibank Nigeria" },
	{ id: 3, code: "050", name: "Ecobank Nigeria" },
	{ id: 4, code: "070", name: "Fidelity Bank" },
	{ id: 5, code: "011", name: "First Bank of Nigeria" },
	{ id: 6, code: "214", name: "First City Monument Bank (FCMB)" },
	{ id: 7, code: "058", name: "Guaranty Trust Bank (GTBank)" },
	{ id: 8, code: "030", name: "Heritage Bank" },
	{ id: 9, code: "301", name: "Jaiz Bank" },
	{ id: 10, code: "082", name: "Keystone Bank" },
	{ id: 11, code: "090267", name: "Kuda Bank" },
	{ id: 12, code: "303", name: "Lotus Bank" },
	{ id: 13, code: "090405", name: "Moniepoint MFB" },
	{ id: 14, code: "999992", name: "OPay" },
	{ id: 15, code: "107", name: "Optimus Bank" },
	{ id: 16, code: "999991", name: "PalmPay" },
	{ id: 17, code: "104", name: "Parallex Bank" },
	{ id: 18, code: "076", name: "Polaris Bank" },
	{ id: 19, code: "105", name: "PremiumTrust Bank" },
	{ id: 20, code: "101", name: "Providus Bank" },
	{ id: 21, code: "221", name: "Stanbic IBTC Bank" },
	{ id: 22, code: "068", name: "Standard Chartered Bank" },
	{ id: 23, code: "232", name: "Sterling Bank" },
	{ id: 24, code: "032", name: "Union Bank of Nigeria" },
	{ id: 25, code: "033", name: "United Bank for Africa (UBA)" },
	{ id: 26, code: "215", name: "Unity Bank" },
	{ id: 27, code: "090110", name: "VFD Microfinance Bank" },
	{ id: 28, code: "035", name: "Wema Bank" },
	{ id: 29, code: "057", name: "Zenith Bank" },
];

export function BankSearchSelect({
	value,
	onChange,
	placeholder = "Select settlement bank...",
	allowAll = false,
	allLabel = "All Banks",
	compact = false,
	disabled = false,
	className = "",
}: BankSearchSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeCategory, setActiveCategory] = useState<"all" | "popular" | "fintech">("all");
	const [banks, setBanks] = useState<BankItem[]>(cachedBankList || INITIAL_FALLBACK_BANKS);
	const [loading, setLoading] = useState(false);

	const containerRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Load banks from API
	useEffect(() => {
		if (cachedBankList && cachedBankList.length > 0) {
			setBanks(cachedBankList);
			return;
		}

		const handleNewBanks = (loaded: BankItem[]) => {
			setBanks(loaded);
		};

		listeners.push(handleNewBanks);

		if (!isFetchingBanks) {
			isFetchingBanks = true;
			setLoading(true);

			fetch("/api/banks")
				.then((res) => {
					if (!res.ok) throw new Error("Failed to load banks");
					return res.json();
				})
				.then((data) => {
					if (data?.banks && Array.isArray(data.banks) && data.banks.length > 0) {
						cachedBankList = data.banks;
						for (const listener of listeners) {
							listener(data.banks);
						}
					}
				})
				.catch((err) => {
					console.warn("Using fallback bank list:", err);
				})
				.finally(() => {
					setLoading(false);
					isFetchingBanks = false;
				});
		}

		return () => {
			const idx = listeners.indexOf(handleNewBanks);
			if (idx > -1) {
				listeners.splice(idx, 1);
			}
		};
	}, []);

	// Click outside listener
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			// Auto focus search input when opened
			setTimeout(() => {
				searchInputRef.current?.focus();
			}, 50);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isOpen) {
				setIsOpen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	// Filtered banks based on query and category
	const filteredBanks = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();

		return banks.filter((b) => {
			// Category filter
			if (activeCategory === "popular") {
				const isPop = POPULAR_BANK_NAMES.some(
					(p) =>
						p.toLowerCase().includes(b.name.toLowerCase()) ||
						b.name.toLowerCase().includes(p.toLowerCase()),
				);
				if (!isPop) return false;
			} else if (activeCategory === "fintech") {
				const isFin = FINTECH_KEYWORDS.some((kw) =>
					b.name.toLowerCase().includes(kw),
				);
				if (!isFin) return false;
			}

			// Search query match
			if (!query) return true;
			return (
				b.name.toLowerCase().includes(query) ||
				b.code.toLowerCase().includes(query)
			);
		});
	}, [banks, searchQuery, activeCategory]);

	// Display text for the currently selected value
	const displayValue = useMemo(() => {
		if (allowAll && (!value || value === "all")) {
			return allLabel;
		}
		if (!value) return placeholder;

		// Find exact match or partial match
		const found = banks.find(
			(b) =>
				b.name.toLowerCase() === value.toLowerCase() ||
				b.name.toLowerCase().includes(value.toLowerCase()) ||
				value.toLowerCase().includes(b.name.toLowerCase()),
		);
		return found ? found.name : value;
	}, [allowAll, value, allLabel, placeholder, banks]);

	const handleSelect = useCallback(
		(bankName: string, bankCode?: string) => {
			onChange(bankName, bankCode);
			setIsOpen(false);
			setSearchQuery("");
		},
		[onChange],
	);

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			{/* Trigger Button */}
			<button
				type="button"
				disabled={disabled}
				onClick={() => setIsOpen((prev) => !prev)}
				className={
					compact
						? `inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-line text-xs font-medium text-ink bg-surface hover:border-accent transition-colors shadow-card focus:outline-none focus:ring-1 focus:ring-accent ${
								disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
						  }`
						: `w-full px-3.5 py-2.5 rounded-xl border border-line text-xs text-ink bg-surface hover:border-accent transition-colors shadow-card flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-accent/20 ${
								disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
						  }`
				}
			>
				<span className="flex items-center gap-2 truncate text-left">
					<Landmark
						size={compact ? 12 : 14}
						className={value && value !== "all" ? "text-accent" : "text-ink-3"}
					/>
					<span
						className={`truncate ${
							!value || (allowAll && value === "all")
								? "text-ink"
								: "font-semibold text-ink"
						}`}
					>
						{displayValue}
					</span>
				</span>
				<ChevronDown
					size={13}
					className={`text-ink-3 transition-transform duration-200 shrink-0 ${
						isOpen ? "rotate-180 text-accent" : ""
					}`}
				/>
			</button>

			{/* Dropdown Popover */}
			{isOpen && (
				<div className="absolute top-full mt-1.5 left-0 z-50 w-72 sm:w-84 max-w-[90vw] rounded-xl bg-surface border border-line shadow-card overflow-hidden p-2.5 animate-in fade-in zoom-in-95 duration-150">
					{/* Search input header */}
					<div className="relative mb-2">
						<Search
							size={13}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
						/>
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Type bank name or code..."
							className="w-full pl-8 pr-7 py-2 rounded-lg bg-subtle border border-line/60 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent focus:bg-surface transition-colors"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
							>
								<X size={12} />
							</button>
						)}
					</div>

					{/* Quick Category Filters */}
					<div className="flex items-center gap-1 mb-2 pb-2 border-b border-[#eef5f1] text-[11px] font-medium">
						<button
							type="button"
							onClick={() => setActiveCategory("all")}
							className={`px-2 py-0.5 rounded-md transition-colors ${
								activeCategory === "all"
									? "bg-ink text-white"
									: "bg-subtle text-ink-2 hover:bg-accent-soft"
							}`}
						>
							All
						</button>
						<button
							type="button"
							onClick={() => setActiveCategory("popular")}
							className={`px-2.5 py-0.5 rounded-md transition-colors ${
								activeCategory === "popular"
									? "bg-accent text-white"
									: "bg-subtle text-ink-2 hover:bg-accent-soft"
							}`}
						>
							Popular
						</button>
						<button
							type="button"
							onClick={() => setActiveCategory("fintech")}
							className={`px-2 py-0.5 rounded-md transition-colors ${
								activeCategory === "fintech"
									? "bg-accent text-white"
									: "bg-subtle text-ink-2 hover:bg-accent-soft"
							}`}
						>
							Digital/MFB
						</button>
						<span className="ml-auto text-[11px] text-ink-3 font-normal">
							{loading ? "Loading..." : `${filteredBanks.length} banks`}
						</span>
					</div>

					{/* Bank List */}
					<div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-line pr-0.5">
						{/* Optional "All Banks" item */}
						{allowAll && !searchQuery && activeCategory === "all" && (
							<button
								type="button"
								onClick={() => handleSelect("all")}
								className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
									!value || value === "all"
										? "bg-accent-soft text-ink font-semibold"
										: "text-ink hover:bg-subtle"
								}`}
							>
								<span className="flex items-center gap-2">
									<span className="w-5 h-5 rounded-lg bg-accent-soft flex items-center justify-center text-[11px] text-accent">
										<Landmark size={10} />
									</span>
									<span>{allLabel}</span>
								</span>
								{(!value || value === "all") && (
									<Check size={13} className="text-accent" />
								)}
							</button>
						)}

						{filteredBanks.length === 0 ? (
							<div className="py-6 text-center text-xs text-ink-3">
								<p>No banks matching &ldquo;{searchQuery}&rdquo;</p>
								<button
									type="button"
									onClick={() => {
										setSearchQuery("");
										setActiveCategory("all");
									}}
									className="mt-2 text-xs text-accent hover:underline font-medium"
								>
									Clear filters
								</button>
							</div>
						) : (
							filteredBanks.map((bank) => {
								const isSelected =
									value === bank.name ||
									value?.toLowerCase() === bank.name.toLowerCase();

								return (
									<button
										key={`${bank.code}-${bank.id}`}
										type="button"
										onClick={() => handleSelect(bank.name, bank.code)}
										className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
											isSelected
												? "bg-accent-soft text-ink font-semibold"
												: "text-ink hover:bg-subtle"
										}`}
									>
										<span className="flex items-center gap-2.5 truncate">
											<span className="w-6 h-6 rounded-lg bg-subtle border border-line/70 flex items-center justify-center text-[11px] font-semibold text-ink shrink-0">
												{bank.name.charAt(0)}
											</span>
											<span className="truncate">{bank.name}</span>
										</span>
										<div className="flex items-center gap-1.5 shrink-0 ml-2">
											<span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-subtle text-ink-2 border border-line/50">
												{bank.code}
											</span>
											{isSelected && (
												<Check size={13} className="text-accent" />
											)}
										</div>
									</button>
								);
							})
						)}
					</div>
				</div>
			)}
		</div>
	);
}

