import assert from "node:assert/strict";
import test from "node:test";
import { buildSie4Export, decodeSieBytes, encodeSieText, parseSie } from "../../lib/accounting/sie.ts";

test("SIE typ 4 export kan läsas tillbaka med svenska tecken och balanserade rader", () => {
  const bytes = buildSie4Export({
    companyName: "Åkeri & Bygg AB",
    organizationNumber: "556000-0000",
    generatedAt: new Date("2026-08-05T10:00:00Z"),
    fiscalYear: { startsOn: "2026-01-01", endsOn: "2026-12-31" },
    accounts: [
      { number: "1910", name: "Kassa" },
      { number: "3010", name: "Försäljning" },
    ],
    vouchers: [{
      number: "A00000001",
      date: "2026-08-05",
      description: "Försäljning åäö",
      lines: [
        { accountNumber: "1910", amount: 1250, description: "Betalning" },
        { accountNumber: "3010", amount: -1250, description: "Försäljning" },
      ],
    }],
  });

  const result = parseSie(bytes);
  assert.equal(result.type, "4");
  assert.equal(result.companyName, "Åkeri & Bygg AB");
  assert.equal(result.vouchers.length, 1);
  assert.equal(result.vouchers[0].balance, 0);
  assert.equal(result.transactionCount, 2);
  assert.deepEqual(result.warnings, []);
});

test("PC8-kodningen är deterministisk", () => {
  const source = "ÅÄÖ åäö é";
  assert.equal(decodeSieBytes(encodeSieText(source)), source);
});

test("obalanserade verifikationer flaggas men bokförs inte", () => {
  const content = [
    "#FLAGGA 0",
    "#PROGRAM \"Test\" \"1\"",
    "#FORMAT PC8",
    "#GEN 20260805 \"Test\"",
    "#SIETYP 4",
    "#FNAMN \"Testföretag\"",
    "#RAR 0 20260101 20261231",
    "#KONTO 1910 \"Kassa\"",
    "#VER \"A\" \"1\" 20260805 \"Test\"",
    "{",
    "#TRANS 1910 {} 100.00 20260805 \"Test\"",
    "}",
    "",
  ].join("\r\n");
  const result = parseSie(encodeSieText(content));
  assert.equal(result.vouchers[0].balance, 100);
  assert.match(result.warnings[0], /balanserar inte/);
});

test("andra SIE-typer avvisas för verifikationsimport", () => {
  assert.throws(
    () => parseSie(encodeSieText("#SIETYP 1\r\n#FNAMN \"Test\"\r\n")),
    /SIE typ 4/,
  );
});
