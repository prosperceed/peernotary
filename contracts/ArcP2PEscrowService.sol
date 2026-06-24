// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  ArcP2PEscrowService
 * @notice Production-ready P2P NGN/USDC escrow on Arc Chain Testnet.
 *
 * ─── ARCHITECTURE ────────────────────────────────────────────────────────────
 *  State machine per trade:
 *    Created → Funded → FiatSent → Completed
 *                    ↘ Disputed → Resolved
 *
 * ─── ECONOMIC PARAMETERS (Arc Chain) ─────────────────────────────────────────
 *  • Native gas token  : USDC  (6 decimals, not 18)
 *  • Chain ID          : 5042002
 *  • All amounts in    : micro-USDC (1 USDC = 1_000_000 units)
 *
 * ─── SECURITY MODEL ──────────────────────────────────────────────────────────
 *  1. Platform fee    : 100 bps (1 %) deducted from seller release amount
 *  2. Buyer collateral: mandatory anti-fraud lockup (forwarded to seller on slash)
 *  3. Bank details    : stored as keccak256 hash — never plain text on-chain
 *  4. Oracle gate     : only the designated oracle may trigger automated releases
 */

// ─── MINIMAL IERC20 (avoids OpenZeppelin import for portability) ──────────────
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// ─── ERRORS ──────────────────────────────────────────────────────────────────
error Unauthorized();
error InvalidAmount();
error InvalidState(TradeStatus current, TradeStatus required);
error ZeroAddress();
error SlashWindowExpired();
error FeeTooHigh();
error TransferFailed();

// ─── ENUMS ───────────────────────────────────────────────────────────────────
enum TradeStatus {
    Created,
    Funded,
    FiatSent,
    Completed,
    Disputed,
    Resolved
}

// ─── STRUCTS ─────────────────────────────────────────────────────────────────
struct Trade {
    // Parties
    address seller;
    address buyer;
    // Amounts (micro-USDC, 6 decimals)
    uint256 cryptoAmount;        // USDC the seller is selling
    uint256 buyerCollateral;     // anti-fraud lockup paid by buyer
    // Privacy
    bytes32 privacyHashedBankDetails; // keccak256(bankName + accountNo + sortCode)
    // State
    TradeStatus status;
    uint64  createdAt;
    uint64  fundedAt;
    uint64  fiatSentAt;
    // Oracle proof reference (TLSNotary / Reclaim proof ID stored off-chain)
    bytes32 proofId;
}

// ─── CONTRACT ────────────────────────────────────────────────────────────────
contract ArcP2PEscrowService {

    // ── Constants ────────────────────────────────────────────────────────────
    uint16  public constant MAX_FEE_BPS          = 500;   // hard cap: 5 %
    uint16  public constant DEFAULT_FEE_BPS      = 100;   // 1 %
    uint256 public constant SLASH_AMOUNT         = 50 * 1e6;  // 50 USDC
    uint64  public constant DISPUTE_WINDOW       = 15 minutes;
    uint64  public constant RELEASE_TIMEOUT      = 30 minutes; // seller must release within 30m

    // ── Immutables ───────────────────────────────────────────────────────────
    IERC20  public immutable usdc;

    // ── Storage ──────────────────────────────────────────────────────────────
    address public owner;
    address public treasuryWallet;
    address public oracleAddress;

    uint16  public feeBps = DEFAULT_FEE_BPS;
    uint256 public nextTradeId;

    mapping(uint256 => Trade) public trades;

    // Track oracle-authorised proof submissions to prevent replay
    mapping(bytes32 => bool) public usedProofIds;

    // ── Events ───────────────────────────────────────────────────────────────
    event TradeInitiated(
        uint256 indexed tradeId,
        address indexed seller,
        uint256 cryptoAmount,
        bytes32 hashedBankDetails
    );
    event TradeFunded(
        uint256 indexed tradeId,
        address indexed buyer,
        uint256 buyerCollateral
    );
    event FiatSentMarked(uint256 indexed tradeId, address indexed buyer);
    event TradeCompleted(
        uint256 indexed tradeId,
        address indexed buyer,
        uint256 amountAfterFee,
        uint256 fee
    );
    event TradeDisputed(uint256 indexed tradeId, address indexed raisedBy);
    event TradeResolved(
        uint256 indexed tradeId,
        address indexed winner,
        bool buyerSlashed
    );
    event OracleProofSubmitted(uint256 indexed tradeId, bytes32 indexed proofId);
    event TreasuryUpdated(address newTreasury);
    event OracleUpdated(address newOracle);
    event FeeUpdated(uint16 newBps);

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /**
     * @dev Allows the designated oracle (open banking webhook relay or
     *      TLSNotary/Reclaim proof verifier) to call gated functions.
     */
    modifier onlyOracle() {
        if (msg.sender != oracleAddress) revert Unauthorized();
        _;
    }

    modifier inState(uint256 _tradeId, TradeStatus _required) {
        if (trades[_tradeId].status != _required)
            revert InvalidState(trades[_tradeId].status, _required);
        _;
    }

    modifier onlySeller(uint256 _tradeId) {
        if (msg.sender != trades[_tradeId].seller) revert Unauthorized();
        _;
    }

    modifier onlyBuyer(uint256 _tradeId) {
        if (msg.sender != trades[_tradeId].buyer) revert Unauthorized();
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc, address _treasury, address _oracle) {
        if (_usdc == address(0) || _treasury == address(0) || _oracle == address(0))
            revert ZeroAddress();

        usdc           = IERC20(_usdc);
        owner          = msg.sender;
        treasuryWallet = _treasury;
        oracleAddress  = _oracle;
        nextTradeId    = 1; // start from 1; 0 reserved as null sentinel
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  CORE TRADE LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice  Seller initiates an order and locks their USDC into escrow.
     * @param   _cryptoAmount        Amount of USDC to sell (micro-USDC, 6 dec).
     * @param   _hashedBankDetails   keccak256 hash of the seller's bank routing
     *                               details (bank name + account number + sort code).
     *                               Bank details are NEVER stored in plain text.
     * @return  tradeId              The new trade ID.
     *
     * @dev  Emits {TradeInitiated}. Pulls `_cryptoAmount` USDC from msg.sender.
     */
    function initiateTrade(
        uint256 _cryptoAmount,
        bytes32 _hashedBankDetails
    ) external returns (uint256 tradeId) {
        if (_cryptoAmount == 0) revert InvalidAmount();
        if (_hashedBankDetails == bytes32(0)) revert InvalidAmount();

        tradeId = nextTradeId++;

        trades[tradeId] = Trade({
            seller               : msg.sender,
            buyer                : address(0),
            cryptoAmount         : _cryptoAmount,
            buyerCollateral      : 0,
            privacyHashedBankDetails : _hashedBankDetails,
            status               : TradeStatus.Created,
            createdAt            : uint64(block.timestamp),
            fundedAt             : 0,
            fiatSentAt           : 0,
            proofId              : bytes32(0)
        });

        // Pull USDC from seller into escrow contract
        if (!usdc.transferFrom(msg.sender, address(this), _cryptoAmount))
            revert TransferFailed();

        emit TradeInitiated(tradeId, msg.sender, _cryptoAmount, _hashedBankDetails);
    }

    /**
     * @notice  Buyer locks their anti-fraud collateral to accept a trade.
     * @param   _tradeId     The trade to accept.
     * @param   _collateral  Collateral amount in micro-USDC. Must be >= SLASH_AMOUNT
     *                       so the contract can always execute a full slash if needed.
     *
     * @dev  Emits {TradeFunded}. Buyer must pre-approve this contract for `_collateral`.
     *       State transitions: Created → Funded.
     */
    function fundBuyerCollateral(
        uint256 _tradeId,
        uint256 _collateral
    ) external inState(_tradeId, TradeStatus.Created) {
        if (_collateral < SLASH_AMOUNT) revert InvalidAmount(); // must cover max slash
        Trade storage t = trades[_tradeId];
        if (t.seller == msg.sender) revert Unauthorized(); // seller cannot be buyer

        t.buyer           = msg.sender;
        t.buyerCollateral = _collateral;
        t.status          = TradeStatus.Funded;
        t.fundedAt        = uint64(block.timestamp);

        if (!usdc.transferFrom(msg.sender, address(this), _collateral))
            revert TransferFailed();

        emit TradeFunded(_tradeId, msg.sender, _collateral);
    }

    /**
     * @notice  Buyer marks that they have completed the Naira bank transfer.
     * @dev     Only the registered buyer may call this. State: Funded → FiatSent.
     */
    function markFiatSent(
        uint256 _tradeId
    ) external inState(_tradeId, TradeStatus.Funded) onlyBuyer(_tradeId) {
        Trade storage t = trades[_tradeId];
        t.status    = TradeStatus.FiatSent;
        t.fiatSentAt = uint64(block.timestamp);

        emit FiatSentMarked(_tradeId, msg.sender);
    }

    /**
     * @notice  Seller confirms fiat receipt and releases USDC to the buyer.
     * @dev     Applies platform fee (feeBps) from the crypto release amount.
     *          Returns buyer collateral in full (no fraud detected).
     *          State: FiatSent → Completed.
     *
     *          Fee formula:
     *            fee             = cryptoAmount * feeBps / 10_000
     *            buyerReceives   = cryptoAmount - fee
     *            fee → treasury
     */
    function releaseFunds(
        uint256 _tradeId
    ) external inState(_tradeId, TradeStatus.FiatSent) onlySeller(_tradeId) {
        _completeTrade(_tradeId);
    }

    /**
     * @notice  Oracle-triggered release — called automatically by open banking
     *          webhook relay or TLSNotary/Reclaim proof verifier once fiat
     *          credit is cryptographically confirmed.
     * @param   _tradeId   Trade to release.
     * @param   _proofId   Unique proof identifier (Reclaim claim ID or TLSNotary
     *                     session hash) — stored to prevent replay attacks.
     *
     * @dev  Works from either Funded or FiatSent state (oracle may confirm before
     *       buyer manually marks fiatSent).
     */
    function oracleRelease(
        uint256 _tradeId,
        bytes32 _proofId
    ) external onlyOracle {
        Trade storage t = trades[_tradeId];

        // Accept from Funded or FiatSent
        if (t.status != TradeStatus.Funded && t.status != TradeStatus.FiatSent)
            revert InvalidState(t.status, TradeStatus.Funded);

        if (usedProofIds[_proofId]) revert Unauthorized(); // replay protection
        usedProofIds[_proofId] = true;
        t.proofId  = _proofId;
        t.status   = TradeStatus.FiatSent; // normalise state

        emit OracleProofSubmitted(_tradeId, _proofId);
        _completeTrade(_tradeId);
    }

    // ── Internal release logic ────────────────────────────────────────────────
    function _completeTrade(uint256 _tradeId) internal {
        Trade storage t = trades[_tradeId];
        t.status = TradeStatus.Completed;

        uint256 crypto    = t.cryptoAmount;
        uint256 fee       = (crypto * feeBps) / 10_000;
        uint256 buyerGets = crypto - fee;

        // Return buyer collateral (no fraud)
        uint256 collateral = t.buyerCollateral;
        t.buyerCollateral  = 0;

        // Release USDC to buyer
        if (!usdc.transfer(t.buyer, buyerGets)) revert TransferFailed();
        // Fee to treasury
        if (fee > 0) {
            if (!usdc.transfer(treasuryWallet, fee)) revert TransferFailed();
        }
        // Collateral back to buyer
        if (collateral > 0) {
            if (!usdc.transfer(t.buyer, collateral)) revert TransferFailed();
        }

        emit TradeCompleted(_tradeId, t.buyer, buyerGets, fee);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  DISPUTE & ANTI-FRAUD SLASH SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice  Either party may raise a dispute within the DISPUTE_WINDOW after
     *          the buyer marks fiat sent.
     */
    function raiseDispute(
        uint256 _tradeId
    ) external inState(_tradeId, TradeStatus.FiatSent) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.seller && msg.sender != t.buyer) revert Unauthorized();

        // Enforce dispute window
        if (block.timestamp > t.fiatSentAt + DISPUTE_WINDOW)
            revert SlashWindowExpired();

        t.status = TradeStatus.Disputed;
        emit TradeDisputed(_tradeId, msg.sender);
    }

    /**
     * @notice  Oracle resolves a dispute after arbitration.
     * @param   _tradeId      Disputed trade.
     * @param   _favourBuyer  true  → buyer wins (fiat confirmed), seller releases USDC.
     *                        false → seller wins (fake receipt), buyer is SLASHED.
     * @param   _proofId      ZK or oracle proof reference.
     *
     * @dev  Anti-fraud slash mechanics when _favourBuyer = false:
     *         • SLASH_AMOUNT (50 USDC) deducted from buyer collateral → seller
     *         • Remaining collateral refunded to buyer
     *         • Seller's escrowed USDC returned in full
     */
    function oracleResolveDispute(
        uint256 _tradeId,
        bool    _favourBuyer,
        bytes32 _proofId
    ) external onlyOracle inState(_tradeId, TradeStatus.Disputed) {
        if (usedProofIds[_proofId]) revert Unauthorized();
        usedProofIds[_proofId] = true;

        Trade storage t = trades[_tradeId];
        t.status  = TradeStatus.Resolved;
        t.proofId = _proofId;

        emit OracleProofSubmitted(_tradeId, _proofId);

        if (_favourBuyer) {
            // ── Buyer wins: fiat was genuinely sent → complete the trade ──
            _completeTrade(_tradeId);
            emit TradeResolved(_tradeId, t.buyer, false);
        } else {
            // ── Seller wins: fake receipt fraud detected ──
            uint256 crypto     = t.cryptoAmount;
            uint256 collateral = t.buyerCollateral;
            t.buyerCollateral  = 0;

            // Slash SLASH_AMOUNT from buyer's collateral → seller (fraud compensation)
            uint256 slashAmt   = collateral >= SLASH_AMOUNT ? SLASH_AMOUNT : collateral;
            uint256 remainder  = collateral - slashAmt;

            // Return seller's USDC in full
            if (!usdc.transfer(t.seller, crypto)) revert TransferFailed();
            // Slash to seller
            if (slashAmt > 0) {
                if (!usdc.transfer(t.seller, slashAmt)) revert TransferFailed();
            }
            // Refund remainder to buyer
            if (remainder > 0) {
                if (!usdc.transfer(t.buyer, remainder)) revert TransferFailed();
            }

            emit TradeResolved(_tradeId, t.seller, true);
        }
    }

    /**
     * @notice  Seller may reclaim their USDC if the buyer never locks collateral
     *          within RELEASE_TIMEOUT after trade creation.
     */
    function reclaimExpiredTrade(
        uint256 _tradeId
    ) external onlySeller(_tradeId) inState(_tradeId, TradeStatus.Created) {
        Trade storage t = trades[_tradeId];
        if (block.timestamp < t.createdAt + RELEASE_TIMEOUT) revert Unauthorized();

        t.status = TradeStatus.Resolved;
        if (!usdc.transfer(t.seller, t.cryptoAmount)) revert TransferFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════════════════

    function setFee(uint16 _bps) external onlyOwner {
        if (_bps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = _bps;
        emit FeeUpdated(_bps);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasuryWallet = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert ZeroAddress();
        oracleAddress = _oracle;
        emit OracleUpdated(_oracle);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        if (_newOwner == address(0)) revert ZeroAddress();
        owner = _newOwner;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function getTrade(uint256 _tradeId) external view returns (Trade memory) {
        return trades[_tradeId];
    }

    /**
     * @notice Returns the net USDC the buyer receives after the platform fee.
     */
    function calculateNetRelease(uint256 _tradeId) external view returns (
        uint256 buyerReceives,
        uint256 platformFee
    ) {
        uint256 crypto   = trades[_tradeId].cryptoAmount;
        platformFee      = (crypto * feeBps) / 10_000;
        buyerReceives    = crypto - platformFee;
    }
}
