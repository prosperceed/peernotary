import { network } from "hardhat";

/**
 * Deploys ArcP2PEscrowService to the network passed via --network.
 * Reads per-network constructor args:
 *   arcTestnet → TESTNET_USDC_ADDRESS / TESTNET_TREASURY_WALLET / TESTNET_ORACLE_ADDRESS
 *               (falls back to USDC_ADDRESS / TREASURY_WALLET / ORACLE_ADDRESS)
 *   arcMainnet → MAINNET_USDC_ADDRESS / MAINNET_TREASURY_WALLET / MAINNET_ORACLE_ADDRESS
 */
async function main() {
	const connection = await network.create();
	const { ethers } = connection;
	const isMainnet = connection.networkName === "arcMainnet";

	const env = (name: string) => process.env[`${isMainnet ? "MAINNET" : "TESTNET"}_${name}`];
	const usdc = env("USDC_ADDRESS") || (!isMainnet ? process.env.NEXT_PUBLIC_USDC_ADDRESS || process.env.USDC_ADDRESS : undefined);
	const treasury = env("TREASURY_WALLET") || (!isMainnet ? process.env.NEXT_PUBLIC_ARC_TREASURY_WALLET || process.env.TREASURY_WALLET : undefined);
	const oracle = env("ORACLE_ADDRESS") || (!isMainnet ? process.env.ORACLE_ADDRESS : undefined);

	if (!usdc || !treasury || !oracle) {
		throw new Error(
			`Missing constructor args for ${connection.networkName}: set ${isMainnet ? "MAINNET" : "TESTNET"}_USDC_ADDRESS, _TREASURY_WALLET and _ORACLE_ADDRESS`,
		);
	}

	const [deployer] = await ethers.getSigners();
	console.log(`Deploying ArcP2PEscrowService to ${connection.networkName}`);
	console.log(`  Deployer: ${await deployer.getAddress()}`);
	console.log(`  USDC:     ${usdc}`);
	console.log(`  Treasury: ${treasury}`);
	console.log(`  Oracle:   ${oracle}`);

	const factory = await ethers.getContractFactory("ArcP2PEscrowService");
	const contract = await factory.deploy(usdc, treasury, oracle);
	await contract.waitForDeployment();

	const address = await contract.getAddress();
	console.log(`\nDeployed: ${address}`);
	console.log(`Set ${isMainnet ? "NEXT_PUBLIC_MAINNET_ESCROW_ADDRESS" : "NEXT_PUBLIC_TESTNET_ESCROW_ADDRESS"}=${address}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
