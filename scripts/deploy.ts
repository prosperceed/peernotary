import { ethers } from "hardhat";

async function main() {
	const USDC_TESTNET_ADDRESS = process.env.NEXT_PUBLIC_ARC_ESCROW_WALLET;
	const TREASURY_WALLET = process.env.NEXT_PUBLIC_ARC_ESCROW_WALLET;
	const ORACLE_ADDRESS = process.env.NEXT_PUBLIC_ARC_ESCROW_ORACLE_ADDRESS;

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
