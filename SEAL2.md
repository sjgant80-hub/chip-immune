# Seal 2 · the chip frozen, before the test digits are read

Committed after seal 1 (`CLAIMS.md`, f85606c), with no amendment. Everything below came from MNIST training digits only.
**No code in this repository has read the MNIST test file.** The next commit runs `tools/eval.mjs` once, which refuses
to run unless this file names the four hashes below. **Everything here runs on chip-sim, an emulator. CI1, a run on a
Raspberry Pi, is not tested: there is no Pi in hand.**

## What is frozen

- **The defended node:** `vendor/mesh-share/data/cell-after.txt`, sha256 **1cd61bfbf39377e39e4ed80135da2032d1d0b0028badd68d51858c5238ab5758** (Rung 4's node B).
- **The starting antibodies:** `vendor/geometric-defence/data/antibodies.txt`, sha256 **31e829f90a9a040368742698176bc3fb712a4202060d9003c7cc1a008f1d1294** (Rung 5's).
- **The learning record:** `data/learned.json`, sha256 **11dc9a08024407212736e1f10768c75d4f247e83ccaf56de12756535b84f8bfa**. Device A screened 300 confirmed
  scrambled training digits; **160 passed** and were confirmed; **0 evolution steps were kept**; A holds 10 antibodies.
  Device B adopted A's signed share (**adopted**); the share with one byte changed was refused (**bad-signature**) and B was unchanged.
  The arena uses **13,767 of 32,768 bytes**.
- **The chip code:** `src/chip.mjs`, sha256 **c265fd793ac5e70af7c6ca974956921cab873521a301351947787318150ff8cd**.

## Why evolution kept nothing (training side, read before the test digits)

1. **The sealed keep rule cannot be met.** A change is kept only if it rejects **none** of the 32 regression digits. One of
   them (MNIST training row 52,204) already settles with zero fit, so it is rejected as non-fit before any change. Every
   candidate fails the rule.
2. **Even without that, one antibody could not claim the attacks.** Of the 160 passing attacks, 156 settle **exactly onto a
   stored node pattern**, so the node's fit at the settled state is at least that pattern's full energy plus the others'.
   An antibody at the same state holds only one pattern's full energy. For 0 of the 160 could a single antibody out-fit the node.

So CI5 (evolution improves held-out rejection) will fail as sealed: A after learning is A before. It is not amended; it is
the finding. It is the same wall Rungs 1, 3 and 5 hit: the settle erases the information an attack detector needs.

## The code, frozen here

| file | sha256 | mutation gate (witness v0.6) |
|---|---|---|
| `src/chip.mjs` | c265fd793ac5e70af7c6ca974956921cab873521a301351947787318150ff8cd | 68 of 68 caught, 0 baselined |
| `src/run.mjs` | 5035201c778d5d4227ff53ea862e81a536b369c754e29c420ba99be6607be305 | 40 of 40 caught, 0 baselined |

**Disclosed:** before this seal, a real bug was fixed (the flash copy had been taken before the checksum, so recovery
reloaded a bad checksum and never came back up), and the gate's first pass left 27 survivors; they were closed by
restructuring, never baselining: `boot()` takes the arena size, the ring counter wraps from 64 to 32 (the slot each confirm
writes is unchanged), the fault count reads one key, and `evaluate()` takes its sizes and reference so a small fixture
checks every count against an independent read. The learning record re-derives byte for byte on the frozen code
(`node tools/learn.mjs --check`).
