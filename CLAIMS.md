# chip-immune · sealed claims (seal 1, before any code of this repository)

Rung 7 of the geometric substrate ladder, and the payoff of Rungs 1–6: **a defence small enough for a
microcontroller.** A settling cell's fit-check sits on top of an Ed25519 floor; in spare cycles it improves itself with
no model; it shares proven antibodies with other chips over the signed mesh; and losing it never stops the device.
Every bar is fixed here. A claim that misses its bar is kept and published as failed.

## What this runs on: a labelled emulator, not a chip

**There is no Raspberry Pi or ESP32 in hand for this build.** Everything here runs on **chip-sim**, an emulator written to
microcontroller rules: all of the layer's data lives in **one fixed byte arena allocated at boot**; the defence path uses
**whole numbers only** (bits packed into 32-bit words, popcount distances, an integer energy table); nothing is
allocated after boot; every loop is bounded. The page and the record say "emulator" wherever a number comes from it.
The crypto floor uses the browser's or Node's WebCrypto Ed25519 in the emulator; a device would use a C Ed25519 (for
example Monocypher), whose code size is not measured here. Code size in general is not claimed: there is no compiler run.

## Built on the rungs below, byte for byte

- Rung 1's cell kernel (sjgant80-hub/settling-cell `src/cell.mjs`, sha256 590c8307b06148dbfa7c2e4a247336441e150d8235d62783c45efb53190d9101),
  used as the **reference** that chip-sim must match.
- Rung 3's MNIST conversion (`src/mnist.mjs`, sha256 d2e0d4faa5b3b927a0261e1def5620df317fa3925ab32fb0cb3d80a1605b3616).
- Rung 4's node B after its exchange, the defended shape (`data/cell-after.txt`, sha256 1cd61bfbf39377e39e4ed80135da2032d1d0b0028badd68d51858c5238ab5758).
- Rung 5's antibodies, the chip's starting antibodies (sjgant80-hub/geometric-defence `data/antibodies.txt`, sha256
  31e829f90a9a040368742698176bc3fb712a4202060d9003c7cc1a008f1d1294), and Rung 5's θ = 0 with "zero fit is non-fit".
- The estate's Ed25519 keys (living-seed `vendor/keys/`).

## The chip's layer

- **Floor:** roster and signature on the raw 64 bytes first, then every byte 0..16 (as Rung 5).
- **Fit-check:** settle on packed bits; zero fit → reject (non-fit); antibody fit ≥ node fit at the settled state →
  reject (antibody); else pass (as Rung 5).
- **Integrity:** a CRC-32 over the arena's shape, antibody and energy regions, checked on every input. On a mismatch the
  layer goes **down**: inputs that pass the floor are still delivered, marked unscreened, and the layer reloads its
  pristine shape from a read-only copy; when that copy checks, the layer is back up for the next input.
- **On-chip memory:** a regression set of 32 genuine digits (MNIST training rows 52,200–52,231) and a ring of the last
  32 inputs the device's application **confirmed** as attacks. A chip has no labels; it can only learn from what its
  own application confirms downstream. In this emulator the confirmations are given for scrambled digits.
- **Model-free evolution in spare cycles:** propose replacing one antibody slot (of 16) with the settled state of a
  confirmed attack, or re-seeding an empty slot; keep the change only if it newly rejects at least one confirmed attack
  in the ring and rejects **none** of the regression set. The rng is the estate's, seeded 7700 + the step. 200 steps.

## The experiments (training digits for everything learned; the MNIST test digits for every judgement)

- **Confirmed attacks for learning:** scrambled training digits (rows 52,300–52,599), seeds 80,000 + i, fed to device A
  in that order; A logs each that passed and is then confirmed, and runs one evolution step after each.
- **Held-out:** the 10,000 MNIST test digits (read before by Rungs 3–6; nothing here has read them), and 300 each of
  held-out scrambled (seeds 90,000 + i over test digits 0–299), noise (seeds 90,000 + i) and inverted (test digits 300–599).

## The claims

- **CI1 · runs on a Pi.** **Not tested in this build: no Pi in hand.** Marked "pending hardware" on the page and in the
  record. The emulator is not a substitute and is not presented as one.
- **CI-EQ · the chip runs the same cell.** chip-sim's packed-bit settle gives the same answer, fit and settled bits as
  Rung 1's kernel on every one of the 10,000 test digits and every held-out attack.
- **CI2 · within an MCU footprint.** The whole layer's data (shape, antibodies, energy table, distances, state,
  regression set, attack ring, scratch, checksums) fits in one arena of at most **32,768 bytes**, counted exactly.
- **CI3 · no model, no cloud.** The chip core imports only the vendored keys and the arena code, and makes no network call.
- **CI4 · attacks rejected, genuine passes, the device keeps running.** After evolution, at least 97.0% of test digits
  pass; held-out noise and inverted are each at least 99.0% rejected; the device processes every input without an error.
- **CI5 · on-device evolution improves held-out rejection while keeping its regression set.** Device A's held-out
  scrambled rejection after evolution beats its rejection before: paired 95% lower bound > 0; all 32 regression digits
  still pass.
- **CI6 · A learns, shares, and B rejects on sight; forged shares refused.** Device B (fresh, never shown a confirmed
  attack) adopts A's signed antibody set after its own regression check (no regression digit newly rejected), and then
  rejects held-out scrambled attacks at A's rate or better; a share with one byte changed is refused at the signature,
  and B is unchanged by it.
- **CI7 · fail-safe.** Under 200 injected faults (a random arena byte in the shape, antibody or energy region flipped
  before a random input, seed 7900 + i), the device never throws and never delivers an input that failed the floor; the
  layer reports down for every corrupted input it catches and is back up by the next input.
- **CI8 · deterministic.** The whole record hashes the same twice, on GitHub's runner and in a browser tab.
- **CI9 · the page,** with no measured number typed into `index.html`. **CI10 · the data,** every file pinned.
- **G · the gate on the code.** witness v0.6 on this repository's kernels: CLEAN, nothing baselined. CI green.

Also reported, labelled as an emulator estimate: the operations per input, and a time per input on a 240 MHz
microcontroller at 4 cycles per operation.

## What Rung 7 is not

Not a run on real silicon (CI1 pending), not a measure of code size, and not a defence against stolen keys' genuine-looking
inputs, physical tampering or supply-chain firmware. DEFEND, NEVER CONTROL: the layer only gates inputs at the boundary.
