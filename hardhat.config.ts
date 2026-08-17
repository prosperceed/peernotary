import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY =
	process.env.ARC_PRIVATE_KEY ||
	"0x00000000000000000000000000000000000000000000000000000";

const config: HardhatUserConfig = {
	solidity: "0.8.20",
	networks: {
		arcTestnet: {
			url: "https://arc.network",
			chainId: 5042002,
			accounts: [PRIVATE_KEY],
		},
	},
};

export default config;
