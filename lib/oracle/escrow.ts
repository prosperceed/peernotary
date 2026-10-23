import "server-only";

import ArcP2PEscrowService from "@/artifacts/contracts/ArcP2PEscrowService.sol/ArcP2PEscrowService.json";
import { ethers } from "ethers";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
};

const provider = new ethers.JsonRpcProvider(requiredEnv("ARC_RPC_URL"));
const oracleWallet = new ethers.Wallet(
  requiredEnv("ORACLE_PRIVATE_KEY"),
  provider,
);
const escrow = new ethers.Contract(
  requiredEnv("ESCROW_ADDRESS"),
  ArcP2PEscrowService.abi,
  oracleWallet,
);

const FUNDED = 1n;
const FIAT_SENT = 2n;

export interface OracleReleaseResult {
  transactionHash: string;
  tradeId: bigint;
  proofId: string;
}

export async function readEscrowTrade(tradeId: bigint) {
  if (tradeId <= 0n) throw new Error("Invalid trade identifier");
  return escrow.getTrade(tradeId);
}

export async function oracleRelease(
  tradeId: bigint,
  proofId: string,
): Promise<OracleReleaseResult> {
  if (tradeId <= 0n || !ethers.isHexString(proofId, 32)) {
    throw new Error("Invalid oracle release input");
  }
  if (proofId === ethers.ZeroHash) throw new Error("Invalid proof identifier");

  const [trade, used, configuredOracle] = await Promise.all([
    escrow.getTrade(tradeId),
    escrow.usedProofIds(proofId),
    escrow.oracleAddress(),
  ]);
  if (configuredOracle.toLowerCase() !== oracleWallet.address.toLowerCase()) {
    throw new Error("Oracle signer is not configured for escrow");
  }
  if (used) throw new Error("Proof has already been consumed");
  if (trade.status !== FUNDED && trade.status !== FIAT_SENT) {
    throw new Error("Trade is not eligible for oracle release");
  }

  await escrow.oracleRelease.staticCall(tradeId, proofId);
  const transaction = await escrow.oracleRelease(tradeId, proofId);

  return {
    transactionHash: transaction.hash,
    tradeId,
    proofId,
  };
}