import { ethers } from "hardhat";

async function main() {
	const USDC_TESTNET_ADDRESS = process.env.USDC_ADDRESS;
	const TREASURY_WALLET = process.env.TREASURY_WALLET;
	const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS;

	if (!USDC_TESTNET_ADDRESS || !TREASURY_WALLET || !ORACLE_ADDRESS) {
		throw new Error("USDC_ADDRESS, TREASURY_WALLET, and ORACLE_ADDRESS are required");
	}

	console.log("Deploying ArcP2PEscrowService...");

	const EscrowService = await ethers.getContractFactory("ArcP2PEscrowService");
	const contract = await EscrowService.deploy(
		USDC_TESTNET_ADDRESS,
		TREASURY_WALLET,
		ORACLE_ADDRESS,
	);

	await contract.waitForDeployment();

	console.log(
		`Arc Escrow deployed successfully to: ${await contract.getAddress()}`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
