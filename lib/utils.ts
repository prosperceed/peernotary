import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const RATE = 1630; // 1 USDC = ₦1,630

export function calcUsdc(ngnRaw: string): string {
  const ngn = parseFloat(ngnRaw.replace(/,/g, "")) || 0;
  return (ngn / RATE).toFixed(2);
}

export function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function truncateAddress(addr: string, chars = 6): string {
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}
