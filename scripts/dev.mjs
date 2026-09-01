import { execFile, spawn } from "node:child_process";
import path from "node:path";

const host = "127.0.0.1";
const port = "3000";
const url = `http://${host}:${port}`;
const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

let browserOpened = false;
function openBrowser() {
  if (browserOpened) return;
  browserOpened = true;
  if (process.platform === "win32") {
    execFile("cmd.exe", ["/c", "start", "", url]);
  } else if (process.platform === "darwin") {
    execFile("open", [url]);
  } else {
    execFile("xdg-open", [url]);
  }
}

const next = spawn(process.execPath, [nextCli, "dev", "--hostname", host, "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

function forward(stream, target) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    target.write(text);
    if (text.includes("Ready") || text.includes("Local:")) openBrowser();
  });
}

forward(next.stdout, process.stdout);
forward(next.stderr, process.stderr);
next.on("error", (error) => {
  console.error(`无法启动 Next.js：${error.message}`);
  process.exitCode = 1;
});
next.on("close", (code) => { process.exitCode = code ?? 1; });
