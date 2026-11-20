import "server-only";

import type { VerificationRecord } from "@/app/api/tlsn/trades/[tradeId]/verify/route";

export const verificationStore = new Map<string, VerificationRecord>();
