export interface PlaybackEpoch {
  positionSeconds: number;
  playbackEpochServerTime: number | null;
  isPlaying: boolean;
}

export type DriftCorrection =
  | { kind: "none" }
  | { kind: "rate"; rate: number; durationMs: number; errorMs: number }
  | { kind: "seek"; targetPositionSeconds: number; errorMs: number };

export interface DriftObservation {
  playerPositionSeconds: number;
  expectedPositionSeconds: number;
  playerState: number;
  isBuffering: boolean;
  availableRates: number[];
  nowMs: number;
}

export function expectedPositionAt(
  epoch: PlaybackEpoch,
  serverTimeMs: number,
  outputLatencyOffsetMs = 0
): number {
  if (!Number.isFinite(epoch.positionSeconds)) return 0;
  if (!epoch.isPlaying || !Number.isFinite(epoch.playbackEpochServerTime)) {
    return Math.max(0, epoch.positionSeconds);
  }

  const elapsedSeconds = Math.max(0, serverTimeMs - epoch.playbackEpochServerTime!) / 1000;
  return Math.max(0, epoch.positionSeconds + elapsedSeconds + outputLatencyOffsetMs / 1000);
}

export function scheduledDelayMs(
  executeAtServerTime: number,
  estimatedServerTime: number,
  outputLatencyOffsetMs = 0
): number {
  return Math.max(0, executeAtServerTime - estimatedServerTime - outputLatencyOffsetMs);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class DriftController {
  private errorsMs: number[] = [];
  private lastCorrectionAt = Number.NEGATIVE_INFINITY;
  private lastSeekAt = Number.NEGATIVE_INFINITY;
  private insideDeadband = false;

  constructor(
    private readonly options = {
      filterSamples: 5,
      deadbandEnterMs: 20,
      deadbandExitMs: 10,
      hysteresisMs: 5,
      seekThresholdMs: 250,
      correctionCooldownMs: 700,
      seekCooldownMs: 2500,
      minimumPulseMs: 120,
      maximumPulseMs: 500,
    }
  ) {}

  observe(observation: DriftObservation): DriftCorrection {
    const {
      playerPositionSeconds,
      expectedPositionSeconds,
      playerState,
      isBuffering,
      availableRates,
      nowMs,
    } = observation;

    if (
      isBuffering ||
      playerState !== 1 ||
      !Number.isFinite(playerPositionSeconds) ||
      !Number.isFinite(expectedPositionSeconds)
    ) {
      return { kind: "none" };
    }

    const errorMs = (playerPositionSeconds - expectedPositionSeconds) * 1000;
    this.errorsMs.push(errorMs);
    if (this.errorsMs.length > this.options.filterSamples) this.errorsMs.shift();
    const filteredErrorMs = median(this.errorsMs);
    const magnitude = Math.abs(filteredErrorMs);

    if (this.insideDeadband) {
      if (magnitude <= this.options.deadbandExitMs) return { kind: "none" };
      if (magnitude < this.options.deadbandEnterMs + this.options.hysteresisMs) return { kind: "none" };
      this.insideDeadband = false;
    } else if (magnitude < this.options.deadbandEnterMs) {
      this.insideDeadband = true;
      return { kind: "none" };
    }

    if (nowMs - this.lastCorrectionAt < this.options.correctionCooldownMs) {
      return { kind: "none" };
    }

    if (magnitude > this.options.seekThresholdMs) {
      if (nowMs - this.lastSeekAt < this.options.seekCooldownMs) return { kind: "none" };
      this.lastSeekAt = nowMs;
      this.lastCorrectionAt = nowMs;
      return {
        kind: "seek",
        targetPositionSeconds: expectedPositionSeconds,
        errorMs: filteredErrorMs,
      };
    }

    const directionRates = availableRates
      .filter((rate) => Number.isFinite(rate) && (filteredErrorMs > 0 ? rate < 1 : rate > 1))
      .sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1));
    const rate = directionRates[0];
    if (!rate) {
      if (nowMs - this.lastSeekAt < this.options.seekCooldownMs) return { kind: "none" };
      this.lastSeekAt = nowMs;
      this.lastCorrectionAt = nowMs;
      return {
        kind: "seek",
        targetPositionSeconds: expectedPositionSeconds,
        errorMs: filteredErrorMs,
      };
    }

    const rawPulseMs = magnitude / Math.abs(rate - 1);
    const durationMs = Math.min(
      this.options.maximumPulseMs,
      Math.max(this.options.minimumPulseMs, rawPulseMs)
    );
    this.lastCorrectionAt = nowMs;
    return { kind: "rate", rate, durationMs, errorMs: filteredErrorMs };
  }

  reset(): void {
    this.errorsMs = [];
    this.lastCorrectionAt = Number.NEGATIVE_INFINITY;
    this.lastSeekAt = Number.NEGATIVE_INFINITY;
    this.insideDeadband = false;
  }
}