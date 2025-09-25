import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Governance Token Contract", () => {
  beforeEach(() => {
    // Initialize the token before each test
    const initResult = simnet.callPublicFn(
      "governance-token",
      "initialize",
      [],
      deployer
    );
    expect(initResult.result).toBeOk(Cl.bool(true));
  });

  describe("Initialization", () => {
    it("should initialize token with correct parameters", () => {
      // Check token name
      const nameResult = simnet.callReadOnlyFn(
        "governance-token",
        "get-name",
        [],
        deployer
      );
      expect(nameResult.result).toBeOk(Cl.stringAscii("Content Moderation Governance Token"));

      // Check token symbol
      const symbolResult = simnet.callReadOnlyFn(
        "governance-token",
        "get-symbol",
        [],
        deployer
      );
      expect(symbolResult.result).toBeOk(Cl.stringAscii("CMGT"));

      // Check decimals
      const decimalsResult = simnet.callReadOnlyFn(
        "governance-token",
        "get-decimals",
        [],
        deployer
      );
      expect(decimalsResult.result).toBeOk(Cl.uint(6));

      // Check total supply
      const totalSupplyResult = simnet.callReadOnlyFn(
        "governance-token",
        "get-total-supply",
        [],
        deployer
      );
      expect(totalSupplyResult.result).toBeOk(Cl.uint(1000000000000));

      // Check deployer balance
      const balanceResult = simnet.callReadOnlyFn(
        "governance-token",
        "get-balance",
        [Cl.principal(deployer)],
        deployer
      );
      expect(balanceResult.result).toBeOk(Cl.uint(1000000000000));
    });

    it("should not allow double initialization", () => {
      const secondInitResult = simnet.callPublicFn(
        "governance-token",
        "initialize",
        [],
        deployer
      );
      expect(secondInitResult.result).toBeErr(Cl.uint(104)); // ERR_ALREADY_INITIALIZED
    });

    it("should not allow non-owner to initialize", () => {
      // Reset by creating a new simnet instance
      simnet = simnet.createEmptyBlock();
      
      const initResult = simnet.callPublicFn(
        "governance-token",
        "initialize",
        [],
        wallet1
      );
      expect(initResult.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });

  describe("Token Transfer", () => {
    it("should transfer tokens successfully", () => {
      const transferAmount = 1000000; // 1 token with 6 decimals
      
      const transferResult = simnet.callPublicFn(
        "governance-token",
        "transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(deployer),
          Cl.principal(wallet1),
          Cl.none()
        ],
        deployer
      );
      expect(transferResult.result).toBeOk(Cl.bool(true));

      // Check balances after transfer
      const deployerBalance = simnet.callReadOnlyFn(
        "governance-token",
        "get-balance",
        [Cl.principal(deployer)],
        deployer
      );
      expect(deployerBalance.result).toBeOk(Cl.uint(1000000000000 - transferAmount));

      const wallet1Balance = simnet.callReadOnlyFn(
        "governance-token",
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(wallet1Balance.result).toBeOk(Cl.uint(transferAmount));
    });

    it("should fail transfer with insufficient balance", () => {
      const transferAmount = 2000000000000; // More than total supply
      
      const transferResult = simnet.callPublicFn(
        "governance-token",
        "transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(deployer),
          Cl.principal(wallet1),
          Cl.none()
        ],
        deployer
      );
      expect(transferResult.result).toBeErr(Cl.uint(101)); // ERR_INSUFFICIENT_BALANCE
    });

    it("should fail transfer from wrong sender", () => {
      const transferAmount = 1000000;
      
      const transferResult = simnet.callPublicFn(
        "governance-token",
        "transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(deployer),
          Cl.principal(wallet1),
          Cl.none()
        ],
        wallet1 // Wrong sender
      );
      expect(transferResult.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });

  describe("Minting", () => {
    it("should allow owner to mint tokens", () => {
      const mintAmount = 1000000000; // 1000 tokens with 6 decimals
      
      const mintResult = simnet.callPublicFn(
        "governance-token",
        "mint",
        [Cl.uint(mintAmount), Cl.principal(wallet1)],
        deployer
      );
      expect(mintResult.result).toBeOk(Cl.bool(true));

      // Check recipient balance
      const wallet1Balance = simnet.callReadOnlyFn(
        "governance-token",
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(wallet1Balance.result).toBeOk(Cl.uint(mintAmount));

      // Check total supply increased
      const totalSupplyResult = simnet.callReadOnlyFn(
        "governance-token",
        "get-total-supply",
        [],
        deployer
      );
      expect(totalSupplyResult.result).toBeOk(Cl.uint(1000000000000 + mintAmount));
    });

    it("should not allow non-owner to mint", () => {
      const mintAmount = 1000000000;
      
      const mintResult = simnet.callPublicFn(
        "governance-token",
        "mint",
        [Cl.uint(mintAmount), Cl.principal(wallet1)],
        wallet1
      );
      expect(mintResult.result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });

  describe("Burning", () => {
    it("should allow token holder to burn tokens", () => {
      // First transfer some tokens to wallet1
      const transferAmount = 10000000; // 10 tokens
      simnet.callPublicFn(
        "governance-token",
        "transfer",
        [
          Cl.uint(transferAmount),
          Cl.principal(deployer),
          Cl.principal(wallet1),
          Cl.none()
        ],
        deployer
      );

      // Now burn some tokens
      const burnAmount = 5000000; // 5 tokens
      const burnResult = simnet.callPublicFn(
        "governance-token",
        "burn",
        [Cl.uint(burnAmount)],
        wallet1
      );
      expect(burnResult.result).toBeOk(Cl.bool(true));

      // Check balance decreased
      const wallet1Balance = simnet.callReadOnlyFn(
        "governance-token",
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(wallet1Balance.result).toBeOk(Cl.uint(transferAmount - burnAmount));

      // Check total supply decreased
      const totalSupplyResult = simnet.callReadOnlyFn(
        "governance-token",
        "get-total-supply",
        [],
        deployer
      );
      expect(totalSupplyResult.result).toBeOk(Cl.uint(1000000000000 - burnAmount));
    });

    it("should fail burn with insufficient balance", () => {
      const burnAmount = 1000000; // 1 token, but wallet1 has 0
      
      const burnResult = simnet.callPublicFn(
        "governance-token",
        "burn",
        [Cl.uint(burnAmount)],
        wallet1
      );
      expect(burnResult.result).toBeErr(Cl.uint(101)); // ERR_INSUFFICIENT_BALANCE
    });
  });

  describe("Read-only functions", () => {
    it("should return correct initialization status", () => {
      const isInitialized = simnet.callReadOnlyFn(
        "governance-token",
        "is-initialized",
        [],
        deployer
      );
      expect(isInitialized.result).toBeBool(true);
    });

    it("should return correct contract owner", () => {
      const owner = simnet.callReadOnlyFn(
        "governance-token",
        "get-contract-owner",
        [],
        deployer
      );
      expect(owner.result).toBePrincipal(deployer);
    });
  });
});
