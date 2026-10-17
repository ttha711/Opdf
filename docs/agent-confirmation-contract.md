# TPDF Agent confirmation and interruption contract

## Decision
All confirmations occur inside TPDF. Never use browser-native `window.confirm`, `window.alert`, or `window.prompt` as an approval mechanism.

## Agent actions
- Tool execution is model-driven, via the existing `window.tpdfAgent.execute` bridge.
- The model may request a destructive tool, but `confirmed` is always reset to `false` on the initial attempt.
- Executor returns `confirmation_required`; harness saves an immutable pending command in a checkpoint and stops.
- AI chat displays a local approval control with the exact tool ID, arguments, and a clear Reject / Approve this action pair.
- On approval, only that exact pending command is replayed with `confirmed: true`. Further destructive commands require another approval.
- On rejection, the current run stops; no later steps are executed.
- A new user request invalidates a prior in-memory pending approval.
- Approval UI must not automatically confirm on Enter or via model JSON. It must be a user click.
- UI must show errors without claiming success. Persistent jobs/restart-safe approvals require a dedicated server-side job implementation and are not part of the current browser checkpoint.

## Existing non-agent dialogs
The `ConfirmProvider` is for ordinary file/tab lifecycle, such as closing a modified document or switching a tab. It owns an in-app `role=dialog` with keyboard Escape and a visible cancel button. If no provider is mounted, the hook now fails closed rather than calling browser-native confirm.

## Follow-up hardening
- Add action-specific confirmation previews for page counts, target filename and exact mutations.
- Require one approval authority per mutation so nested calls to `useConfirm` do not prompt again after a previously approved agent command.
- Bound run duration, isolate separate chat sessions, persist checkpoints and create a recovery path for long tasks.
- Use a server-mediated approval token for headless CLI execution; never interpret a model's `confirmed` field as authorization.
- Audit every remaining browser-native dialog call and guard browser process termination separately.

## Acceptance scenarios
1. "Delete page 2" shows an inline confirmation without opening a native browser dialog.
2. Reject leaves the file untouched; follow-up steps stop.
3. Approve replays only the exact pending command; subsequent destructive steps ask again.
4. Missing React confirmation provider returns false.
5. Save/close/switch without unsaved data do not ask unnecessarily.
6. Failed tools show errors, not a success toast.
7. Keyboard-only users can focus and activate the approval buttons.
