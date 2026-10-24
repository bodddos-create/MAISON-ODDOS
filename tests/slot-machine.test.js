import test from "node:test";
import assert from "node:assert/strict";
import { prizes, reelIds, parseCode } from "../lib/roue-config.js";
import { staff, requestDb, sameOrigin } from "../lib/roue-server.js";
test("Each prize is represented by exactly three identical reels", () => {
  for (const p of prizes) assert.deepEqual(reelIds(p.id), [p.id, p.id, p.id]);
});
test("Losing and unknown outcomes never show three matching prizes", () => {
  for (const p of [null, undefined, "invalid"])
    assert.equal(new Set(reelIds(p)).size, 3);
});
test("The stock is fixed at 75 with the confirmed six quotas", () => {
  assert.equal(
    prizes.reduce((sum, p) => sum + p.count, 0),
    75,
  );
  assert.deepEqual(
    prizes.map((p) => p.count),
    [5, 5, 5, 20, 20, 20],
  );
});
test("Only the complete 128-bit voucher code is accepted", () => {
  assert.equal(parseCode("LMP-" + "a".repeat(32)), "LMP-" + "A".repeat(32));
  for (const value of [
    "",
    "LMP-123",
    "DEMO-123456789012",
    "https://evil.example/",
  ])
    assert.equal(parseCode(value), null);
});
test("Foreign origins are rejected", () =>
  assert.equal(
    sameOrigin(
      new Request("https://pilotage.oddos.eu/api/roue/tirage", {
        headers: { origin: "https://other.example" },
      }),
    ),
    false,
  ));
test("Anonymous staff access is denied before any database request", async () =>
  assert.equal(
    await staff(new Request("https://example.test"), {
      url: "https://db.test",
      key: "test",
    }),
    null,
  ));
test("Staff authorization verifies the user and restaurant assignment", async () => {
  const original = globalThis.fetch;
  try {
    for (const [role, establishment, allowed] of [
      ["direction", null, true],
      ["administratif", null, true],
      ["reservation_staff", "55c6e880-aa0c-40d6-9065-b5315b1a602a", true],
      ["reservation_staff", "8395bf22-99cb-4a7b-9096-ca734d583d83", false],
      ["unknown", null, false],
    ]) {
      globalThis.fetch = async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("/auth/v1/user")
              ? { id: "user-verified" }
              : [{ role, establishment_id: establishment }],
          ),
          { status: 200 },
        );
      const user = await staff(
        new Request("https://app.test", {
          headers: { authorization: "Bearer fixture-token" },
        }),
        { url: "https://db.test", key: "fixture" },
      );
      assert.equal(!!user, allowed);
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("A successful minimal database update can return an empty body", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(
      await requestDb(
        { url: "https://db.test", key: "fixture" },
        "wheel_entries",
        { method: "PATCH" },
      ),
      null,
    );
  } finally {
    globalThis.fetch = original;
  }
});
