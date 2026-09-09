import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { storedIntegerMatchesChainValue } from "../../src/chain/indexer.js";

describe("indexer integer normalization", () => {
  it("matches PostgREST numeric values returned as strings", () => {
    assert.equal(storedIntegerMatchesChainValue("31645569620253164", "31645569620253164"), true);
  });

  it("matches safely representable legacy numeric values", () => {
    assert.equal(storedIntegerMatchesChainValue(316, "316"), true);
  });

  it("rejects unsafe PostgREST numbers that may already be rounded", () => {
    assert.equal(storedIntegerMatchesChainValue(31645569620253164, "31645569620253164"), false);
  });

  it("does not match a different chain amount", () => {
    assert.equal(storedIntegerMatchesChainValue("10", "11"), false);
  });
});
