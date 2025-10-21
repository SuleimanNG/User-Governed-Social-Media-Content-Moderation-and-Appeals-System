import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const contentAuthor = accounts.get("wallet_1")!;
const voter1 = accounts.get("wallet_2")!;
const voter2 = accounts.get("wallet_3")!;
const voter3 = accounts.get("wallet_4")!;

describe("Content Moderation System Integration", () => {
  beforeEach(() => {
    // Initialize governance token
    simnet.callPublicFn("governance-token", "initialize", [], deployer);
    
    // Distribute tokens to voters
    const voterTokens = 50000000; // 50 tokens each
    [voter1, voter2, voter3].forEach(voter => {
      simnet.callPublicFn(
        "governance-token",
        "transfer",
        [
          Cl.uint(voterTokens),
          Cl.principal(deployer),
          Cl.principal(voter),
          Cl.none()
        ],
        deployer
      );
    });

    // Give some tokens to content author for potential appeals
    simnet.callPublicFn(
      "governance-token",
      "transfer",
      [
        Cl.uint(10000000), // 10 tokens
        Cl.principal(deployer),
        Cl.principal(contentAuthor),
        Cl.none()
      ],
      deployer
    );
  });

  describe("Complete Moderation Workflow", () => {
    it("should execute full content moderation workflow", () => {
      // Step 1: Content author posts content
      const registerResult = simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmControversialContent"),
          Cl.stringAscii("Controversial Post"),
          Cl.stringAscii("politics")
        ],
        contentAuthor
      );
      expect(registerResult.result).toBeOk(Cl.uint(1));

      // Verify content is active
      let contentStatus = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(contentStatus.result).toBeSome(Cl.stringAscii("active"));

      // Step 2: Community members flag the content
      const flagResult1 = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("misinformation"),
          Cl.stringAscii("This content contains false information")
        ],
        voter1
      );
      expect(flagResult1.result).toBeOk(Cl.uint(1));

      const flagResult2 = simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("hate-speech"),
          Cl.stringAscii("Contains hate speech")
        ],
        voter2
      );
      expect(flagResult2.result).toBeOk(Cl.uint(2));

      // Verify content status changed to flagged
      contentStatus = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(contentStatus.result).toBeSome(Cl.stringAscii("flagged"));

      // Step 3: Create moderation proposal
      const proposalResult = simnet.callPublicFn(
        "moderation-dao",
        "create-proposal",
        [
          Cl.uint(1),
          Cl.stringAscii("remove"),
          Cl.stringAscii("Content violates community guidelines")
        ],
        voter1
      );
      expect(proposalResult.result).toBeOk(Cl.uint(1));

      // Step 4: Community votes on the proposal
      // Vote to remove (for)
      const vote1Result = simnet.callPublicFn(
        "moderation-dao",
        "vote",
        [Cl.uint(1), Cl.bool(true)],
        voter1
      );
      expect(vote1Result.result).toBeOk(Cl.bool(true));

      const vote2Result = simnet.callPublicFn(
        "moderation-dao",
        "vote",
        [Cl.uint(1), Cl.bool(true)],
        voter2
      );
      expect(vote2Result.result).toBeOk(Cl.bool(true));

      // Vote to keep (against)
      const vote3Result = simnet.callPublicFn(
        "moderation-dao",
        "vote",
        [Cl.uint(1), Cl.bool(false)],
        voter3
      );
      expect(vote3Result.result).toBeOk(Cl.bool(true));

      // Step 5: Wait for voting period to end and execute proposal
      // Advance blocks to end voting period
      simnet.mineEmptyBlocks(150); // More than VOTING_PERIOD (144 blocks)

      const executeResult = simnet.callPublicFn(
        "moderation-dao",
        "execute-proposal",
        [Cl.uint(1)],
        deployer
      );
      expect(executeResult.result).toBeOk(Cl.stringAscii("approved"));

      // Verify content status changed to removed
      contentStatus = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(contentStatus.result).toBeSome(Cl.stringAscii("removed"));

      // Step 6: Content author creates an appeal
      const appealResult = simnet.callPublicFn(
        "appeals",
        "create-appeal",
        [
          Cl.uint(1),
          Cl.stringAscii("The content was educational and did not violate guidelines"),
          Cl.stringAscii("I have evidence that this content was taken out of context")
        ],
        contentAuthor
      );
      expect(appealResult.result).toBeOk(Cl.uint(1));

      // Verify content status changed to appealing
      contentStatus = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(contentStatus.result).toBeSome(Cl.stringAscii("appealing"));

      // Step 7: Community votes on the appeal
      // Vote to restore content (for)
      const appealVote1 = simnet.callPublicFn(
        "appeals",
        "vote-on-appeal",
        [Cl.uint(1), Cl.bool(true)],
        voter2
      );
      expect(appealVote1.result).toBeOk(Cl.bool(true));

      const appealVote2 = simnet.callPublicFn(
        "appeals",
        "vote-on-appeal",
        [Cl.uint(1), Cl.bool(true)],
        voter3
      );
      expect(appealVote2.result).toBeOk(Cl.bool(true));

      // Vote to keep removed (against)
      const appealVote3 = simnet.callPublicFn(
        "appeals",
        "vote-on-appeal",
        [Cl.uint(1), Cl.bool(false)],
        voter1
      );
      expect(appealVote3.result).toBeOk(Cl.bool(true));

      // Step 8: Wait for appeal voting period to end and resolve appeal
      simnet.mineEmptyBlocks(300); // More than APPEAL_VOTING_PERIOD (288 blocks)

      const resolveAppealResult = simnet.callPublicFn(
        "appeals",
        "resolve-appeal",
        [Cl.uint(1)],
        deployer
      );
      expect(resolveAppealResult.result).toBeOk(Cl.stringAscii("upheld"));

      // Verify content status changed back to active
      contentStatus = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(contentStatus.result).toBeSome(Cl.stringAscii("active"));

      // Verify appeal is resolved
      const isAppealResolved = simnet.callReadOnlyFn(
        "appeals",
        "is-appeal-resolved",
        [Cl.uint(1)],
        deployer
      );
      expect(isAppealResolved.result).toBeBool(true);
    });

    it("should handle rejected appeal workflow", () => {
      // Setup: Register content, flag it, create proposal, vote to remove, execute
      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmSpamContent"),
          Cl.stringAscii("Spam Post"),
          Cl.stringAscii("general")
        ],
        contentAuthor
      );

      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("spam"),
          Cl.stringAscii("This is clearly spam")
        ],
        voter1
      );

      simnet.callPublicFn(
        "moderation-dao",
        "create-proposal",
        [
          Cl.uint(1),
          Cl.stringAscii("remove"),
          Cl.stringAscii("Obvious spam content")
        ],
        voter1
      );

      // All voters agree to remove
      [voter1, voter2, voter3].forEach(voter => {
        simnet.callPublicFn(
          "moderation-dao",
          "vote",
          [Cl.uint(1), Cl.bool(true)],
          voter
        );
      });

      simnet.mineEmptyBlocks(150);
      simnet.callPublicFn("moderation-dao", "execute-proposal", [Cl.uint(1)], deployer);

      // Create appeal
      simnet.callPublicFn(
        "appeals",
        "create-appeal",
        [
          Cl.uint(1),
          Cl.stringAscii("This was not spam"),
          Cl.stringAscii("I have proof this was legitimate content")
        ],
        contentAuthor
      );

      // All voters reject the appeal
      [voter1, voter2, voter3].forEach(voter => {
        simnet.callPublicFn(
          "appeals",
          "vote-on-appeal",
          [Cl.uint(1), Cl.bool(false)],
          voter
        );
      });

      simnet.mineEmptyBlocks(300);
      const resolveResult = simnet.callPublicFn(
        "appeals",
        "resolve-appeal",
        [Cl.uint(1)],
        deployer
      );
      expect(resolveResult.result).toBeOk(Cl.stringAscii("rejected"));

      // Content should remain removed
      const contentStatus = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(contentStatus.result).toBeSome(Cl.stringAscii("removed"));
    });
  });

  describe("Governance Token Integration", () => {
    it("should use token balance for voting power", () => {
      // Register content and flag it
      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmTestContent"),
          Cl.stringAscii("Test Content"),
          Cl.stringAscii("general")
        ],
        contentAuthor
      );

      simnet.callPublicFn(
        "flagging-system",
        "flag-content",
        [
          Cl.uint(1),
          Cl.stringAscii("inappropriate"),
          Cl.stringAscii("Inappropriate content")
        ],
        voter1
      );

      // Create proposal
      simnet.callPublicFn(
        "moderation-dao",
        "create-proposal",
        [
          Cl.uint(1),
          Cl.stringAscii("remove"),
          Cl.stringAscii("Remove inappropriate content")
        ],
        voter1
      );

      // Vote with different token balances
      simnet.callPublicFn("moderation-dao", "vote", [Cl.uint(1), Cl.bool(true)], voter1);
      simnet.callPublicFn("moderation-dao", "vote", [Cl.uint(1), Cl.bool(true)], voter2);
      simnet.callPublicFn("moderation-dao", "vote", [Cl.uint(1), Cl.bool(false)], voter3);

      // Check proposal vote counts
      const proposalData = simnet.callReadOnlyFn(
        "moderation-dao",
        "get-proposal",
        [Cl.uint(1)],
        deployer
      );
      
      expect(proposalData.result).toBeSome(
        Cl.tuple({
          "content-id": Cl.uint(1),
          proposer: Cl.principal(voter1),
          "proposal-type": Cl.stringAscii("remove"),
          description: Cl.stringAscii("Remove inappropriate content"),
          "votes-for": Cl.uint(100000000), // 50M + 50M tokens
          "votes-against": Cl.uint(50000000), // 50M tokens
          "start-block": Cl.uint(simnet.blockHeight - 3),
          "end-block": Cl.uint(simnet.blockHeight - 3 + 144),
          executed: Cl.bool(false),
          result: Cl.none()
        })
      );
    });
  });
});
