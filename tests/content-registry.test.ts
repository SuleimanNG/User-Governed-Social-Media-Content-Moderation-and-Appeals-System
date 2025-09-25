import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Content Registry Contract", () => {
  describe("Content Registration", () => {
    it("should register content successfully", () => {
      const cid = "QmTestContentHash123";
      const title = "Test Content Title";
      const category = "general";

      const registerResult = simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii(cid),
          Cl.stringAscii(title),
          Cl.stringAscii(category)
        ],
        wallet1
      );
      expect(registerResult.result).toBeOk(Cl.uint(1));

      // Check content was stored correctly
      const contentResult = simnet.callReadOnlyFn(
        "content-registry",
        "get-content",
        [Cl.uint(1)],
        deployer
      );
      
      expect(contentResult.result).toBeSome(
        Cl.tuple({
          author: Cl.principal(wallet1),
          cid: Cl.stringAscii(cid),
          "created-at": Cl.uint(simnet.blockHeight),
          status: Cl.stringAscii("active"),
          title: Cl.stringAscii(title),
          category: Cl.stringAscii(category)
        })
      );
    });

    it("should increment content counter", () => {
      // Register first content
      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmFirst"),
          Cl.stringAscii("First Content"),
          Cl.stringAscii("general")
        ],
        wallet1
      );

      // Register second content
      const secondResult = simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmSecond"),
          Cl.stringAscii("Second Content"),
          Cl.stringAscii("tech")
        ],
        wallet2
      );
      expect(secondResult.result).toBeOk(Cl.uint(2));

      // Check total content count
      const totalCount = simnet.callReadOnlyFn(
        "content-registry",
        "get-total-content-count",
        [],
        deployer
      );
      expect(totalCount.result).toBeUint(2);
    });

    it("should fail with empty CID", () => {
      const registerResult = simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii(""),
          Cl.stringAscii("Test Title"),
          Cl.stringAscii("general")
        ],
        wallet1
      );
      expect(registerResult.result).toBeErr(Cl.uint(202)); // ERR_INVALID_CID
    });

    it("should fail with empty title", () => {
      const registerResult = simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmTestHash"),
          Cl.stringAscii(""),
          Cl.stringAscii("general")
        ],
        wallet1
      );
      expect(registerResult.result).toBeErr(Cl.uint(202)); // ERR_INVALID_CID (reused for title validation)
    });

    it("should fail with duplicate CID", () => {
      const cid = "QmDuplicateHash";
      
      // Register first content
      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii(cid),
          Cl.stringAscii("First Content"),
          Cl.stringAscii("general")
        ],
        wallet1
      );

      // Try to register with same CID
      const duplicateResult = simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii(cid),
          Cl.stringAscii("Second Content"),
          Cl.stringAscii("tech")
        ],
        wallet2
      );
      expect(duplicateResult.result).toBeErr(Cl.uint(203)); // ERR_CONTENT_ALREADY_EXISTS
    });

    it("should update author content count", () => {
      // Register multiple contents for wallet1
      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmFirst"),
          Cl.stringAscii("First Content"),
          Cl.stringAscii("general")
        ],
        wallet1
      );

      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmSecond"),
          Cl.stringAscii("Second Content"),
          Cl.stringAscii("tech")
        ],
        wallet1
      );

      // Check author content count
      const authorCount = simnet.callReadOnlyFn(
        "content-registry",
        "get-author-content-count",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(authorCount.result).toBeUint(2);
    });
  });

  describe("Content Status Management", () => {
    beforeEach(() => {
      // Register a test content
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

    it("should allow content author to update status", () => {
      const updateResult = simnet.callPublicFn(
        "content-registry",
        "update-content-status",
        [Cl.uint(1), Cl.stringAscii("flagged")],
        wallet1
      );
      expect(updateResult.result).toBeOk(Cl.bool(true));

      // Check status was updated
      const statusResult = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-status",
        [Cl.uint(1)],
        deployer
      );
      expect(statusResult.result).toBeSome(Cl.stringAscii("flagged"));
    });

    it("should allow contract owner to update status", () => {
      const updateResult = simnet.callPublicFn(
        "content-registry",
        "update-content-status",
        [Cl.uint(1), Cl.stringAscii("removed")],
        deployer
      );
      expect(updateResult.result).toBeOk(Cl.bool(true));
    });

    it("should not allow unauthorized users to update status", () => {
      const updateResult = simnet.callPublicFn(
        "content-registry",
        "update-content-status",
        [Cl.uint(1), Cl.stringAscii("removed")],
        wallet2
      );
      expect(updateResult.result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });

    it("should fail with invalid status", () => {
      const updateResult = simnet.callPublicFn(
        "content-registry",
        "update-content-status",
        [Cl.uint(1), Cl.stringAscii("invalid-status")],
        wallet1
      );
      expect(updateResult.result).toBeErr(Cl.uint(204)); // ERR_INVALID_STATUS
    });

    it("should fail with non-existent content", () => {
      const updateResult = simnet.callPublicFn(
        "content-registry",
        "update-content-status",
        [Cl.uint(999), Cl.stringAscii("flagged")],
        wallet1
      );
      expect(updateResult.result).toBeErr(Cl.uint(201)); // ERR_CONTENT_NOT_FOUND
    });
  });

  describe("Content Queries", () => {
    beforeEach(() => {
      // Register test contents with different statuses
      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmActive"),
          Cl.stringAscii("Active Content"),
          Cl.stringAscii("general")
        ],
        wallet1
      );

      simnet.callPublicFn(
        "content-registry",
        "register-content",
        [
          Cl.stringAscii("QmFlagged"),
          Cl.stringAscii("Flagged Content"),
          Cl.stringAscii("tech")
        ],
        wallet1
      );

      // Update second content to flagged
      simnet.callPublicFn(
        "content-registry",
        "update-content-status",
        [Cl.uint(2), Cl.stringAscii("flagged")],
        wallet1
      );
    });

    it("should get content by CID", () => {
      const contentResult = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-by-cid",
        [Cl.stringAscii("QmActive")],
        deployer
      );
      
      expect(contentResult.result).toBeSome(
        Cl.tuple({
          author: Cl.principal(wallet1),
          cid: Cl.stringAscii("QmActive"),
          "created-at": Cl.uint(simnet.blockHeight - 1),
          status: Cl.stringAscii("active"),
          title: Cl.stringAscii("Active Content"),
          category: Cl.stringAscii("general")
        })
      );
    });

    it("should get content ID by CID", () => {
      const idResult = simnet.callReadOnlyFn(
        "content-registry",
        "get-content-id-by-cid",
        [Cl.stringAscii("QmFlagged")],
        deployer
      );
      expect(idResult.result).toBeSome(Cl.uint(2));
    });

    it("should check if content exists", () => {
      const existsResult = simnet.callReadOnlyFn(
        "content-registry",
        "content-exists",
        [Cl.uint(1)],
        deployer
      );
      expect(existsResult.result).toBeBool(true);

      const notExistsResult = simnet.callReadOnlyFn(
        "content-registry",
        "content-exists",
        [Cl.uint(999)],
        deployer
      );
      expect(notExistsResult.result).toBeBool(false);
    });

    it("should check content author", () => {
      const isAuthorResult = simnet.callReadOnlyFn(
        "content-registry",
        "is-content-author",
        [Cl.uint(1), Cl.principal(wallet1)],
        deployer
      );
      expect(isAuthorResult.result).toBeBool(true);

      const isNotAuthorResult = simnet.callReadOnlyFn(
        "content-registry",
        "is-content-author",
        [Cl.uint(1), Cl.principal(wallet2)],
        deployer
      );
      expect(isNotAuthorResult.result).toBeBool(false);
    });

    it("should check content status", () => {
      const isActiveResult = simnet.callReadOnlyFn(
        "content-registry",
        "is-content-active",
        [Cl.uint(1)],
        deployer
      );
      expect(isActiveResult.result).toBeBool(true);

      const isFlaggedResult = simnet.callReadOnlyFn(
        "content-registry",
        "is-content-flagged",
        [Cl.uint(2)],
        deployer
      );
      expect(isFlaggedResult.result).toBeBool(true);
    });
  });
});
