# Security Policy

This repository is the Covia TypeScript SDK, published to npm as [`@covia/covia-sdk`](https://www.npmjs.com/package/@covia/covia-sdk). Applications use it to sign requests, hold venue credentials and mint capability tokens, so we take security reports seriously and appreciate the time researchers spend to make it safer.

## Reporting a vulnerability

**Please do not open a public issue, discussion, or pull request for a security vulnerability.**

Report privately through one of:

- **GitHub Private Vulnerability Reporting** (preferred) — on this repository, go to the **Security** tab → **Report a vulnerability**. This keeps the report and our coordination private until a fix is ready.
- **Email** — [security@covia.ai](mailto:security@covia.ai). Encrypt with our PGP key if you can; if you need the key, ask in the first (unencrypted) message and we'll respond.

Please include, as far as you can:

- a description of the issue and its impact;
- the affected package version (`npm ls @covia/covia-sdk`) or commit (`git rev-parse HEAD`);
- steps to reproduce, a proof of concept, or a failing request;
- any suggested remediation.

## What to expect

- **Acknowledgement** within **3 business days**.
- An initial **assessment and severity** within **10 business days**.
- Regular updates as we work on a fix, and credit in the release notes once it ships (unless you prefer to remain anonymous).
- **Coordinated disclosure:** we'll agree a disclosure timeline with you and publish an advisory when a fix is available. Please give us reasonable time to remediate before going public.

We will not pursue legal action against researchers who act in good faith, avoid privacy violations and service disruption, and follow this policy.

## Supported versions

Security fixes land on `develop` and ship in the next npm release; we do not backport to older versions.

| Version | Supported |
|---------|-----------|
| Latest `1.x` release on npm | ✅ |
| Older releases | ❌ — upgrade to the latest |

Releases are published from GitHub Actions with npm trusted publishing, so every version carries [provenance](https://docs.npmjs.com/generating-provenance-statements). A version without provenance was not published by this repository.

## Scope

**In scope** — vulnerabilities in this repository and the published package, including:

- credential handling: `Ed25519Auth` (raw keys and signer-based / non-extractable WebCrypto keys), `BearerAuth`, `BasicAuth`, and identity tokens;
- JWT and UCAN creation, signing, delegation and verification helpers (`src/crypto/`);
- DID resolution and venue discovery, including the scheme chosen for a venue address (see "Connecting to a Venue" in the README);
- leaks of credentials, tokens or secrets in requests, logs or errors;
- the release pipeline (`.github/workflows/publish.yml`) and anything that could let a tampered package reach npm.

**Out of scope** — typically not something we can fix here:

- vulnerabilities in a Covia venue server — report those to [covia-ai/covia](https://github.com/covia-ai/covia/security), and web app issues to [covia-ai/frontend](https://github.com/covia-ai/frontend/security) (if you're unsure where a problem lives, report it here and we'll route it);
- how an application stores the keys or tokens it passes to the SDK;
- venues you choose to connect to that are not operated by Covia;
- vulnerabilities in dependencies that already have a public advisory and a fix available (open a normal issue or PR to bump them).
