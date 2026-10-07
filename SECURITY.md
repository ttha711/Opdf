# Security Policy

## Scope

Security reports for OPDF should focus on the web/server runtime, authentication,
document isolation, file handling, PDF processing, update/deployment boundaries,
and any path that could expose user documents or credentials.

## Reporting a vulnerability

Please do not publish credentials, private document samples, exploit details, or
other sensitive data in a public issue.

Use GitHub's private security-advisory reporting flow for this repository when
available. Include:

- affected commit/version;
- reproduction steps using non-sensitive test data;
- expected and actual behavior;
- impact;
- relevant request ID or server log timestamp;
- a minimal proof of concept when needed.

## Production response

For a confirmed vulnerability affecting an Internet-facing OPDF deployment:

1. block or disable the affected route/feature when practical;
2. rotate any credential that may have been exposed;
3. preserve the relevant structured request logs;
4. patch and run CI plus the production E2E gate;
5. restore service only after the deployed commit SHA matches the tested build.

Never attach real signing certificates, authentication secrets, S3 credentials,
or user PDFs to a public report.
