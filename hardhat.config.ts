import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY =
  process.env.ORACLE_PRIVATE_KEY

const config: HardhatUserConfig = {
  solidity: "0.8.20",

  networks: {
    arcTestnet: {
      type: "http",
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: [PRIVATE_KEY],
    },
  },
};

export default config;