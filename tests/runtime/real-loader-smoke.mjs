import { spawn } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_V1 = "1.18.30";
const EXPECTED_V2 = "2.0.3";
const MARKER_ENV = "OPENCODE_VERSION_ADAPTER_SMOKE_MARKER";
const TIMEOUT_MS = 60_000;
const OUTPUT_LIMIT = 256 * 1024;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const runtimes = [
  {
    label: "v1",
    command: process.env.OPENCODE_V1_COMMAND ?? "opencode",
    expectedVersion: EXPECTED_V1,
    args: ["models"],
    expectedSurface: "server",
  },
  {
    label: "v2",
    command: process.env.OPENCODE_V2_COMMAND ?? "opencode2",
    expectedVersion: EXPECTED_V2,
    args: ["models", "--standalone"],
    expectedSurface: "setup",
  },
];

function appendLimited(current, chunk) {
  const next = current + chunk;
  return next.length <= OUTPUT_LIMIT ? next : next.slice(-OUTPUT_LIMIT);
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);

    child.once("error", (error) => {
      clearTimeout(timer);
      rejectRun(
        new Error(
          `failed to start ${commandText(command, args)}: ${error.message}`,
        ),
      );
    });

    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        rejectRun(
          new Error(
            `${commandText(command, args)} timed out after ${TIMEOUT_MS} ms`,
          ),
        );
        return;
      }
      resolveRun({ code, signal, stdout, stderr });
    });
  });
}

function assertSuccess(runtime, args, result) {
  if (result.code === 0) return;
  throw new Error(
    [
      `${runtime.label}: ${commandText(runtime.command, args)} failed`,
      `exit=${String(result.code)} signal=${String(result.signal)}`,
      result.stdout && `stdout:\n${result.stdout}`,
      result.stderr && `stderr:\n${result.stderr}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function assertVersion(runtime) {
  const args = ["--version"];
  const result = await runCommand(runtime.command, args, { env: process.env });
  assertSuccess(runtime, args, result);

  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(runtime.expectedVersion)) {
    throw new Error(
      `${runtime.label}: expected OpenCode ${runtime.expectedVersion}, got ${output.trim() || "no version output"}`,
    );
  }
}

function createPluginSource() {
  const capabilitiesUrl = pathToFileURL(
    join(repoRoot, "src", "contract", "capabilities.ts"),
  ).href;
  const serverPluginUrl = pathToFileURL(
    join(repoRoot, "src", "internal", "server-plugin.ts"),
  ).href;

  return `import { appendFile } from "node:fs/promises";
import { CAPABILITIES } from ${JSON.stringify(capabilitiesUrl)};
import { createOpenCodeServerPlugin } from ${JSON.stringify(serverPluginUrl)};

const marker = process.env.${MARKER_ENV};
if (!marker) {
  throw new Error("${MARKER_ENV} is required");
}

async function record(surface) {
  await appendFile(marker, surface + "\\n", "utf8");
}

const candidate = createOpenCodeServerPlugin({
  id: "opencode-version-adapter-real-loader-smoke",
  requiredCapabilities: [CAPABILITIES.serverLifecycle],
  bindings: {},
});

export default {
  id: candidate.id,
  async server(input) {
    const hooks = await candidate.server(input);
    await record("server");
    return hooks;
  },
  async setup(context) {
    const cleanup = await candidate.setup(context);
    await record("setup");
    return cleanup;
  },
};
`;
}

async function readSurfaces(marker) {
  const content = await readFile(marker, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  return content
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function runRuntimeSmoke(runtime, pluginSource) {
  await assertVersion(runtime);

  const root = await mkdtemp(join(tmpdir(), `opencode-version-adapter-${runtime.label}-`));
  const workspace = join(root, "workspace");
  const pluginDir = join(workspace, ".opencode", "plugins");
  const configDir = join(root, "config");
  const marker = join(root, "loader-surface.txt");

  try {
    await mkdir(pluginDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    await writeFile(join(pluginDir, "version-adapter-smoke.ts"), pluginSource, "utf8");

    const env = {
      ...process.env,
      OPENCODE_CONFIG_DIR: configDir,
      [MARKER_ENV]: marker,
    };
    const result = await runCommand(runtime.command, runtime.args, {
      cwd: workspace,
      env,
    });
    assertSuccess(runtime, runtime.args, result);

    const surfaces = await readSurfaces(marker);
    if (!surfaces.includes(runtime.expectedSurface)) {
      throw new Error(
        `${runtime.label}: real loader did not invoke ${runtime.expectedSurface}; observed ${surfaces.join(", ") || "nothing"}`,
      );
    }

    console.log(
      `${runtime.label} ${runtime.expectedVersion}: ${runtime.expectedSurface} observed`,
    );
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

const pluginSource = createPluginSource();
for (const runtime of runtimes) {
  await runRuntimeSmoke(runtime, pluginSource);
}

console.log("real loader smoke: PASS");
