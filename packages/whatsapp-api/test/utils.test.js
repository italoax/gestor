import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrazilPhone, toJid, resolveSessionName } from "../src/utils.js";

test("normalizeBrazilPhone adiciona DDI 55 em celular brasileiro local", () => {
  assert.equal(normalizeBrazilPhone("(11) 99999-8888"), "5511999998888");
});

test("normalizeBrazilPhone preserva telefone já com DDI", () => {
  assert.equal(normalizeBrazilPhone("55 11 99999-8888"), "5511999998888");
});

test("toJid converte número para JID do WhatsApp", () => {
  assert.equal(toJid("(11) 99999-8888"), "5511999998888@s.whatsapp.net");
});

test("resolveSessionName usa default quando sessão está vazia", () => {
  assert.equal(resolveSessionName("", "default"), "default");
});

test("resolveSessionName sanitiza nome de sessão", () => {
  assert.equal(resolveSessionName(" loja 01!! ", "default"), "loja-01");
});
