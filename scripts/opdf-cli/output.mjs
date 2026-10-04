export function printResult(result, asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (result?.checks) {
    console.log(`OPDF audit: ${result.mode} @ ${result.url}`);
    for (const check of result.checks) {
      console.log(`${check.status === "pass" ? "PASS" : "FAIL"}  ${check.name}${check.error ? " - " + check.error : ""}`);
    }
    if (result.screenshots?.length) console.log("Screenshots:", result.screenshots.join(", "));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

export function printError(error, asJson) {
  const message = error instanceof Error ? error.message : String(error);
  if (asJson) {
    process.stderr.write(JSON.stringify({ ok: false, error: message }, null, 2) + "\n");
  } else {
    console.error("OPDF CLI error:", message);
  }
}
