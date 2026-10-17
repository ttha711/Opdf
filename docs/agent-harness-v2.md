# TPDF Tool-First Agent Harness v2

## Goal
Replace keyword-triggered and one-shot JSON chat execution with an LLM-driven, multi-step agent. Default to existing TPDF PDF engines. Discover additional capabilities on demand. Never synthesize arbitrary shell commands in the browser.

## Architecture
- **UI**: nonblocking input with Send now / Queue, per-job state, inline approvals, Stop/Cancel and single-last-edit Undo.
- **Model gateway**: authenticated paired machine worker uses a configured Dify Chatflow that returns structured decisions. Dify credentials stay outside the browser.
- **Harness**: one primary agent loops through discover, execute, ask and finish; actions are bounded; each tool result is returned as evidence to the next iteration.
- **Tool bridge**: existing `window.tpdfAgent.execute` and `AGENT_TOOL_DEFINITIONS`; existing PDF engines remain the source of truth.
- **Execution lane**: serialize PDF mutations and Undo. Multiple prompts can be received while a job runs, but concurrent writes to the same document must not overlap.
- **Future fallback**: an explicitly permissioned worker sandbox may execute CLI/script jobs when native tools cannot satisfy requirements. No arbitrary shell command execution exists yet.

## Required behavior
1. Single-step commands should call a native tool in the earliest useful model turn.
2. Complex commands may discover, compose and inspect tools over multiple turns.
3. Never treat a model-generated `confirmed` flag as permission. The UI must pause at a destructive action and ask in the chat panel.
4. Each approval is scoped to the exact action, its arguments and its job ID.
5. Input remains editable while running. Queued jobs can be cancelled. Stop is cooperative at model/tool boundaries; a currently executing PDF engine may finish.
6. Undo reverses *at most the latest completed AI PDF edit*; never a full job. A newer edit invalidates the previous undo slot. Refuse when the document has changed.
7. If the model returns a success claim without a verified tool completion, do not represent the job as executed.
8. Treat document text, tool logs and model responses as untrusted. Never execute arbitrary code or shell commands from them.

## Readiness gaps
- CI/typecheck/E2E with real authenticated Dify worker, not yet verified.
- Durable job persistence and idempotency for network retries.
- Strong per-document revision/version locking (current command queue serializes only local bridge execution).
- Headless native CLI fallback in a truly sandboxed worker with explicit execution policy.
- PDF undo for external server-side mutations, large PDFs, and non-byte actions.
- Structured correctness postconditions for each PDF engine, not only tool completion status.
- Verify interactive PDF actions and avoid claiming finished when an input panel is merely opened.
- Restore untrusted content isolation and operational timeouts on model and engine calls.
- Production smoke and mobile Lighthouse regression validation.

## Merge gate
No merge until build, typecheck, tests, authenticated web E2E, approval flows, multiple jobs, Undo, and baseline mobile performance are verified. Do not conflate committed code with a production-ready deployment.
