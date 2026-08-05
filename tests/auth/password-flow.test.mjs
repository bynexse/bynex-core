import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("företagsinloggning använder lösenord utan klientstyrd behörighet", async () => {
  const login = await read("app/login/page.tsx");
  assert.match(login, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(login, /safeAuthDestination/);
  assert.doesNotMatch(login, /service[_-]?role/i);
});

test("registrering kräver eget lösenord och bekräftelse", async () => {
  const signup = await read("app/signup/page.tsx");
  assert.match(signup, /signUp\(\{/);
  assert.match(signup, /password !== passwordConfirmation/);
  assert.match(signup, /minLength=\{10\}/);
});

test("återställningslänken går endast till skyddad lösenordssida", async () => {
  const reset = await read("app/login/reset-password/page.tsx");
  const callback = await read("app/auth/callback/route.ts");
  const proxy = await read("proxy.ts");
  assert.match(reset, /resetPasswordForEmail/);
  assert.match(reset, /\/account\/set-password/);
  assert.match(callback, /safeAuthDestination/);
  assert.match(proxy, /path\.startsWith\("\/account"\)/);
});
