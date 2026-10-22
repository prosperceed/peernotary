import { ethers } from "hardhat";

async function main() {
	const USDC_TESTNET_ADDRESS =
		process.env.NEXT_PUBLIC_USDC_ADDRESS ||
		process.env.USDC_ADDRESS ||
		process.env.NEXT_PUBLIC_ARC_DEPLOYER_WALLET;
	const TREASURY_WALLET =
		process.env.NEXT_PUBLIC_ARC_TREASURY_WALLET ||
		process.env.TREASURY_WALLET;
	const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS;

	if (!USDC_TESTNET_ADDRESS || !TREASURY_WALLET || !ORACLE_ADDRESS) {
		throw new Error(
			"Missing configuration: ensure USDC address, Treasury wallet, and Oracle address are set.",
		);
	}

	console.log("Deploying ArcP2PEscrowService with params:");
	console.log(`  USDC Token: ${USDC_TESTNET_ADDRESS}`);
	console.log(`  Treasury:   ${TREASURY_WALLET}`);
	console.log(`  Oracle:     ${ORACLE_ADDRESS}`);

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
