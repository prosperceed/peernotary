"use client";

import { X } from "lucide-react";

interface UsernameModalProps {
	usernameInput: string;
	setUsernameInput: (val: string) => void;
	usernameError: string | null;
	usernameBusy: boolean;
	onSubmit: (e: React.FormEvent) => void;
	onClose: () => void;
}

export function UsernameModal({
	usernameInput,
	setUsernameInput,
	usernameError,
	usernameBusy,
	onSubmit,
	onClose,
}: UsernameModalProps) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
			<div className="w-full max-w-sm rounded-[24px] bg-white border border-[#dce7e1] p-6 shadow-xl space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-bold text-[#0d2b1e]">Set Username</h3>
					<button
						onClick={onClose}
						className="text-[#7aaa92] hover:text-[#0d2b1e] p-1 text-xs"
					>
						<X size={16} />
					</button>
				</div>

				<p className="text-xs text-[#7aaa92] leading-relaxed">
					Choose a unique handle for your P2P merchant profile. It will be stored
					and displayed on your dashboard and peer orders.
				</p>

				<form onSubmit={onSubmit} className="space-y-3">
					<div className="relative">
						<span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-medium text-[#7aaa92]">
							@
						</span>
						<input
							type="text"
							value={usernameInput}
							onChange={(e) =>
								setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
							}
							placeholder="e.g. satoshi99"
							maxLength={20}
							required
							autoFocus
							className="w-full pl-8 pr-3 py-2 text-xs font-mono rounded-xl border border-[#d1e8dc] focus:outline-none focus:border-[#1a9e5c] bg-[#fbfdfc] text-[#0d2b1e]"
						/>
					</div>

					{usernameError && (
						<p className="text-[11px] text-red-600 font-medium">
							{usernameError}
						</p>
					)}

					<div className="flex items-center justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 rounded-xl text-xs font-medium border border-[#d1e8dc] text-[#7aaa92] hover:bg-[#f0f7f3]"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={usernameBusy || !usernameInput.trim()}
							className="px-4 py-2 rounded-xl text-xs font-medium bg-[#1a9e5c] hover:bg-[#15854c] text-white disabled:opacity-50 transition-all shadow-sm"
						>
							{usernameBusy ? "Saving..." : "Save Handle"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
