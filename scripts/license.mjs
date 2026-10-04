#!/usr/bin/env node
// ddugit license issuing, with Node's built-in Ed25519 (no dependencies).
//
//   node scripts/license.mjs keygen [private.pem]
//       Makes the issuer key pair. Prints the public key for the build
//       (GitHub Actions variable DDUGIT_LICENSE_PUBKEY) and writes the private
//       key to private.pem. Keep that file secret and out of the repository:
//       whoever has it can issue licenses.
//
//   node scripts/license.mjs sign --key private.pem --name "Acme Corp" --email it@acme.example \
//       [--kind commercial|site] [--seats 1] [--until 2027-10-02] [--id lic_123]
//       [--plan monthly|yearly --expires 2026-11-11]
//       Prints a license text (DDUGIT1.<payload>.<signature>) to send to the buyer.
//       A subscription (--plan) expires on --expires (paid through + 7 days); the
//       license-refresh function in ddugit-site renews it while it is paid. Without
//       --plan it is a site license with no expiry (air-gapped sites).
//
//   node scripts/license.mjs verify --pub <base64url> <license text>
//       Checks a license the way the app does.
//
// The web hook that issues licenses after a Lemon Squeezy purchase signs the
// same payload with the same key (see docs/RELEASE.md).

import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const b64 = (buf) => Buffer.from(buf).toString("base64url");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const today = () => new Date().toISOString().slice(0, 10);
const yearLater = () => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

export function licenseText(privateKey, info) {
  const payload = Buffer.from(JSON.stringify(info));
  return `DDUGIT1.${b64(payload)}.${b64(sign(null, payload, privateKey))}`;
}

export function check(publicB64, text) {
  const [prefix, payload, sig] = text.replace(/\s+/g, "").split(".");
  if (prefix !== "DDUGIT1" || !payload || !sig) throw new Error("not a ddugit license");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicB64 }, format: "jwk" });
  const data = Buffer.from(payload, "base64url");
  if (!verify(null, data, key, Buffer.from(sig, "base64url"))) throw new Error("signature doesn't check out");
  return JSON.parse(data.toString());
}

const [cmd] = args;
if (cmd === "keygen") {
  const out = args[1] ?? "ddugit-license-private.pem";
  if (existsSync(out)) throw new Error(`${out} exists; not overwriting an issuer key`);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(out, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`private key: ${out} (keep it secret, never commit it)`);
  console.log(`DDUGIT_LICENSE_PUBKEY=${publicKey.export({ format: "jwk" }).x}`);
} else if (cmd === "sign") {
  const key = createPrivateKey(readFileSync(opt("key", "ddugit-license-private.pem")));
  const name = opt("name");
  const email = opt("email");
  if (!name || !email) throw new Error("--name and --email are required");
  const kind = opt("kind", "commercial");
  if (!["commercial", "site"].includes(kind)) throw new Error("--kind is commercial or site");
  const plan = opt("plan");
  const expires = opt("expires");
  if (plan && !["monthly", "yearly"].includes(plan)) throw new Error("--plan is monthly or yearly");
  if (Boolean(plan) !== Boolean(expires)) throw new Error("--plan and --expires go together");
  console.log(
    licenseText(key, {
      id: opt("id", `lic_${b64(randomBytes(9))}`),
      name,
      email,
      kind,
      seats: Number(opt("seats", "1")),
      issued: today(),
      updatesUntil: expires ?? opt("until", yearLater()),
      ...(plan ? { expires, plan } : {}),
    }),
  );
} else if (cmd === "verify") {
  console.log(check(opt("pub"), args[args.length - 1]));
} else if (cmd) {
  throw new Error(`unknown command: ${cmd}`);
}
