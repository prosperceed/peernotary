import { network } from "hardhat";

/**
 * Deploys ArcP2PEscrowService to the network passed via --network.
 * Reads per-network constructor args:
 *   arcTestnet → TESTNET_USDC_ADDRESS / TESTNET_TREASURY_WALLET / TESTNET_ORACLE_ADDRESS
 *               (falls back to USDC_ADDRESS / TREASURY_WALLET / ORACLE_ADDRESS)
 *   arcMainnet → MAINNET_USDC_ADDRESS / MAINNET_TREASURY_WALLET / MAINNET_ORACLE_ADDRESS
 */
// Hardhat's default accounts: keys are public, never deploy (= own a contract) with them.
const PUBLIC_TEST_ACCOUNTS = new Set([
	"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
	"0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
	"0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
]);

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

	const signers = await ethers.getSigners();
	if (signers.length === 0) {
		throw new Error(
			`No deployer key for ${connection.networkName}: set ${isMainnet ? "ARC_PRIVATE_KEY_MAINNET" : "ARC_PRIVATE_KEY_TESTNET"} in .env`,
		);
	}
	const deployer = signers[0];
	const deployerAddress = await deployer.getAddress();

	// The deployer becomes the contract owner (can change oracle, treasury, fee).
	if (PUBLIC_TEST_ACCOUNTS.has(deployerAddress.toLowerCase())) {
		throw new Error(
			`Deployer ${deployerAddress} is a public Hardhat test account whose private key is published. ` +
				"Anyone could take over the contract. Use a fresh wallet's key in ARC_PRIVATE_KEY_TESTNET.",
		);
	}

	console.log(`Deploying ArcP2PEscrowService to ${connection.networkName}`);
	console.log(`  Deployer: ${deployerAddress}`);
	console.log(`  USDC:     ${usdc}`);
	console.log(`  Treasury: ${treasury}`);
	console.log(`  Oracle:   ${oracle}`);

	const factory = await ethers.getContractFactory("ArcP2PEscrowService");

	// Pre-flight: make sure the deployer can pay for gas before sending anything.
	// Arc's native balance (gas) is USDC with 18 decimals.
	const deployTx = await factory.getDeployTransaction(usdc, treasury, oracle);
	const [gasEstimate, feeData, balance] = await Promise.all([
		ethers.provider.estimateGas({ ...deployTx, from: deployerAddress }).catch(() => 5_500_000n),
		ethers.provider.getFeeData(),
		ethers.provider.getBalance(deployerAddress),
	]);
	const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
	const needed = (gasEstimate * gasPrice * 13n) / 10n; // +30% headroom
	const fmt = (wei: bigint) => ethers.formatUnits(wei, 18);
	console.log(`  Gas:      ~${gasEstimate} @ ${ethers.formatUnits(gasPrice, "gwei")} gwei ≈ ${fmt(needed)} USDC`);
	console.log(`  Balance:  ${fmt(balance)} USDC`);
	if (balance < needed) {
		throw new Error(
			`Deployer ${deployerAddress} has ${fmt(balance)} USDC but needs about ${fmt(needed)} USDC for gas. ` +
				(isMainnet
					? "Fund it with USDC on Arc mainnet."
					: "Get testnet USDC from https://faucet.circle.com (select Arc Testnet) and retry."),
		);
	}

	const contract = await factory.deploy(usdc, treasury, oracle);
	await contract.waitForDeployment();

	const address = await contract.getAddress();
	console.log(`\nDeployed: ${address}`);
	console.log(`Owner:    ${deployerAddress}`);
	console.log("\nNext, set these and rebuild (frontend env + Rust backend env):");
	if (isMainnet) {
		console.log(`  NEXT_PUBLIC_MAINNET_ESCROW_ADDRESS=${address}`);
	} else {
		console.log(`  NEXT_PUBLIC_TESTNET_ESCROW_ADDRESS=${address}`);
		console.log(`  NEXT_PUBLIC_ESCROW_ADDRESS=${address}`);
		console.log(`  ESCROW_ADDRESS=${address}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
