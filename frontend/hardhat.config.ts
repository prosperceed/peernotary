import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY =
	process.env.ARC_PRIVATE_KEY ||
	process.env.ORACLE_PRIVATE_KEY ||
	"0x0000000000000000000000000000000000000000000000000000000000000001";

export default defineConfig({
	plugins: [hardhatEthers],
	solidity: "0.8.20",
	networks: {
		arcTestnet: {
			type: "http",
			url:
				process.env.ARC_RPC_URL ||
				process.env.NEXT_PUBLIC_ARC_RPC_URL ||
				"https://rpc.testnet.arc.io",
			chainId: 5042002,
			accounts: [PRIVATE_KEY],
			timeout: 60000,
		},
	},
});
