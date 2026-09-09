import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canTransitionGift } from "@wisp/shared";
import { assertTransition } from "../../src/gifts/state.js";

describe("gift state transitions", () => {
  it("allows draft to submitted", () => {
    assert.equal(canTransitionGift("draft", "submitted"), true);
    assert.doesNotThrow(() => assertTransition("draft", "submitted"));
  });

  it("allows funded to claimable", () => {
    assert.equal(canTransitionGift("funded", "claimable"), true);
  });

  it("blocks terminal backward moves", () => {
    assert.equal(canTransitionGift("claimed", "funded"), false);
    assert.throws(() => assertTransition("claimed", "funded"), /gift_already_terminal/);
  });

  it("treats identical state as allowed", () => {
    assert.equal(canTransitionGift("claimable", "claimable"), true);
  });
});
