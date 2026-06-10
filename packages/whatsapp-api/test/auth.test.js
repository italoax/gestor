import test from "node:test";
import assert from "node:assert/strict";
import { requireToken } from "../src/auth.js";

test("requireToken permite requisição com header token correto", () => {
  const middleware = requireToken("segredo");
  let nextCalled = false;

  middleware(
    { headers: { token: "segredo" } },
    { status: () => ({ json: () => assert.fail("não deveria bloquear") }) },
    () => { nextCalled = true; },
  );

  assert.equal(nextCalled, true);
});

test("requireToken permite Authorization Bearer correto", () => {
  const middleware = requireToken("segredo");
  let nextCalled = false;

  middleware(
    { headers: { authorization: "Bearer segredo" } },
    { status: () => ({ json: () => assert.fail("não deveria bloquear") }) },
    () => { nextCalled = true; },
  );

  assert.equal(nextCalled, true);
});

test("requireToken bloqueia token incorreto", () => {
  const middleware = requireToken("segredo");
  let statusCode = 0;
  let payload = null;

  middleware(
    { headers: { token: "errado" } },
    {
      status(code) {
        statusCode = code;
        return { json(body) { payload = body; } };
      },
    },
    () => assert.fail("não deveria chamar next"),
  );

  assert.equal(statusCode, 401);
  assert.equal(payload.ok, false);
});
