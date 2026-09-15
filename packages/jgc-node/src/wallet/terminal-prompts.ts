import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import type { RecoveryPrompts } from "./onboarding.js";

/** Terminal-only secret input; never accept a phrase through argv or logs. */
export function terminalRecoveryPrompts(): RecoveryPrompts {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Wallet setup/recovery requires a private interactive terminal");
  const ask = (question: string, hidden: boolean): Promise<string> => new Promise((resolve, reject) => {
    process.stdout.write(question);
    const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const rl = createInterface({ input: process.stdin, output: hidden ? sink : process.stdout, terminal: true, historySize: 0 });
    let answered = false;
    rl.once("SIGINT", () => rl.close());
    rl.once("close", () => { sink.destroy(); if (!answered) reject(new Error("Wallet operation cancelled")); });
    rl.question("", answer => { answered = true; rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
  return {
    show: message => { process.stdout.write(`${message}\n`); },
    secret: question => ask(question, true),
    acknowledge: question => ask(question, false),
    // Best effort only: clearing the display cannot erase external recordings.
    clear: () => { process.stdout.write("\x1b[2J\x1b[3J\x1b[H"); },
  };
}
