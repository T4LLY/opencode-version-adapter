import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectTests(path)));
    else if (entry.isFile() && entry.name.endsWith(".test.js")) files.push(path);
  }
  return files.sort();
}

for (const file of await collectTests(join(".tmp-test", "tests"))) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (status, signal) => {
      if (signal) reject(new Error(`${file} terminated by ${signal}`));
      else resolve(status ?? 1);
    });
  });
  if (code !== 0) process.exit(code);
}
