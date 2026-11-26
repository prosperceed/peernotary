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
			<div className="w-full max-w-sm rounded-xl bg-surface border border-line p-6 shadow-card space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold text-ink">Set Username</h3>
					<button
						onClick={onClose}
						className="text-ink-3 hover:text-ink p-1 text-xs"
					>
						<X size={16} />
					</button>
				</div>

				<p className="text-xs text-ink-3 leading-relaxed">
					Choose a unique handle for your P2P merchant profile. It will be stored
					and displayed on your dashboard and peer orders.
				</p>

				<form onSubmit={onSubmit} className="space-y-3">
					<div className="relative">
						<span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-medium text-ink-3">
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
							className="w-full pl-8 pr-3 py-2 text-xs font-mono rounded-lg border border-line focus:outline-none focus:border-accent bg-surface text-ink"
						/>
					</div>

					{usernameError && (
						<p className="text-xs text-red-600 font-medium">
							{usernameError}
						</p>
					)}

					<div className="flex items-center justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 rounded-lg text-xs font-medium border border-line text-ink-3 hover:bg-subtle"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={usernameBusy || !usernameInput.trim()}
							className="px-4 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent-hover text-white disabled:opacity-50 transition-colors shadow-card"
						>
							{usernameBusy ? "Saving..." : "Save Handle"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
