// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  ArcP2PEscrowService
 * @notice Seller-funded P2P NGN/USDC escrow on Arc Chain Testnet with partial-fill
 *         inventory accounting and oracle-gated settlement.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

error Unauthorized();
error InvalidAmount();
error InsufficientInventory(uint256 requested, uint256 available);
error InvalidState(TradeStatus current, TradeStatus required);
error ZeroAddress();
error SlashWindowExpired();
error FeeTooHigh();
error TransferFailed();

enum TradeStatus {
    Created,
    Funded,
    FiatSent,
    Completed,
    Disputed,
    Resolved
}

struct Trade {
    address seller;
    address buyer;
    uint256 cryptoAmount;
    uint256 buyerCollateral;
    bytes32 privacyHashedBankDetails;
    TradeStatus status;
    uint64  createdAt;
    uint64  fundedAt;
    uint64  fiatSentAt;
    bytes32 proofId;
}

struct SellerListingInventory {
    uint256 listingTradeId;
    address seller;
    uint256 totalDeposited;
    uint256 availableAmount;
    uint256 allocatedAmount;
    uint256 activeChildTradeId;
    bytes32 privacyHashedBankDetails;
    bool    active;
}

contract ArcP2PEscrowService {

    uint16  public constant MAX_FEE_BPS     = 500;
    uint16  public constant DEFAULT_FEE_BPS = 100;
    uint256 public constant SLASH_AMOUNT    = 0; // Mandatory 50 USDC buyer deposit removed; seller-funded escrow
    uint64  public constant DISPUTE_WINDOW  = 15 minutes;
    uint64  public constant RELEASE_TIMEOUT = 20 minutes;

    IERC20  public immutable usdc;

    address public owner;
    address public treasuryWallet;
    address public oracleAddress;

    uint16  public feeBps = DEFAULT_FEE_BPS;
    uint256 public nextTradeId;

    mapping(uint256 => Trade) public trades;
    mapping(uint256 => SellerListingInventory) public listingInventories;
    mapping(uint256 => uint256) public childToParentListing;
    mapping(bytes32 => bool) public usedProofIds;

    event TradeInitiated(
        uint256 indexed tradeId,
        address indexed seller,
        uint256 cryptoAmount,
        bytes32 hashedBankDetails
    );
    event PartialOrderAllocated(
        uint256 indexed parentListingId,
        uint256 indexed childTradeId,
        address indexed buyer,
        uint256 allocatedAmount,
        uint256 remainingAvailable
    );
    event ListingInventoryWithdrawn(
        uint256 indexed listingId,
        address indexed seller,
        uint256 withdrawnAmount,
        uint256 remainingAvailable
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

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

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

    constructor(address _usdc, address _treasury, address _oracle) {
        if (_usdc == address(0) || _treasury == address(0) || _oracle == address(0))
            revert ZeroAddress();

        usdc           = IERC20(_usdc);
        owner          = msg.sender;
        treasuryWallet = _treasury;
        oracleAddress  = _oracle;
        nextTradeId    = 1;
    }

    /**
     * @notice Seller locks USDC inventory into escrow to back a listing.
     *         Any positive micro-USDC amount is accepted (no arbitrary minimum).
     */
    function initiateTrade(
        uint256 _cryptoAmount,
        bytes32 _hashedBankDetails
    ) external returns (uint256 tradeId) {
        if (_cryptoAmount == 0) revert InvalidAmount();
        if (_hashedBankDetails == bytes32(0)) revert InvalidAmount();

        tradeId = nextTradeId++;

        trades[tradeId] = Trade({
            seller                   : msg.sender,
            buyer                    : address(0),
            cryptoAmount             : _cryptoAmount,
            buyerCollateral          : 0,
            privacyHashedBankDetails : _hashedBankDetails,
            status                   : TradeStatus.Created,
            createdAt                : uint64(block.timestamp),
            fundedAt                 : 0,
            fiatSentAt               : 0,
            proofId                  : bytes32(0)
        });

        listingInventories[tradeId] = SellerListingInventory({
            listingTradeId           : tradeId,
            seller                   : msg.sender,
            totalDeposited           : _cryptoAmount,
            availableAmount          : _cryptoAmount,
            allocatedAmount          : 0,
            activeChildTradeId       : 0,
            privacyHashedBankDetails : _hashedBankDetails,
            active                   : true
        });

        if (!usdc.transferFrom(msg.sender, address(this), _cryptoAmount))
            revert TransferFailed();

        emit TradeInitiated(tradeId, msg.sender, _cryptoAmount, _hashedBankDetails);
    }

    /**
     * @notice Buyer accepts a seller-funded trade (full amount) without mandatory 50 USDC collateral.
     *         Retains optional `_collateral` parameter (may be 0) for ABI compatibility.
     */
    function fundBuyerCollateral(
        uint256 _tradeId,
        uint256 _collateral
    ) external inState(_tradeId, TradeStatus.Created) {
        Trade storage t = trades[_tradeId];
        if (t.seller == msg.sender) revert Unauthorized();

        SellerListingInventory storage inv = listingInventories[_tradeId];
        if (inv.active) {
            if (inv.activeChildTradeId != 0) revert Unauthorized();
            if (inv.availableAmount < t.cryptoAmount)
                revert InsufficientInventory(t.cryptoAmount, inv.availableAmount);
            inv.availableAmount -= t.cryptoAmount;
            inv.allocatedAmount += t.cryptoAmount;
            inv.activeChildTradeId = _tradeId;
        }

        t.buyer           = msg.sender;
        t.buyerCollateral = _collateral;
        t.status          = TradeStatus.Funded;
        t.fundedAt        = uint64(block.timestamp);

        if (_collateral > 0) {
            if (!usdc.transferFrom(msg.sender, address(this), _collateral))
                revert TransferFailed();
        }

        emit TradeFunded(_tradeId, msg.sender, _collateral);
    }

    /**
     * @notice Allocates a partial or full buyer order against a seller's funded listing.
     *         Enforces that at most one active order occupies the seller listing's active slot
     *         and that `availableAmount >= _requestedAmount`. No buyer collateral is required.
     */
    function allocatePartialOrder(
        uint256 _parentListingId,
        uint256 _requestedAmount,
        address _buyer
    ) external returns (uint256 childTradeId) {
        if (_requestedAmount == 0) revert InvalidAmount();
        address effectiveBuyer = (msg.sender == oracleAddress && _buyer != address(0))
            ? _buyer
            : msg.sender;
        if (effectiveBuyer == address(0)) revert ZeroAddress();

        SellerListingInventory storage inv = listingInventories[_parentListingId];
        if (!inv.active) revert Unauthorized();
        if (inv.seller == effectiveBuyer) revert Unauthorized();
        if (inv.activeChildTradeId != 0) revert Unauthorized();
        if (_requestedAmount > inv.availableAmount)
            revert InsufficientInventory(_requestedAmount, inv.availableAmount);

        inv.availableAmount -= _requestedAmount;
        inv.allocatedAmount += _requestedAmount;

        childTradeId = nextTradeId++;
        inv.activeChildTradeId = childTradeId;
        childToParentListing[childTradeId] = _parentListingId;

        trades[childTradeId] = Trade({
            seller                   : inv.seller,
            buyer                    : effectiveBuyer,
            cryptoAmount             : _requestedAmount,
            buyerCollateral          : 0,
            privacyHashedBankDetails : inv.privacyHashedBankDetails,
            status                   : TradeStatus.Funded,
            createdAt                : uint64(block.timestamp),
            fundedAt                 : uint64(block.timestamp),
            fiatSentAt               : 0,
            proofId                  : bytes32(0)
        });

        if (inv.availableAmount == 0) {
            trades[_parentListingId].status = TradeStatus.Funded;
        }

        emit PartialOrderAllocated(
            _parentListingId,
            childTradeId,
            effectiveBuyer,
            _requestedAmount,
            inv.availableAmount
        );
        emit TradeFunded(childTradeId, effectiveBuyer, 0);
    }

    /**
     * @notice Seller may withdraw unallocated available USDC inventory from their listing.
     *         Allocated USDC backing an active buyer order cannot be withdrawn.
     */
    function withdrawAvailableInventory(
        uint256 _listingId,
        uint256 _amount
    ) external {
        SellerListingInventory storage inv = listingInventories[_listingId];
        if (!inv.active || inv.seller != msg.sender) revert Unauthorized();
        if (_amount == 0 || _amount > inv.availableAmount)
            revert InsufficientInventory(_amount, inv.availableAmount);

        inv.availableAmount -= _amount;
        Trade storage parentTrade = trades[_listingId];
        if (parentTrade.cryptoAmount >= _amount) {
            parentTrade.cryptoAmount -= _amount;
        }
        if (inv.availableAmount == 0 && inv.allocatedAmount == 0) {
            inv.active = false;
            parentTrade.status = TradeStatus.Resolved;
        }

        if (!usdc.transfer(msg.sender, _amount)) revert TransferFailed();

        emit ListingInventoryWithdrawn(_listingId, msg.sender, _amount, inv.availableAmount);
    }

    function markFiatSent(
        uint256 _tradeId
    ) external inState(_tradeId, TradeStatus.Funded) onlyBuyer(_tradeId) {
        Trade storage t = trades[_tradeId];
        t.status     = TradeStatus.FiatSent;
        t.fiatSentAt = uint64(block.timestamp);

        emit FiatSentMarked(_tradeId, msg.sender);
    }

    function releaseFunds(
        uint256 _tradeId
    ) external inState(_tradeId, TradeStatus.FiatSent) onlySeller(_tradeId) {
        _completeTrade(_tradeId);
    }

    function oracleRelease(
        uint256 _tradeId,
        bytes32 _proofId
    ) external onlyOracle {
        Trade storage t = trades[_tradeId];

        if (t.status != TradeStatus.Funded && t.status != TradeStatus.FiatSent)
            revert InvalidState(t.status, TradeStatus.Funded);

        if (usedProofIds[_proofId]) revert Unauthorized();
        usedProofIds[_proofId] = true;
        t.proofId = _proofId;
        t.status  = TradeStatus.FiatSent;

        emit OracleProofSubmitted(_tradeId, _proofId);
        _completeTrade(_tradeId);
    }

    function _completeTrade(uint256 _tradeId) internal {
        Trade storage t = trades[_tradeId];
        t.status = TradeStatus.Completed;

        uint256 crypto    = t.cryptoAmount;
        uint256 fee       = (crypto * feeBps) / 10_000;
        uint256 buyerGets = crypto - fee;

        uint256 collateral = t.buyerCollateral;
        t.buyerCollateral  = 0;

        uint256 parentId = childToParentListing[_tradeId];
        if (parentId == 0 && listingInventories[_tradeId].active) {
            parentId = _tradeId;
        }
        if (parentId != 0) {
            SellerListingInventory storage inv = listingInventories[parentId];
            if (inv.allocatedAmount >= crypto) {
                inv.allocatedAmount -= crypto;
            }
            if (inv.activeChildTradeId == _tradeId) {
                inv.activeChildTradeId = 0;
            }
            if (inv.availableAmount == 0 && inv.allocatedAmount == 0) {
                inv.active = false;
                trades[parentId].status = TradeStatus.Completed;
            }
        }

        if (!usdc.transfer(t.buyer, buyerGets)) revert TransferFailed();
        if (fee > 0) {
            if (!usdc.transfer(treasuryWallet, fee)) revert TransferFailed();
        }
        if (collateral > 0) {
            if (!usdc.transfer(t.buyer, collateral)) revert TransferFailed();
        }

        emit TradeCompleted(_tradeId, t.buyer, buyerGets, fee);
    }

    function raiseDispute(
        uint256 _tradeId
    ) external inState(_tradeId, TradeStatus.FiatSent) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.seller && msg.sender != t.buyer) revert Unauthorized();
        if (block.timestamp > t.fiatSentAt + DISPUTE_WINDOW)
            revert SlashWindowExpired();

        t.status = TradeStatus.Disputed;
        emit TradeDisputed(_tradeId, msg.sender);
    }

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
            _completeTrade(_tradeId);
            emit TradeResolved(_tradeId, t.buyer, false);
        } else {
            uint256 crypto     = t.cryptoAmount;
            uint256 collateral = t.buyerCollateral;
            t.buyerCollateral  = 0;

            uint256 parentId = childToParentListing[_tradeId];
            if (parentId != 0 && listingInventories[parentId].active) {
                SellerListingInventory storage inv = listingInventories[parentId];
                if (inv.allocatedAmount >= crypto) {
                    inv.allocatedAmount -= crypto;
                }
                inv.availableAmount += crypto;
                if (inv.activeChildTradeId == _tradeId) {
                    inv.activeChildTradeId = 0;
                }
            } else {
                if (!usdc.transfer(t.seller, crypto)) revert TransferFailed();
            }

            if (collateral > 0) {
                if (!usdc.transfer(t.buyer, collateral)) revert TransferFailed();
            }

            emit TradeResolved(_tradeId, t.seller, false);
        }
    }

    /**
     * @notice Reclaims an expired unallocated trade or releases an expired unpaid child allocation
     *         back to the parent listing's available inventory after `RELEASE_TIMEOUT`.
     */
    function reclaimExpiredTrade(
        uint256 _tradeId
    ) external {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.seller && msg.sender != oracleAddress) revert Unauthorized();

        if (t.status == TradeStatus.Created) {
            if (block.timestamp < t.createdAt + RELEASE_TIMEOUT) revert Unauthorized();
            SellerListingInventory storage inv = listingInventories[_tradeId];
            if (inv.active && inv.allocatedAmount > 0) revert Unauthorized();
            uint256 refundAmt = inv.active ? inv.availableAmount : t.cryptoAmount;
            if (inv.active) {
                inv.availableAmount = 0;
                inv.active = false;
            }
            t.status = TradeStatus.Resolved;
            if (refundAmt > 0) {
                if (!usdc.transfer(t.seller, refundAmt)) revert TransferFailed();
            }
        } else if (t.status == TradeStatus.Funded) {
            if (block.timestamp < t.fundedAt + RELEASE_TIMEOUT) revert Unauthorized();
            t.status = TradeStatus.Resolved;
            uint256 parentId = childToParentListing[_tradeId];
            if (parentId != 0 && listingInventories[parentId].active) {
                SellerListingInventory storage inv = listingInventories[parentId];
                if (inv.allocatedAmount >= t.cryptoAmount) {
                    inv.allocatedAmount -= t.cryptoAmount;
                }
                inv.availableAmount += t.cryptoAmount;
                if (inv.activeChildTradeId == _tradeId) {
                    inv.activeChildTradeId = 0;
                }
            } else if (listingInventories[_tradeId].active) {
                SellerListingInventory storage inv = listingInventories[_tradeId];
                if (inv.allocatedAmount >= t.cryptoAmount) {
                    inv.allocatedAmount -= t.cryptoAmount;
                }
                inv.availableAmount += t.cryptoAmount;
                inv.activeChildTradeId = 0;
                t.buyer = address(0);
                t.status = TradeStatus.Created;
            } else {
                if (!usdc.transfer(t.seller, t.cryptoAmount)) revert TransferFailed();
            }
            if (t.buyerCollateral > 0) {
                uint256 c = t.buyerCollateral;
                t.buyerCollateral = 0;
                if (!usdc.transfer(t.buyer, c)) revert TransferFailed();
            }
        } else {
            revert InvalidState(t.status, TradeStatus.Created);
        }
    }

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

    function getTrade(uint256 _tradeId) external view returns (Trade memory) {
        return trades[_tradeId];
    }

    function getListingInventory(uint256 _listingId) external view returns (SellerListingInventory memory) {
        return listingInventories[_listingId];
    }

    function calculateNetRelease(
        uint256 _tradeId
    ) external view returns (uint256 buyerReceives, uint256 platformFee) {
        uint256 crypto = trades[_tradeId].cryptoAmount;
        platformFee    = (crypto * feeBps) / 10_000;
        buyerReceives  = crypto - platformFee;
    }
}
