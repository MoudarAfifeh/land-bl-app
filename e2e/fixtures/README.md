# Test fixtures

`license-test-private.pem` / `license-test-public.pem` are a **test-only** license key pair.
`npm run test:e2e` builds with `--mode e2e`, which compiles the test public key into the app, and
the e2e tests sign their licenses with the test private key (`e2e/license.ts`).

This key is public (it is in the repo), so it proves nothing. A normal build uses
`src/main/license/production-public-key.pem`, and `npm run build:win` refuses to package a build
that contains the test key (`scripts/check-license-key.mjs`). See `docs/LICENSING.md`.
