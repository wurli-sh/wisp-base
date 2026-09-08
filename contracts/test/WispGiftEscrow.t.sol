// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {WispTestBase} from "./WispTestBase.sol";
import {WispGiftEscrow} from "../src/WispGiftEscrow.sol";
import {WispAssetRegistry} from "../src/WispAssetRegistry.sol";
import {WispDemoStockRouter} from "../src/WispDemoStockRouter.sol";
import {MockStock} from "./helpers/MockStock.sol";
import {FeeOnTransferToken} from "./helpers/FeeOnTransferToken.sol";
import {ReentrantToken} from "./helpers/ReentrantToken.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract WispGiftEscrowTest is WispTestBase {
    function setUp() public {
        setUpBase();
    }

    function test_createGift_enabledToken() public {
        stock.mint(sender, 10 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();

        vm.startPrank(sender);
        stock.approve(address(escrow), 5 ether);
        uint256 giftId = escrow.createGift(address(stock), 5 ether, unlockAt, expiresAt);
        vm.stopPrank();

        assertEq(giftId, 1);
        WispGiftEscrow.Gift memory g = escrow.getGift(giftId);
        assertEq(g.amount, 5 ether);
        assertEq(uint8(g.status), uint8(WispGiftEscrow.GiftStatus.Funded));
        assertEq(escrow.lockedByToken(address(stock)), 5 ether);
    }

    function test_createGift_rejectsDisabledZeroFeeOnTransfer() public {
        (uint64 unlockAt, uint64 expiresAt) = _window();

        vm.expectRevert(WispGiftEscrow.ZeroAmount.selector);
        vm.prank(sender);
        escrow.createGift(address(stock), 0, unlockAt, expiresAt);

        MockStock disabled = new MockStock("x", "x", 18);
        disabled.mint(sender, 1 ether);
        vm.startPrank(sender);
        disabled.approve(address(escrow), 1 ether);
        vm.expectRevert(WispGiftEscrow.TokenNotEnabled.selector);
        escrow.createGift(address(disabled), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        FeeOnTransferToken fee = new FeeOnTransferToken();
        vm.prank(owner);
        registry.setAsset(
            address(fee),
            WispAssetRegistry.AssetConfig({enabled: true, decimals: 18, usdPriceE6: 1e6, assetKey: keccak256("FEE")})
        );
        fee.mint(sender, 100 ether);
        vm.startPrank(sender);
        fee.approve(address(escrow), 100 ether);
        vm.expectRevert(WispGiftEscrow.FeeOnTransferUnsupported.selector);
        escrow.createGift(address(fee), 100 ether, unlockAt, expiresAt);
        vm.stopPrank();
    }

    function test_router_buyAndGift_accounting() public {
        usdc.faucet(sender, 632e6);
        (uint64 unlockAt, uint64 expiresAt) = _window();

        vm.startPrank(sender);
        usdc.approve(address(router), 632e6);
        (uint256 giftId, uint256 stockAmount) = router.buyAndGift(address(stock), 632e6, 2 ether, unlockAt, expiresAt);
        vm.stopPrank();

        assertEq(stockAmount, 2 ether);
        assertEq(usdc.balanceOf(treasury), 632e6);
        assertEq(stock.balanceOf(address(escrow)), 2 ether);
        assertEq(escrow.lockedByToken(address(stock)), 2 ether);
        assertEq(escrow.getGift(giftId).sender, sender);
    }

    function test_router_minStockAmount() public {
        usdc.faucet(sender, 316e6);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        usdc.approve(address(router), 316e6);
        vm.expectRevert();
        router.buyAndGift(address(stock), 316e6, 2 ether, unlockAt, expiresAt);
        vm.stopPrank();
    }

    function test_undercollateralized_prefund() public {
        (uint64 unlockAt, uint64 expiresAt) = _window();
        // Drain router inventory into a temp address so escrow has no stock.
        uint256 bal = stock.balanceOf(address(router));
        vm.prank(address(router));
        assertTrue(stock.transfer(address(0xBEEF), bal));

        // Manually call registerPrefundedGift as router without transferring stock.
        vm.prank(address(router));
        vm.expectRevert(WispGiftEscrow.Undercollateralized.selector);
        escrow.registerPrefundedGift(sender, address(stock), 1 ether, unlockAt, expiresAt);
    }

    function test_giftIds_monotonic() public {
        stock.mint(sender, 3 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        stock.approve(address(escrow), 3 ether);
        assertEq(escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt), 1);
        assertEq(escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt), 2);
        assertEq(escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt), 3);
        vm.stopPrank();
    }

    function test_claim_beforeUnlock_reverts_atUnlock_ok() public {
        stock.mint(sender, 1 ether);
        uint64 unlockAt = uint64(block.timestamp + 1 days);
        uint64 expiresAt = uint64(block.timestamp + 7 days);
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        uint64 deadline = uint64(block.timestamp + 30 days);
        bytes memory sig = _signClaim(giftId, recipient, deadline);

        vm.expectRevert(WispGiftEscrow.GiftLocked.selector);
        vm.prank(relayer);
        escrow.claim(giftId, recipient, deadline, sig);

        vm.warp(unlockAt);
        vm.prank(relayer);
        escrow.claim(giftId, recipient, deadline, sig);
        assertEq(stock.balanceOf(recipient), 1 ether);
        assertEq(uint8(escrow.getGift(giftId).status), uint8(WispGiftEscrow.GiftStatus.Claimed));
    }

    function test_claim_atExpiry_reverts() public {
        stock.mint(sender, 1 ether);
        uint64 unlockAt = uint64(block.timestamp);
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        vm.warp(expiresAt);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signClaim(giftId, recipient, deadline);
        vm.expectRevert(WispGiftEscrow.GiftExpired.selector);
        escrow.claim(giftId, recipient, deadline, sig);
    }

    function test_claim_expiredAuth_and_wrongFields() public {
        stock.mint(sender, 1 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        uint64 past = uint64(block.timestamp - 1);
        bytes memory expiredSig = _signClaim(giftId, recipient, past);
        vm.expectRevert(WispGiftEscrow.AuthorizationExpired.selector);
        escrow.claim(giftId, recipient, past, expiredSig);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory wrongGift = _signClaim(giftId + 1, recipient, deadline);
        vm.expectRevert(WispGiftEscrow.InvalidAuthorization.selector);
        escrow.claim(giftId, recipient, deadline, wrongGift);

        bytes memory wrongRecipient = _signClaim(giftId, sender, deadline);
        vm.expectRevert(WispGiftEscrow.InvalidAuthorization.selector);
        escrow.claim(giftId, recipient, deadline, wrongRecipient);
    }

    function test_claim_relayerPaysSignedRecipient_secondClaimReverts() public {
        stock.mint(sender, 1 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signClaim(giftId, recipient, deadline);
        vm.prank(relayer);
        escrow.claim(giftId, recipient, deadline, sig);
        assertEq(stock.balanceOf(recipient), 1 ether);
        assertEq(stock.balanceOf(relayer), 0);

        vm.expectRevert(WispGiftEscrow.GiftNotFunded.selector);
        escrow.claim(giftId, recipient, deadline, sig);
    }

    function test_refund_rules() public {
        stock.mint(sender, 1 ether);
        uint64 unlockAt = uint64(block.timestamp);
        uint64 expiresAt = uint64(block.timestamp + 2 days);
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        vm.expectRevert(WispGiftEscrow.GiftNotExpired.selector);
        vm.prank(sender);
        escrow.refund(giftId);

        vm.warp(expiresAt);
        vm.expectRevert(WispGiftEscrow.NotSender.selector);
        vm.prank(recipient);
        escrow.refund(giftId);

        vm.prank(sender);
        escrow.refund(giftId);
        assertEq(stock.balanceOf(sender), 1 ether);

        vm.expectRevert(WispGiftEscrow.GiftNotFunded.selector);
        vm.prank(sender);
        escrow.refund(giftId);
    }

    function test_claimedCannotRefund_refundedCannotClaim() public {
        stock.mint(sender, 2 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        stock.approve(address(escrow), 2 ether);
        uint256 claimedId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        uint256 refundId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        uint64 deadline = uint64(block.timestamp + 30 days);
        bytes memory claimSig = _signClaim(claimedId, recipient, deadline);
        escrow.claim(claimedId, recipient, deadline, claimSig);

        vm.expectRevert(WispGiftEscrow.GiftNotFunded.selector);
        vm.prank(sender);
        escrow.refund(claimedId);

        vm.warp(expiresAt);
        vm.prank(sender);
        escrow.refund(refundId);

        bytes memory refundedClaimSig = _signClaim(refundId, recipient, deadline);
        vm.expectRevert(WispGiftEscrow.GiftNotFunded.selector);
        escrow.claim(refundId, recipient, deadline, refundedClaimSig);
    }

    function test_pausedAllowsRefund() public {
        stock.mint(sender, 1 ether);
        uint64 unlockAt = uint64(block.timestamp);
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        vm.prank(owner);
        escrow.pause();

        uint64 deadline = uint64(block.timestamp + 30 days);
        bytes memory sig = _signClaim(giftId, recipient, deadline);
        vm.expectRevert();
        escrow.claim(giftId, recipient, deadline, sig);

        vm.warp(expiresAt);
        vm.prank(sender);
        escrow.refund(giftId);
        assertEq(stock.balanceOf(sender), 1 ether);
    }

    function test_signerRotation() public {
        stock.mint(sender, 1 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        (address newSigner, uint256 newPk) = makeAddrAndKey("newSigner");
        vm.prank(owner);
        escrow.setClaimSigner(newSigner);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory oldSig = _signClaim(giftId, recipient, deadline);
        vm.expectRevert(WispGiftEscrow.InvalidAuthorization.selector);
        escrow.claim(giftId, recipient, deadline, oldSig);

        bytes32 digest = escrow.claimAuthorizationDigest(giftId, recipient, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newPk, digest);
        escrow.claim(giftId, recipient, deadline, abi.encodePacked(r, s, v));
        assertEq(stock.balanceOf(recipient), 1 ether);
    }

    function test_surplusRescue_cannotTouchLocked() public {
        stock.mint(sender, 1 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        escrow.createGift(address(stock), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        stock.mint(address(escrow), 3 ether); // surplus
        vm.prank(owner);
        escrow.rescueSurplus(address(stock), owner, 3 ether);
        assertEq(stock.balanceOf(owner), 3 ether);
        assertEq(escrow.lockedByToken(address(stock)), 1 ether);

        vm.prank(owner);
        vm.expectRevert(WispGiftEscrow.NothingToRescue.selector);
        escrow.rescueSurplus(address(stock), owner, 1);
    }

    function test_reentrancy_cannotDoubleClaimOrRefund() public {
        ReentrantToken rtoken = new ReentrantToken();
        vm.prank(owner);
        registry.setAsset(
            address(rtoken),
            WispAssetRegistry.AssetConfig({enabled: true, decimals: 18, usdPriceE6: 1e6, assetKey: keccak256("RNT")})
        );
        rtoken.mint(sender, 1 ether);
        (uint64 unlockAt, uint64 expiresAt) = _window();
        vm.startPrank(sender);
        rtoken.approve(address(escrow), 1 ether);
        uint256 giftId = escrow.createGift(address(rtoken), 1 ether, unlockAt, expiresAt);
        vm.stopPrank();

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _signClaim(giftId, recipient, deadline);
        rtoken.configureAttack(escrow, giftId, recipient, deadline, sig, true, false);
        escrow.claim(giftId, recipient, deadline, sig);
        assertEq(rtoken.balanceOf(recipient), 1 ether);
    }

    function test_boundary_expiryWindow() public {
        stock.mint(sender, 1 ether);
        vm.startPrank(sender);
        stock.approve(address(escrow), 1 ether);
        uint64 unlockAt = uint64(block.timestamp);
        uint64 tooFar = uint64(block.timestamp + 30 days + 1);
        vm.expectRevert(WispGiftEscrow.ExpiryTooFar.selector);
        escrow.createGift(address(stock), 1 ether, unlockAt, tooFar);

        vm.expectRevert(WispGiftEscrow.InvalidTimestamps.selector);
        escrow.createGift(address(stock), 1 ether, unlockAt, unlockAt);
        vm.stopPrank();
    }

    function test_buyAndGiftWithPermit() public {
        uint256 pk = 0xB0B;
        address user = vm.addr(pk);
        usdc.faucet(user, 316e6);
        (uint64 unlockAt, uint64 expiresAt) = _window();

        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = _usdcPermitDigest(user, address(router), 316e6, usdc.nonces(user), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);

        vm.prank(user);
        (uint256 giftId,) =
            router.buyAndGiftWithPermit(address(stock), 316e6, 1 ether, unlockAt, expiresAt, deadline, v, r, s);
        assertEq(giftId, 1);
        assertEq(usdc.balanceOf(treasury), 316e6);
    }

    function _usdcPermitDigest(address owner_, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 PERMIT_TYPEHASH =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        return MessageHashUtils.toTypedDataHash(
            usdc.DOMAIN_SEPARATOR(), keccak256(abi.encode(PERMIT_TYPEHASH, owner_, spender, value, nonce, deadline))
        );
    }
}
