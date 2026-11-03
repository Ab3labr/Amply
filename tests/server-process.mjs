import { spawn } from "node:child_process";

export async function startTestServer(extraEnvironment = {}) {
  const port = Number(extraEnvironment.AMPLY_TEST_PORT || process.env.AMPLY_TEST_PORT || 3310);
  const child = spawn(process.execPath, ["tests/test-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnvironment, AMPLY_TEST_PORT: String(port) },
    stdio: "inherit",
  });

  try {
    await waitUntilReady(child, `http://localhost:${port}`);
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

async function waitUntilReady(child, url) {
  const deadline = Date.now() + 120_000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited (${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Test server did not start: ${lastError}`);
}