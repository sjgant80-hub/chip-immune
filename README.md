# Chip immune

Live: **https://sjgant80-hub.github.io/chip-immune/**

Rung 7 of the geometric ladder: **a defence small enough for a microcontroller.** A signature floor, then a settling
fit-check, in one fixed block of memory with whole numbers only. It checks its memory on every input and falls back
safely, tries to improve itself in spare cycles with no model, and shares antibodies over signed messages.

**Everything here ran on chip-sim, an emulator written to microcontroller rules. It has not run on a real chip.**

## The result (the 10,000 MNIST test digits, held-out attacks and 200 faults, read once): 5 of 6 measured claims held

| | claim | measured (emulator) |
|---|---|---|
| — | CI1 runs on a Raspberry Pi | **not tested: no Pi in hand** |
| ✓ | CI-EQ the emulated chip settles exactly as Rung 1's cell | 0 mismatches on every judged input |
| ✓ | CI2 the whole layer in at most 32,768 bytes | 13,767 bytes |
| ✓ | CI4 genuine pass ≥ 97%, noise and inverted rejected ≥ 99%, no errors | 97.71%; 100%; 100%; 0 errors |
| ✗ | CI5 self-improvement raises held-out scrambled rejection | 113 → 113 of 300: no change was ever kept |
| ✓ | CI6 B adopts A's signed share after its own check; a forged share refused | adopted; bad-signature, B unchanged (but the share carried nothing new) |
| ✓ | CI7 fail-safe under 200 injected memory faults | 200 caught, floor held 200, back up 200 |

Why CI5 failed (found on the training side, before the test digits were read; see `SEAL2.md`): one regression digit
already settles with zero fit, so the sealed rule "reject none of the regression set" can never be met; and 156 of 160
passing attacks settle exactly onto a stored node pattern, where one antibody cannot out-fit the node. The settle erases
the information an attack detector needs, the same wall Rungs 1, 3 and 5 hit.

Emulator estimate, not a measurement: median 153,600 operations per input, about 2.56 ms at 240 MHz and 4 cycles per
operation. Code size is not claimed. Mutation gate: `src/chip.mjs` 68/68, `src/run.mjs` 40/40, nothing baselined.

## Re-derive it

```bash
node --test test/chip.test.mjs test/page.test.mjs
node tools/learn.mjs --check
node tools/eval.mjs --check
```

[`CLAIMS.md`](CLAIMS.md) (seal 1) · [`SEAL2.md`](SEAL2.md) · `data/record.json`. MNIST, CC BY-SA 3.0. Powered by the
Konomi architecture, created by Thomas Frumkin. MIT licence; credits in [`NOTICE`](NOTICE).
