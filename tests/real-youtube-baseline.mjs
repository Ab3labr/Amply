import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { startTestServer } from "./server-process.mjs";
import { TEST_BASE_URL } from "./helpers.mjs";

const RUN_MS = 180_000;
const RUN_ID = `baseline-${Date.now()}`;
const CLIENTS = [
  { role: "host", client: "host" },
  { role: "guest", client: "guest-1" },
  { role: "guest", client: "guest-2" },
  { role: "guest", client: "guest-3" },
];
const server = await startTestServer();
let browser;
let pages = [];

try {
  const roomResponse = await fetch(`${TEST_BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostName: "Real YouTube Baseline" }),
  });
  const { roomCode } = await roomResponse.json();

  browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  pages = await Promise.all(CLIENTS.map(async ({ role, client }) => {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[${client}] browser: ${message.text()}`);
    });
    page.on("pageerror", (error) => console.error(`[${client}] page error: ${error.message}`));
    const url = new URL(`${TEST_BASE_URL}/sync-harness.html`);
    url.searchParams.set("room", roomCode);
    url.searchParams.set("role", role);
    url.searchParams.set("client", client);
    url.searchParams.set("run", RUN_ID);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    return page;
  }));

  const readyDeadline = Date.now() + 90_000;
  while (Date.now() < readyDeadline) {
    const ready = await Promise.all(pages.map((page) => page.evaluate(() => window.__syncHarness?.ready ?? false)));
    if (ready.every(Boolean)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const statuses = await Promise.all(pages.map((page) => page.evaluate(() => window.__syncHarness?.status ?? null)));
  if (statuses.some((status) => !status || status.playerState !== 5 || !status.clockReady)) {
    await writeFile("BASELINE.md", makeBlockedReport(roomCode, statuses));
    throw new Error(`Real YouTube IFrames did not all become CUED and clock-ready: ${JSON.stringify(statuses)}`);
  }

  const hostPage = pages[0];
  await hostPage.getByRole("button", { name: "Start 3-minute run" }).click();
  console.log(`Real YouTube baseline started: room ${roomCode}, run ${RUN_ID}; sampling for 180 seconds.`);
  await new Promise((resolve) => setTimeout(resolve, RUN_MS + 3000));
  const results = await Promise.all(pages.map((page) => page.evaluate(() => {
    window.__syncHarness.stopSampling();
    return { status: window.__syncHarness.status, samples: window.__syncHarness.samples };
  })));
  const precision = await Promise.all(pages.map((page) => page.evaluate(() => window.__syncHarness.samplePrecision(5, 50))));
  const hostSamples = results[0].samples;
  const rows = CLIENTS.map((client, index) => {
    const values = index === 0
      ? results[index].samples.map((sample) => Math.abs(sample.playerTime - sample.expectedPosition) * 1000)
      : interDeviceOffsets(results[index].samples, hostSamples);
    return { ...client, count: values.length, stats: summarize(values), status: results[index].status };
  });
  const precisionRows = CLIENTS.map((client, index) => ({
    client: client.client,
    distinct: new Set(precision[index].map((value) => value.toFixed(3))).size,
    minPositiveStepMs: minPositiveStep(precision[index]),
  }));
  const report = makeReport(roomCode, rows, precisionRows);
  await writeFile("BASELINE.md", report);
  console.log(report);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.stop();
}

function interDeviceOffsets(clientSamples, hostSamples) {
  const offsets = [];
  for (const sample of clientSamples) {
    const host = nearestSample(hostSamples, sample.serverTime, sample.trackId);
    if (!host) continue;
    offsets.push(Math.abs(sample.playerTime - host.playerTime) * 1000);
  }
  return offsets;
}

function nearestSample(samples, serverTime, trackId) {
  let best = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    if (sample.trackId !== trackId) continue;
    const nextDistance = Math.abs(sample.serverTime - serverTime);
    if (nextDistance < distance) {
      distance = nextDistance;
      best = sample;
    }
  }
  return distance <= 300 ? best : null;
}

function summarize(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    minMs: sorted[0],
    avgMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
    maxMs: sorted.at(-1),
  };
}

function minPositiveStep(values) {
  let smallest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < values.length; index += 1) {
    const step = Math.abs(values[index] - values[index - 1]);
    if (step > 0) smallest = Math.min(smallest, step);
  }
  return Number.isFinite(smallest) ? smallest * 1000 : null;
}

function makeReport(roomCode, rows, precisionRows) {
  const lines = [
    "# Real YouTube Baseline",
    "",
    `- Run date: ${new Date().toISOString()}`,
    `- Room: ${roomCode}`,
    `- Duration: 180 seconds` ,
    "- Source: real YouTube IFrame API, visible 640x360 players; no player test double.",
    "- Automation: local Chromium launched with `--autoplay-policy=no-user-gesture-required`.",
    "- Scenarios: start, seek at 45s, pause at 75s, resume at 85s, track change at 120s, guest-2 reconnect at 150s.",
    "- Offset definition: for each guest sample, absolute `getCurrentTime()` difference from the nearest host sample on the same track within 300ms. Host row is absolute error from its shared expected timeline.",
    "",
    "| Client | Samples | Min ms | Avg ms | p95 ms | Max ms | Clock RTT ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  rows.forEach((row) => {
    const stats = row.stats || {};
    lines.push(`| ${row.client} | ${row.count} | ${fmt(stats.minMs)} | ${fmt(stats.avgMs)} | ${fmt(stats.p95Ms)} | ${fmt(stats.maxMs)} | ${fmt(row.status?.clockRttMs)} |`);
  });
  lines.push("", "## getCurrentTime Sampling Probe", "", "The IFrame API documentation specifies a numeric elapsed time in seconds but does not promise a precision/resolution bound. The probe sampled every 50ms while playing:", "", "| Client | Distinct reported values | Smallest observed positive step ms |", "| --- | ---: | ---: |");
  precisionRows.forEach((row) => lines.push(`| ${row.client} | ${row.distinct} | ${fmt(row.minPositiveStepMs)} |`));
  lines.push("", "## Caveats", "", "These are local browser measurements against YouTube's real embedded player. They do not measure acoustic output latency (Bluetooth/OS/device), and a single local Chromium process is not a remote-listener or same-room multi-speaker certification. Server `SYNC:MEASUREMENT` lines include receive time and the client-provided estimated server time. No physical mobile devices were used.", "");
  return lines.join("\n");
}

function makeBlockedReport(roomCode, statuses) {
  return [
    "# Real YouTube Baseline",
    "",
    `- Run date: ${new Date().toISOString()}`,
    `- Room: ${roomCode}`,
    "- Status: blocked before measurement; not a measured playback result.",
    "- Attempt: real visible YouTube IFrames in local Chromium with `--autoplay-policy=no-user-gesture-required`.",
    `- Observed client states: \`${JSON.stringify(statuses)}\``,
    "- No offset statistics are reported because the clients did not all reach cued/ready state.",
    "- Required follow-up: run on a browser/network where YouTube embedding is reachable, then repeat the 180-second scenario.",
    "",
  ].join("\n");
}

function fmt(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}