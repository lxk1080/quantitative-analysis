import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";

export function launchWorkerOnce(): void {
  const python = process.env.PYTHON_BIN ?? "python";
  const processHandle = spawn(python, ["-m", "quant_worker.cli", "worker"], {
    cwd: process.cwd(),
    detached: false,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  processHandle.unref();
}

export function launchDemoSeed(): Promise<void> {
  const python = process.env.PYTHON_BIN ?? "python";
  return new Promise((resolve, reject) => {
    const processHandle = spawn(python, ["-m", "quant_worker.cli", "seed-demo"], {
      cwd: process.cwd(),
      stdio: "pipe",
      windowsHide: true,
      env: process.env,
    });
    let stderr = "";
    processHandle.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    processHandle.on("error", reject);
    processHandle.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `Python exited with ${code}`)));
  });
}
