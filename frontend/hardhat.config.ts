import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

// Deployer keys are per network and never shared between them.
const TESTNET_DEPLOYER_KEY = process.env.ARC_PRIVATE_KEY_TESTNET || process.env.ARC_PRIVATE_KEY;
const MAINNET_DEPLOYER_KEY = process.env.ARC_PRIVATE_KEY_MAINNET;

export default defineConfig({
	plugins: [hardhatEthers],
	solidity: "0.8.20",
	networks: {
		// npx hardhat run scripts/deploy.ts --network arcTestnet
		arcTestnet: {
			type: "http",
			url:
				process.env.ARC_RPC_URL_TESTNET ||
				process.env.ARC_RPC_URL ||
				process.env.NEXT_PUBLIC_ARC_RPC_URL ||
				"https://rpc.testnet.arc.io",
			chainId: 5042002,
			accounts: TESTNET_DEPLOYER_KEY ? [TESTNET_DEPLOYER_KEY] : [],
			timeout: 60000,
		},
		// npx hardhat run scripts/deploy.ts --network arcMainnet
		arcMainnet: {
			type: "http",
			url: process.env.ARC_RPC_URL_MAINNET || process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || "http://127.0.0.1:0",
			chainId: Number(process.env.NEXT_PUBLIC_ARC_MAINNET_CHAIN_ID || 0) || undefined,
			accounts: MAINNET_DEPLOYER_KEY ? [MAINNET_DEPLOYER_KEY] : [],
			timeout: 60000,
		},
	},
});
