import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Flagging System Contract", () => {
  beforeEach(() => {
    // Initialize governance token
    simnet.callPublicFn("governance-token", "initialize", [], deployer);
    
    // Distribute tokens to wallets for flagging
    simnet.callPublicFn(
      "governance-token",
      "transfer",
      [
        Cl.uint(10000000), // 10 tokens
        Cl.principal(deployer),
        Cl.principal(wallet2),
        Cl.none()
      ],
      deployer
    );

    simnet.callPublicFn(
      "governance-token",
      "transfer",
      [
        Cl.uint(10000000), // 10 tokens
        Cl.principal(deployer),
        Cl.principal(wallet3),
        Cl.none()
      ],
      deployer
    );

    // Register test content
    simnet.callPublicFn(
      "content-registry",
      "register-content",
      [
        Cl.stringAscii("QmTestContent"),
        Cl.stringAscii("Test Content"),
        Cl.stringAscii("general")
      ],
      wallet1
    );
  });

  describe("Content Flagging", () => {
    it("should flag content successfully", () => {
      const flagResult = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This content appears to be spam")
        ],
        wallet2
      );
      expect(flagResult.result).toBeOk(Cl.uint(1));

      // Check flag was created
      const flagData = simnet.callReadOnlyFn(
        "flagging-system",
        "get-flag",
        [Cl.uint(1)],
        deployer
      );
      
      expect(flagData.result).toBeSome(
        Cl.tuple({
          "content-id": Cl.uint(1),
          reporter: Cl.principal(wallet2),
          reason: Cl.stringAscii("spam"),
          description: Cl.stringAscii("This content appears to be spam"),
          timestamp: Cl.uint(simnet.blockHeight),
          resolved: Cl.bool(false),
          resolution: Cl.none()
        })
      );
    });

    it("should update content status to flagged", () => {
      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("harassment"),
          Cl.stringAscii("Contains harassment")
        ],
        wallet2
      );

      // Check content status was updated
      const statusResult = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(statusResult.result).toBeSome(Cl.stringAscii("flagged"));
    });

    it("should increment flag counters", () => {
      // Flag content
      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("misinformation"),
          Cl.stringAscii("Contains false information")
        ],
        wallet2
      );

      // Check content flag count
      const contentFlagCount = simnet.callReadOnlyFn(
        "flagging-system",
        "get-content-flag-count",
        [Cl.uint(1)],
        deployer
      );
      expect(contentFlagCount.result).toBeUint(1);

      // Check reporter flag count
      const reporterFlagCount = simnet.callReadOnlyFn(
        "flagging-system",
        "get-reporter-flag-count",
        [Cl.principal(wallet2)],
        deployer
      );
      expect(reporterFlagCount.result).toBeUint(1);

      // Check total flag count
      const totalFlagCount = simnet.callReadOnlyFn(
        "flagging-system",
        "get-total-flag-count",
        [],
        deployer
      );
      expect(totalFlagCount.result).toBeUint(1);
    });

    it("should fail with insufficient tokens", () => {
      // wallet1 has no governance tokens
      const flagResult = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This is spam")
        ],
        wallet1
      );
      expect(flagResult.result).toBeErr(Cl.uint(304)); // ERR_INSUFFICIENT_TOKENS
    });

    it("should fail with invalid reason", () => {
      const flagResult = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("invalid-reason"),
          Cl.stringAscii("Invalid reason")
        ],
        wallet2
      );
      expect(flagResult.result).toBeErr(Cl.uint(302)); // ERR_INVALID_REASON
    });

    it("should fail with non-existent content", () => {
      const flagResult = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(999),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This is spam")
        ],
        wallet2
      );
      expect(flagResult.result).toBeErr(Cl.uint(301)); // ERR_CONTENT_NOT_FOUND
    });

    it("should fail when user already flagged content", () => {
      // First flag
      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This is spam")
        ],
        wallet2
      );

      // Try to flag again
      const secondFlagResult = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("harassment"),
          Cl.stringAscii("This is harassment")
        ],
        wallet2
      );
      expect(secondFlagResult.result).toBeErr(Cl.uint(303)); // ERR_ALREADY_FLAGGED
    });

    it("should fail when content author tries to flag own content", () => {
      // Give tokens to wallet1 (content author)
      simnet.callPublicFn(
        "governance-token",
        "transfer",
        [
          Cl.uint(5000000),
          Cl.principal(deployer),
          Cl.principal(wallet1),
          Cl.none()
        ],
        deployer
      );

      const flagResult = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("Flagging my own content")
        ],
        wallet1
      );
      expect(flagResult.result).toBeErr(Cl.uint(307)); // ERR_CANNOT_FLAG_OWN_CONTENT
    });

    it("should allow multiple users to flag same content", () => {
      // First user flags
      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This is spam")
        ],
        wallet2
      );

      // Second user flags
      const secondFlagResult = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("harassment"),
          Cl.stringAscii("This is harassment")
        ],
        wallet3
      );
      expect(secondFlagResult.result).toBeOk(Cl.uint(2));

      // Check content flag count
      const contentFlagCount = simnet.callReadOnlyFn(
        "flagging-system",
        "get-content-flag-count",
        [Cl.uint(1)],
        deployer
      );
      expect(contentFlagCount.result).toBeUint(2);
    });
  });

  describe("Flag Resolution", () => {
    beforeEach(() => {
      // Create a flag to resolve
      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This is spam")
        ],
        wallet2
      );
    });

    it("should allow contract owner to resolve flag", () => {
      const resolveResult = simnet.callPublicFn(
        "flagging-system",
        "resolve-flag",
        [Cl.uint(1), Cl.stringAscii("upheld")],
        deployer
      );
      expect(resolveResult.result).toBeOk(Cl.bool(true));

      // Check flag is resolved
      const isResolved = simnet.callReadOnlyFn(
        "flagging-system",
        "is-flag-resolved",
        [Cl.uint(1)],
        deployer
      );
      expect(isResolved.result).toBeBool(true);

      // Check resolution
      const resolution = simnet.callReadOnlyFn(
        "flagging-system",
        "get-flag-resolution",
        [Cl.uint(1)],
        deployer
      );
      expect(resolution.result).toBeSome(Cl.stringAscii("upheld"));
    });

    it("should not allow unauthorized users to resolve flag", () => {
      const resolveResult = simnet.callPublicFn(
        "flagging-system",
        "resolve-flag",
        [Cl.uint(1), Cl.stringAscii("rejected")],
        wallet2
      );
      expect(resolveResult.result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED
    });

    it("should fail to resolve non-existent flag", () => {
      const resolveResult = simnet.callPublicFn(
        "flagging-system",
        "resolve-flag",
        [Cl.uint(999), Cl.stringAscii("upheld")],
        deployer
      );
      expect(resolveResult.result).toBeErr(Cl.uint(305)); // ERR_FLAG_NOT_FOUND
    });

    it("should fail to resolve already resolved flag", () => {
      // First resolution
      simnet.callPublicFn(
        "flagging-system",
        "resolve-flag",
        [Cl.uint(1), Cl.stringAscii("upheld")],
        deployer
      );

      // Try to resolve again
      const secondResolveResult = simnet.callPublicFn(
        "flagging-system",
        "resolve-flag",
        [Cl.uint(1), Cl.stringAscii("rejected")],
        deployer
      );
      expect(secondResolveResult.result).toBeErr(Cl.uint(306)); // ERR_ALREADY_RESOLVED
    });
  });

  describe("Flag Queries", () => {
    beforeEach(() => {
      // Create test flags
      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This is spam")
        ],
        wallet2
      );
    });

    it("should check if user has flagged content", () => {
      const hasFlagged = simnet.callReadOnlyFn(
        "flagging-system",
        "has-user-flagged-content",
        [Cl.uint(1), Cl.principal(wallet2)],
        deployer
      );
      expect(hasFlagged.result).toBeBool(true);

      const hasNotFlagged = simnet.callReadOnlyFn(
        "flagging-system",
        "has-user-flagged-content",
        [Cl.uint(1), Cl.principal(wallet3)],
        deployer
      );
      expect(hasNotFlagged.result).toBeBool(false);
    });

    it("should get flag ID for content and reporter", () => {
      const flagId = simnet.callReadOnlyFn(
        "flagging-system",
        "get-flag-id",
        [Cl.uint(1), Cl.principal(wallet2)],
        deployer
      );
      expect(flagId.result).toBeSome(Cl.uint(1));
    });

    it("should check if content has flags", () => {
      const hasFlags = simnet.callReadOnlyFn(
        "flagging-system",
        "has-content-flags",
        [Cl.uint(1)],
        deployer
      );
      expect(hasFlags.result).toBeBool(true);
    });

    it("should get minimum token balance", () => {
      const minBalance = simnet.callReadOnlyFn(
        "flagging-system",
        "get-min-token-balance",
        [],
        deployer
      );
      expect(minBalance.result).toBeUint(1000000); // 1 token with 6 decimals
    });
  });
});
