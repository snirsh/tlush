import { spawn, spawnSync } from "node:child_process";

export interface ProcResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export function run(cmd: string, args: string[], stdin?: Uint8Array | string): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout!.on("data", (d: Buffer) => out.push(d));
    child.stderr!.on("data", (d: Buffer) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8") }));
    if (stdin !== undefined) child.stdin!.end(stdin);
  });
}

export const hasCommand = (name: string): boolean => spawnSync("sh", ["-c", `command -v ${name}`]).status === 0;
