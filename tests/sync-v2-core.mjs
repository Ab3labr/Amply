import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/sync-v2.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const core = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

assert.equal(core.expectedPositionAt({ positionSeconds: 15, playbackEpochServerTime: 1000, isPlaying: true }, 6000), 20);
assert.equal(core.expectedPositionAt({ positionSeconds: 15, playbackEpochServerTime: 1000, isPlaying: true }, 6000, 40), 20.04);
assert.equal(core.expectedPositionAt({ positionSeconds: 15, playbackEpochServerTime: null, isPlaying: false }, 6000, 40), 15);
assert.equal(core.scheduledDelayMs(1000, 600, 40), 360);
assert.equal(core.median([10, 12, 14, 1000, 16]), 14);

const baseObservation = {
  playerPositionSeconds: 10,
  expectedPositionSeconds: 10,
  playerState: 1,
  isBuffering: false,
  availableRates: [0.75, 1, 1.25],
  nowMs: 1000,
};

const smallDrift = new core.DriftController();
assert.equal(smallDrift.observe({ ...baseObservation, playerPositionSeconds: 10.019 }).kind, "none");
assert.equal(smallDrift.observe({ ...baseObservation, playerPositionSeconds: 10.1, nowMs: 2000 }).kind, "rate");
assert.equal(smallDrift.observe({ ...baseObservation, playerPositionSeconds: 10.1, nowMs: 2200 }).kind, "none");

const buffering = new core.DriftController();
assert.equal(buffering.observe({ ...baseObservation, playerPositionSeconds: 10.1, playerState: 3 }).kind, "none");
assert.equal(buffering.observe({ ...baseObservation, playerPositionSeconds: 10.1, isBuffering: true }).kind, "none");

const unsupportedRates = new core.DriftController();
assert.equal(
  unsupportedRates.observe({ ...baseObservation, playerPositionSeconds: 10.05, availableRates: [], nowMs: 1000 }).kind,
  "seek"
);

const largeDrift = new core.DriftController();
assert.equal(largeDrift.observe({ ...baseObservation, playerPositionSeconds: 10.4, nowMs: 1000 }).kind, "seek");
assert.equal(largeDrift.observe({ ...baseObservation, playerPositionSeconds: 10.4, nowMs: 2000 }).kind, "none");
assert.equal(largeDrift.observe({ ...baseObservation, playerPositionSeconds: 10.4, nowMs: 3600 }).kind, "seek");

console.log("SYNC_V2 core checks passed: epochs, output offset, median filter, thresholds, buffering guard, rate pulse, seek fallback and cooldown.");