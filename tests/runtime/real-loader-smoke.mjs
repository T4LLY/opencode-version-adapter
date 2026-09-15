import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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
const POLL_INTERVAL_MS = 50;
const OUTPUT_LIMIT = 256 * 1024;
const V2_CAPABILITY_SURFACE = "v2-agent-capabilities";
const V2_PROBE_ERROR_PREFIX = "v2-agent-capabilities-error:";

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

function windowsCommandLine(command, args) {
  const values = [command, ...args].map(String);
  for (const value of values) {
    if (/["\r\n]/u.test(value)) {
      throw new Error(`unsupported quote or newline in Windows command token: ${value}`);
    }
  }

  const tokens = values.map((value) =>
    /[\s&|<>^()]/u.test(value) ? `"${value}"` : value,
  );
  const line = tokens.join(" ");

  // cmd.exe /s /c applies special stripping when the command itself starts
  // with a quote. Add the documented outer pair only for that case.
  return tokens[0].startsWith('"') ? `"${line}"` : line;
}

function spawnCommand(command, args, options = {}) {
  const windows = process.platform === "win32";
  const invocation = windows
    ? {
        command: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", windowsCommandLine(command, args)],
      }
    : { command, args };

  return spawn(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: options.env,
    detached: !windows,
    windowsHide: true,
    windowsVerbatimArguments: windows,
    shell: false,
  });
}

function startCommand(command, args, options = {}) {
  const child = spawnCommand(command, args, options);
  let stdout = "";
  let stderr = "";

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    stdout = appendLimited(stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr = appendLimited(stderr, chunk);
  });

  const completion = new Promise((resolveRun, rejectRun) => {
    child.once("error", (error) => {
      rejectRun(
        new Error(
          `failed to start ${commandText(command, args)}: ${error.message}`,
        ),
      );
    });
    child.once("close", (code, signal) => {
      resolveRun({ code, signal, stdout, stderr });
    });
  });

  return {
    child,
    completion,
    snapshot() {
      return { stdout, stderr };
    },
  };
}

async function terminateChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    return;
  }

  await new Promise((resolveTermination) => {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true, shell: false },
    );
    killer.once("error", () => {
      child.kill();
      resolveTermination();
    });
    killer.once("close", () => resolveTermination());
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function timeoutError(command, args, output) {
  return new Error(
    [
      `${commandText(command, args)} timed out after ${TIMEOUT_MS} ms`,
      output.stdout && `stdout:\n${output.stdout}`,
      output.stderr && `stderr:\n${output.stderr}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function runCommand(command, args, options = {}) {
  const running = startCommand(command, args, options);
  let timer;
  try {
    return await Promise.race([
      running.completion,
      new Promise((_, rejectTimeout) => {
        timer = setTimeout(async () => {
          const output = running.snapshot();
          await terminateChild(running.child);
          rejectTimeout(timeoutError(command, args, output));
        }, TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runCommandUntil(command, args, completeWhen, options = {}) {
  const running = startCommand(command, args, options);
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await completeWhen()) {
      await terminateChild(running.child);
      return { observed: true, ...running.snapshot() };
    }

    const completed = await Promise.race([
      running.completion.then((result) => ({ completed: true, result })),
      delay(POLL_INTERVAL_MS).then(() => ({ completed: false })),
    ]);

    if (completed.completed) {
      return { observed: await completeWhen(), ...completed.result };
    }
  }

  const output = running.snapshot();
  await terminateChild(running.child);
  throw timeoutError(command, args, output);
}

function readReadyUrl(stdout) {
  for (const line of stdout.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (
        value !== null &&
        typeof value === "object" &&
        typeof value.url === "string"
      ) {
        return value.url;
      }
    } catch {
      // `serve --stdio` emits one JSON readiness line; other output is diagnostic.
    }
  }
  return undefined;
}

async function waitForReadyUrl(runtime, args, running) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const readyUrl = readReadyUrl(running.snapshot().stdout);
    if (readyUrl) return readyUrl;

    const completed = await Promise.race([
      running.completion.then((result) => ({ completed: true, result })),
      delay(POLL_INTERVAL_MS).then(() => ({ completed: false })),
    ]);

    if (completed.completed) {
      const readyUrlAfterExit = readReadyUrl(completed.result.stdout);
      if (readyUrlAfterExit) return readyUrlAfterExit;
      throw new Error(
        [
          `${runtime.label}: ${commandText(runtime.command, args)} exited before readiness`,
          `exit=${String(completed.result.code)} signal=${String(completed.result.signal)}`,
          completed.result.stdout && `stdout:\n${completed.result.stdout}`,
          completed.result.stderr && `stderr:\n${completed.result.stderr}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  const output = running.snapshot();
  await terminateChild(running.child);
  throw timeoutError(runtime.command, args, output);
}

function assertNoProbeFailure(runtime, surfaces) {
  const failure = surfaces.find((surface) =>
    surface.startsWith(V2_PROBE_ERROR_PREFIX),
  );
  if (failure === undefined) return;

  throw new Error(
    `${runtime.label}: v2 capability probe failed: ${failure.slice(V2_PROBE_ERROR_PREFIX.length)}`,
  );
}

async function waitForSurface(runtime, marker, running) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const surfaces = await readSurfaces(marker);
    assertNoProbeFailure(runtime, surfaces);
    if (surfaces.includes(runtime.expectedSurface)) return;

    const completed = await Promise.race([
      running.completion.then((result) => ({ completed: true, result })),
      delay(POLL_INTERVAL_MS).then(() => ({ completed: false })),
    ]);

    if (completed.completed) {
      const surfacesAfterExit = await readSurfaces(marker);
      assertNoProbeFailure(runtime, surfacesAfterExit);
      if (surfacesAfterExit.includes(runtime.expectedSurface)) return;
      throw new Error(
        [
          `${runtime.label}: server exited before invoking ${runtime.expectedSurface}`,
          `observed ${surfacesAfterExit.join(", ") || "nothing"}`,
          `exit=${String(completed.result.code)} signal=${String(completed.result.signal)}`,
          completed.result.stdout && `stdout:\n${completed.result.stdout}`,
          completed.result.stderr && `stderr:\n${completed.result.stderr}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  const output = running.snapshot();
  await terminateChild(running.child);
  throw new Error(
    [
      `${runtime.label}: timed out waiting for ${runtime.expectedSurface}`,
      output.stdout && `stdout:\n${output.stdout}`,
      output.stderr && `stderr:\n${output.stderr}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
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

const PROBE_AGENT_ID = "opencode-version-adapter-runtime-probe";
const PROBE_DESCRIPTION = "opencode-version-adapter runtime probe";
const PROBE_PERMISSION_ACTION = "opencode-version-adapter.runtime-probe";
const PROBE_PERMISSION_RESOURCE = "runtime-probe";
const PROBE_ERROR_PREFIX = ${JSON.stringify(V2_PROBE_ERROR_PREFIX)};

async function record(surface) {
  await appendFile(marker, surface + "\\n", "utf8");
}

function fail(message) {
  throw new Error(message);
}

function summarizeAgentListResult(value) {
  if (Array.isArray(value)) {
    return "type=array isArray=true length=" + String(value.length);
  }

  if (value === null) {
    return "type=null isArray=false";
  }

  const type = typeof value;
  if (type !== "object") {
    return "type=" + type + " isArray=false";
  }

  const keys = Object.keys(value).sort();
  const data = "data" in value ? value.data : undefined;
  const dataType = data === null ? "null" : typeof data;
  const dataIsArray = Array.isArray(data);
  const dataLength = dataIsArray ? data.length : undefined;
  return [
    "type=object",
    "isArray=false",
    "keys=" + (keys.join(",") || "<none>"),
    "dataType=" + dataType,
    "dataIsArray=" + String(dataIsArray),
    dataLength === undefined ? undefined : "dataLength=" + String(dataLength),
  ]
    .filter(Boolean)
    .join(" ");
}

function formatProbeError(error, seen = new Set(), depth = 0) {
  if (depth >= 8) return "<cause-depth-limit>";
  if (error === null || typeof error !== "object") return String(error);
  if (seen.has(error)) return "<circular-cause>";
  seen.add(error);

  if (error instanceof Error) {
    const category =
      typeof error.category === "string" ? "[" + error.category + "]" : "";
    const head = error.name + category + ": " + error.message;
    if (!("cause" in error) || error.cause === undefined) return head;
    return head + " <- " + formatProbeError(error.cause, seen, depth + 1);
  }

  if ("setupError" in error || "rollbackError" in error) {
    const parts = [];
    if ("setupError" in error) {
      parts.push(
        "setup=" + formatProbeError(error.setupError, seen, depth + 1),
      );
    }
    if ("rollbackError" in error) {
      parts.push(
        "rollback=" + formatProbeError(error.rollbackError, seen, depth + 1),
      );
    }
    return "{" + parts.join(", ") + "}";
  }

  try {
    return JSON.stringify(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}

const loaderCandidate = createOpenCodeServerPlugin({
  id: "opencode-version-adapter-real-loader-smoke",
  requiredCapabilities: [CAPABILITIES.serverLifecycle],
  bindings: {},
});

const v2CapabilityCandidate = createOpenCodeServerPlugin({
  id: "opencode-version-adapter-v2-capability-probe",
  requiredCapabilities: [
    CAPABILITIES.agentPermissionRules,
    CAPABILITIES.agentRegistration,
  ],
  bindings: {
    agentRegistration({ existingAgentIDs }) {
      if (existingAgentIDs.includes(PROBE_AGENT_ID)) {
        fail("probe Agent already exists before registration");
      }

      return {
        [PROBE_AGENT_ID]: {
          description: PROBE_DESCRIPTION,
          mode: "subagent",
          hidden: true,
        },
      };
    },
    agentPermissionRules() {
      return {
        [PROBE_AGENT_ID]: [
          {
            permission: PROBE_PERMISSION_ACTION,
            rules: [
              {
                pattern: PROBE_PERMISSION_RESOURCE,
                action: "deny",
              },
            ],
          },
        ],
      };
    },
  },
});

function assertInstalled(agents) {
  const probe = agents.find((agent) => agent.id === PROBE_AGENT_ID);
  if (probe === undefined) fail("registered probe Agent is not visible from agent.list()");
  if (probe.description !== PROBE_DESCRIPTION) fail("probe Agent description was not applied");
  if (probe.mode !== "subagent") fail("probe Agent mode was not applied");
  if (probe.hidden !== true) fail("probe Agent hidden flag was not applied");

  const permission = probe.permissions.find(
    (rule) =>
      rule.action === PROBE_PERMISSION_ACTION &&
      rule.resource === PROBE_PERMISSION_RESOURCE &&
      rule.effect === "deny",
  );
  if (permission === undefined) fail("probe Agent permission rule was not applied");
}

function assertDisposed(agents) {
  if (agents.some((agent) => agent.id === PROBE_AGENT_ID)) {
    fail("probe Agent remains visible after adapter cleanup");
  }
}

export default {
  id: v2CapabilityCandidate.id,
  async server(input) {
    const hooks = await loaderCandidate.server(input);
    await record("server");
    return hooks;
  },
  async setup(context) {
    let cleanup;
    let disposed = false;
    let agentListShape = "not-observed";
    let stage = "agent.list shape probe";
    try {
      agentListShape = summarizeAgentListResult(await context.agent.list());

      stage = "adapter setup";
      cleanup = await v2CapabilityCandidate.setup(context);

      stage = "installed-state assertion";
      assertInstalled(await context.agent.list());

      stage = "adapter cleanup";
      if (cleanup !== undefined) {
        await cleanup();
        disposed = true;
      }

      stage = "disposed-state assertion";
      assertDisposed(await context.agent.list());

      await record(${JSON.stringify(V2_CAPABILITY_SURFACE)});
      await record("setup");
    } catch (error) {
      if (!disposed && cleanup !== undefined) {
        try {
          await cleanup();
        } catch {
          // Preserve the original probe failure; cleanup behavior is asserted separately.
        }
      }
      const message =
        stage +
        ": " +
        formatProbeError(error) +
        " | agent.list=" +
        agentListShape;
      await record(PROBE_ERROR_PREFIX + message.replace(/[\\r\\n]+/gu, " "));
      throw error;
    }
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

async function runV1Smoke(runtime, workspace, marker, env) {
  const args = ["models"];
  const result = await runCommandUntil(
    runtime.command,
    args,
    async () => {
      const surfaces = await readSurfaces(marker);
      return surfaces.includes(runtime.expectedSurface);
    },
    { cwd: workspace, env },
  );

  if (result.observed) return;
  assertSuccess(runtime, args, result);
  const surfaces = await readSurfaces(marker);
  throw new Error(
    `${runtime.label}: real loader did not invoke ${runtime.expectedSurface}; observed ${surfaces.join(", ") || "nothing"}`,
  );
}

async function runV2Smoke(runtime, workspace, marker, env) {
  const password = randomBytes(32).toString("base64url");
  const serverArgs = ["serve", "--stdio", "--port", "0"];
  const serverEnv = { ...env, OPENCODE_PASSWORD: password };
  const server = startCommand(runtime.command, serverArgs, {
    cwd: workspace,
    env: serverEnv,
  });

  try {
    const url = await waitForReadyUrl(runtime, serverArgs, server);
    const triggerArgs = ["models", "--server", url];
    const trigger = await runCommand(runtime.command, triggerArgs, {
      cwd: workspace,
      env: serverEnv,
    });
    assertSuccess(runtime, triggerArgs, trigger);
    await waitForSurface(runtime, marker, server);
  } finally {
    await terminateChild(server.child);
  }
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

    if (runtime.label === "v1") {
      await runV1Smoke(runtime, workspace, marker, env);
    } else {
      await runV2Smoke(runtime, workspace, marker, env);
    }

    const surfaces = await readSurfaces(marker);
    assertNoProbeFailure(runtime, surfaces);
    if (runtime.label === "v2" && !surfaces.includes(V2_CAPABILITY_SURFACE)) {
      throw new Error(
        `${runtime.label}: capability probe did not complete; observed ${surfaces.join(", ") || "nothing"}`,
      );
    }

    console.log(
      `${runtime.label} ${runtime.expectedVersion}: ${runtime.expectedSurface} observed`,
    );
    if (runtime.label === "v2") {
      console.log(
        `${runtime.label} ${runtime.expectedVersion}: agent registration, permission replay, and cleanup observed`,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

const pluginSource = createPluginSource();
for (const runtime of runtimes) {
  await runRuntimeSmoke(runtime, pluginSource);
}

console.log("real loader smoke: PASS");
