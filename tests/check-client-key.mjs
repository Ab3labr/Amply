import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const marker = "amply-test-key-must-not-appear-in-client-bundles";
const env = { ...process.env, YOUTUBE_API_KEY: marker };
delete env.NEXT_PUBLIC_YOUTUBE_API_KEY;

execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const staticDirectory = path.join(process.cwd(), ".next", "static");
const files = await listFiles(staticDirectory);
const needle = Buffer.from(marker);
const matches = [];

for (const file of files) {
  const content = await readFile(file);
  if (content.includes(needle)) matches.push(path.relative(process.cwd(), file));
}

if (matches.length) {
  console.error(`Server API key marker found in client output: ${matches.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Client bundle scan passed: API-key marker absent from ${files.length} built static files.`);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
}