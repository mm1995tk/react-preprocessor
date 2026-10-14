#!/usr/bin/env node
import { run } from "./commands.ts";

process.exitCode = run(process.argv.slice(2), {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
});
