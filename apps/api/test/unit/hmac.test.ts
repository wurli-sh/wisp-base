import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { identityLookupHash } from "../../src/delivery/pending.js";

describe("identity lookup HMAC", () => {
  const key = "0123456789abcdef0123456789abcdef";

  it("is stable for the same input", () => {
    const a = identityLookupHash(key, "email", "alice@example.test");
    const b = identityLookupHash(key, "email", "alice@example.test");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("separates email and x namespaces", () => {
    const emailHash = identityLookupHash(key, "email", "alice");
    const xHash = identityLookupHash(key, "x", "alice");
    assert.notEqual(emailHash, xHash);
  });

  it("separates basename-address namespace", () => {
    const addr = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
    const hash = identityLookupHash(key, "basename-address:84532", addr.toLowerCase());
    const emailHash = identityLookupHash(key, "email", addr.toLowerCase());
    assert.notEqual(hash, emailHash);
  });
});
