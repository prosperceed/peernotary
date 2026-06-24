export type ViewMode = "dev" | "trader";
export type View = "home" | "trade" | "dev";
export type TradeStep = 0 | 1 | 2 | 3;
export type VerifyMode = "bank" | "zk" | null;
export type TxStatus = "completed" | "escrow" | "disputed" | "pending";
export type BadgeColor = "violet" | "green" | "amber" | "red" | "blue" | "slate" | "cyan";

export interface Transaction {
  id: string;
  buyer: string;
  ngnAmount: string;
  usdc: string;
  status: TxStatus;
  time: string;
}

export interface ChatMessage {
  from: "buyer" | "seller" | "system";
  text: string;
  time: string;
  danger?: boolean;
}

export interface EscrowState {
  sellerLocked: string;
  buyerCollateral: string;
  arcStatus: "Secured" | "Pending" | "Released";
  verificationMethod: string;
}
