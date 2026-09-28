# Licensing

Land BL runs only with a license issued for the PC it is installed on. Everything is offline:
the client sends you a machine code, you send back a license text, they paste it in.

## How it works

- **Machine code.** The app reads the Windows `MachineGuid` from the registry, hashes it with an
  app-specific salt and shows the first 16 hex characters as `7F3A-92C1-0B4E-D8A5`
  (`src/main/license/codec.ts`, `machine-id.ts`).
- **License.** A JSON payload `{ v, product, machineId, customerName, issuedAt, expiresAt }`,
  signed with Ed25519 (Node's built-in `crypto`), shown as a text block:

  ```
  -----BEGIN LAND BL LICENSE-----
  eyJ2IjoxLCJwcm9kdWN0IjoibGFuZC1ibCIs...
  -----END LAND BL LICENSE-----
  ```

  `expiresAt` is a date (valid through the end of that day, local time) or `null` for a
  permanent license.
- **Keys.** The app contains only the **public** key (`src/main/license/production-public-key.pem`,
  compiled in at build time). The **private** key, which signs licenses, never enters the repo.
- **In the app.** On startup the license is checked before anything else. Without a valid one the
  database is not opened and main refuses every IPC call except `license.*`; the only screen is the
  activation screen. The license is stored in `userData/license.lic`, outside the database, so
  backup and restore never touch it. Settings → الترخيص shows the customer and expiry and takes a
  renewal. The home page warns 30 days before expiry.
- **Clock rollback.** The app records the latest date it has seen (`userData/license-state.json`).
  If the clock goes back more than 2 days from it, or more than 2 days before the license's issue
  date, the license is refused until the clock is fixed. The check runs at startup and hourly.

## 1. Create the key pair (once)

Choose a folder **outside the repository** (the generator refuses a path inside this repo or any
git checkout), for example a USB drive:

```
npm run license -- keygen --private-key E:\land-bl-keys\land-bl-private.pem
```

This writes:

- the private key to the path you gave (never overwritten if it already exists), and
- the public key to `src/main/license/production-public-key.pem`. **Commit this file**: every
  build (`npm run dev`, `npm run build:win`) needs it.

It prints the key's fingerprint; note it with the backup.

Running `keygen` again when the app already has a public key is refused unless you add `--force`.
Replacing the key makes every license issued so far invalid for builds made afterwards: only do it
if the private key is lost or leaked, and then reissue every client's license.

## 2. Back up the private key and the log, together

The folder holding the private key also gets `issued-licenses.csv`, the record of every license
you issue. **Back up both files together**, in at least two places that are not this PC, for
example:

- the USB drive the key lives on, plus
- a second USB drive or an encrypted archive (e.g. 7-Zip with AES-256 and a strong password)
  kept somewhere else.

If the private key is lost, you cannot issue or renew any license: every client would need a new
installer built with a new key. If it leaks, anyone can issue licenses for your app. Never email
it, never put it in cloud sync without encryption, never copy it into the repo (`.gitignore`
ignores `*.pem`, `*.key`, `*private*key*`, `*.lic` and `issued-licenses.csv` as a safety net,
but the generator's refusal is the real guard).

## 3. Issue a license for a client

1. The client installs the app and opens it. The activation screen shows **رمز هذا الجهاز**
   with a copy button. They send you that code.
2. Issue the license:

   ```
   npm run license -- issue --private-key E:\land-bl-keys\land-bl-private.pem ^
     --machine 7F3A-92C1-0B4E-D8A5 --customer "مكتب التخليص، دمشق" ^
     --expires 2027-09-30 --note "first install" --out E:\land-bl-keys\client-name.lic
   ```

   - `--machine`: as the client sent it (dashes, spaces and case don't matter).
   - `--expires`: optional, `YYYY-MM-DD`. Leave it out for a permanent license.
   - `--note`: optional, free text for the log (invoice number, PC name…).
   - `--out`: optional; without it the license is printed. Prefer `--out`: the Windows console
     may show Arabic names garbled, though the license itself is correct.

   The generator checks that the private key matches the app's public key and that the app
   accepts the new license, then appends a row to `issued-licenses.csv`: issued date, customer
   name, machine code, expiry (`never` for a permanent one), note.
3. Send the `.lic` file (or its text) to the client. They paste the whole block, from the
   `BEGIN` line to the `END` line, into the activation screen and press **تفعيل**.

To check what a license file contains and whether its signature is valid:

```
npm run license -- inspect E:\land-bl-keys\client-name.lic
```

## Renewing

Issue a new license for the same machine code with a new `--expires`. The client pastes it in
Settings → الترخيص → تجديد الترخيص. If the pasted text is refused, the current license stays in
place.

## When the machine code changes

The code comes from the Windows installation, not the hardware. It changes when Windows is
reinstalled, or when a disk image is cloned onto another PC with a new `MachineGuid`. Hardware
changes and app updates do not change it. After a reinstall, the client sends the new code and you
issue a new license (the log tells you who they are and when their license ends).

If the app cannot read the `MachineGuid` at all, the activation screen says so and shows no code.

## Builds and tests

- `npm run build:win` builds with the production public key, then
  `scripts/check-license-key.mjs` refuses to package if the build contains the test key or lacks
  the production key.
- `npm run test:e2e` builds with `--mode e2e`, which compiles in the **test** key pair committed in
  `e2e/fixtures/`. The e2e tests sign their licenses with it (`e2e/license.ts`). That key is
  public, so a test build must never be shipped: the check above makes sure of it.
- `npm run dev` uses the production key too: issue yourself a license for your development PC
  like for any client (e.g. `--customer "Dev PC"`).
- The generator (`tools/license-generator/`) is never packaged: `electron-builder.yml` only takes
  `out/**` and excludes `tools/**`, `*.pem` and `issued-licenses.csv` explicitly.

## Limits

This keeps an installation from being copied to another PC and stops a license from being edited
(the signature covers every field). It is not copy protection against a determined person:

- the app's JavaScript in the installer can be read and patched to skip the check;
- deleting `license-state.json` resets the clock-rollback check (the issue date still acts as a
  floor).

Real protection would need code signing plus obfuscation, or an online check, which the offline
requirement rules out. This level was accepted for this client.
