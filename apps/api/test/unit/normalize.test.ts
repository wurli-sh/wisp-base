import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeIdentifier } from "../../src/auth/normalize.js";

describe("normalizeIdentifier", () => {
  it("lowercases and NFKC-normalizes email", () => {
    assert.equal(normalizeIdentifier("email", "  Alice@Example.COM "), "alice@example.com");
  });

  it("accepts google provider with email rules", () => {
    assert.equal(normalizeIdentifier("google", "Bob@Example.test"), "bob@example.test");
  });

  it("strips one leading @ from x handles", () => {
    assert.equal(normalizeIdentifier("x", "@Alice_Bob"), "alice_bob");
  });

  it("rejects invalid email", () => {
    assert.throws(() => normalizeIdentifier("email", "not-an-email"), /invalid_identifier/);
  });

  it("rejects invalid x handle", () => {
    assert.throws(() => normalizeIdentifier("x", "way_too_long_handle_name"), /invalid_identifier/);
  });
});
