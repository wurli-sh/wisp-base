import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSafeEmailContent, buildEmail } from "../../src/delivery/notifications.js";

describe("email template", () => {
  it("includes inbox URL and generic copy", () => {
    const email = buildEmail({ appOrigin: "http://localhost:3000" });
    assert.equal(email.subject, "You have a stock gift waiting in Wisp");
    assert.match(email.text, /http:\/\/localhost:3000\/inbox/);
    assert.match(email.html, /Inbox/);
  });

  it("rejects forbidden gift details", () => {
    assert.throws(
      () =>
        assertSafeEmailContent({
          subject: "gift",
          text: "You got wAAPL worth $25",
          html: "<p>wAAPL</p>",
        }),
      /notification_unavailable/,
    );
  });

  it("rejects addresses and signatures", () => {
    assert.throws(
      () =>
        assertSafeEmailContent({
          subject: "x",
          text: "sig signature present",
          html: "<p>ok</p>",
        }),
      /notification_unavailable/,
    );
  });
});
