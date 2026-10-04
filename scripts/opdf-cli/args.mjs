export function parseArgs(argv) {
  const positionals = [];
  const options = {};
  const booleanFlags = new Set(["json", "headed", "help", "destructive"]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const raw = token.slice(2);
    const eq = raw.indexOf("=");
    if (eq >= 0) {
      options[raw.slice(0, eq)] = raw.slice(eq + 1);
      continue;
    }

    if (booleanFlags.has(raw)) {
      options[raw] = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${raw}`);
    }
    options[raw] = value;
    index += 1;
  }

  return { positionals, options };
}

export function resolveRuntimeOptions(options = {}) {
  const timeout = Number(options.timeout ?? process.env.OPDF_CLI_TIMEOUT ?? 30000);
  const wait = Number(options.wait ?? 700);
  if (!Number.isFinite(timeout) || timeout < 1000) throw new Error("--timeout must be at least 1000 ms");
  if (!Number.isFinite(wait) || wait < 0) throw new Error("--wait must be zero or greater");

  return {
    url: String(options.url ?? process.env.OPDF_URL ?? "http://127.0.0.1:8787"),
    pdf: options.pdf ? String(options.pdf) : null,
    json: Boolean(options.json),
    headed: Boolean(options.headed),
    timeout,
    wait,
    out: String(options.out ?? "opdf-cli-artifacts"),
    trace: options.trace ? String(options.trace) : null,
    videoDir: options["video-dir"] ? String(options["video-dir"]) : null,
    destructive: Boolean(options.destructive),
  };
}
