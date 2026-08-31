# Changelog

All notable changes to Sheeternetes are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is based on
however many zeroes we feel like, because the spreadsheet is eternal.

## [v0.0.0.0.0.2] — "The Registry" — 2026-08-31

### Added
- Public, verifiable **CSFE credential registry** under `docs/registry/` — browsable
  on GitHub and served on Pages. Every credential gets a **sequential serial**
  (`SFE000001`, `SFE000002`, …) assigned by an automated workflow.
- **`verify.html`** — look up any holder by serial or GitHub username, render the
  certificate, and download it as SVG. For HR, hiring managers, and sceptics.
- **Issuance pipeline**: an Issue Form (`certify.yml`) plus a GitHub Action that
  assigns the serial, writes the registry (race-free via a concurrency group),
  comments the verification link, and closes the request. One credential per account.

### Changed
- Exam answers are now **shuffled** — the correct option is no longer always first.
- Certificates are issued to the **GitHub account that files the request**, replacing
  the free-text username field (no more certifying `@octocat`).

### Removed
- Client-only certificate generation and the placeholder `verify.sheeternetes.dev`
  link, both superseded by the real registry.

## [v0.0.0.0.0.1] — "Cell A1" — 2026-08-30

### Added
- Initial public release: spreadsheet-native container orchestrator, the lab, and the
  Certified Sheeternetes Fundamentals Engineer (CSFE) exam.
