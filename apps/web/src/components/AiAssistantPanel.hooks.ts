import { useRef, useState, type FormEvent } from "react";
import type { AgentCommand } from "../agent/agentCommands";
import type { HarnessCheckpoint } from "../agent/harness";
import { createUiAgentHarness } from "./uiAgentHarness";
import { useAiAssistantMessages } from "./useAiAssistantMessages";
import { useMachineAgentBridge } from "../hooks/useMachineAgentBridge";
import { useAiCommandRuntime } from "./useAiCommandRuntime";

type Job = { id: string; goal: string; status: "queued" | "running" | "approval" | "completed" | "failed"; checkpoint?: HarnessCheckpoint };
const id = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

export function useAiAssistant() {
  const [inputValue, setInputValue] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef<Job[]>([]);
  const active = useRef(new Set<string>());
  const serial = useRef(Promise.resolve());
  const machineBridge = useMachineAgentBridge();
  const { messages, chatEndRef, addMessage, setMessages } = useAiAssistantMessages();
  const commandRuntime = useAiCommandRuntime({ addMessage, setMessages });

  const update = (job: Job) => {
    jobsRef.current = jobsRef.current.map((item) => item.id === job.id ? job : item);
    setJobs([...jobsRef.current]);
  };
  const harness = createUiAgentHarness({
    machineBridge,
    execute: (command) => {
      const execute = serial.current.then(() => commandRuntime.executeCommand(command));
      serial.current = execute.then(() => undefined, () => undefined);
      return execute;
    },
    onProgress: () => {},
  });

  const drainQueued = () => {
    // Queue mode runs in FIFO order after all active immediate jobs finish.
    if (active.current.size > 0 || jobsRef.current.some((job) => job.status === "approval")) return;
    const first = jobsRef.current.find((job) => job.status === "queued");
    if (first) void run(first);
  };

  async function run(job: Job, approval?: "approve" | "reject") {
    if (active.current.has(job.id)) return;
    active.current.add(job.id);
    update({ ...job, status: "running" });
    const pendingId = addMessage("assistant", "Processing: " + job.goal, { isPending: true });
    try {
      const result = await harness.run(job.goal, job.checkpoint, approval);
      setMessages((items) => items.filter((item) => item.id !== pendingId));
      if (result.status === "confirmation_required" && result.checkpoint.pending) {
        addMessage("assistant", result.message, {
          confirmation: result.checkpoint.pending,
          jobId: job.id,
        });
        update({ ...job, status: "approval", checkpoint: result.checkpoint });
      } else {
        const status = result.status === "completed" ? "completed" : "failed";
        update({ ...job, status });
        addMessage("assistant", result.message, {
          jobId: job.id,
          toolLogs: result.checkpoint.observations.map((entry) =>
            entry.action + ": " + entry.detail + " " + JSON.stringify(entry.result)).join("\n"),
        });
      }
    } catch (error) {
      setMessages((items) => items.filter((item) => item.id !== pendingId));
      update({ ...job, status: "failed" });
      addMessage("assistant", "Agent error: " + String(error), { jobId: job.id });
    } finally {
      active.current.delete(job.id);
      queueMicrotask(drainQueued);
    }
  }

  const submitText = (text: string, mode: "now" | "queue" = "now") => {
    const goal = text.trim();
    if (!goal) return;
    const job: Job = { id: id(), goal, status: "queued" };
    jobsRef.current.push(job);
    setJobs([...jobsRef.current]);
    addMessage("user", goal + (mode === "queue" ? " (queued)" : ""), { jobId: job.id });
    if (mode === "now") void run(job);
    else queueMicrotask(drainQueued);
  };

  const handleSubmit = (event: FormEvent, mode: "now" | "queue" = "now") => {
    event.preventDefault();
    const text = inputValue;
    if (!text.trim()) return;
    setInputValue("");
    submitText(text, mode);
  };

  const handleConfirmInline = (command: AgentCommand, confirm: boolean, jobId?: string) => {
    const job = jobsRef.current.find((candidate) =>
      candidate.id === jobId && candidate.status === "approval" &&
      candidate.checkpoint?.pending?.tool === command.tool &&
      JSON.stringify(candidate.checkpoint.pending.args ?? {}) === JSON.stringify(command.args ?? {}),
    );
    if (!job) return;
    setMessages((items) => items.map((item) =>
      item.jobId === job.id && item.confirmation ? { ...item, confirmation: undefined } : item,
    ));
    void run(job, confirm ? "approve" : "reject");
  };

  return {
    messages, inputValue, setInputValue, chatEndRef,
    jobs, showSettings, setShowSettings,
    handleSubmit, handleConfirmInline, handleSuggestionClick: submitText,
    machineAgentConnected: machineBridge.connected,
    machineAgentCount: machineBridge.agents.length,
    pairingCode: machineBridge.pairing?.code,
    pairingExpiresAt: machineBridge.pairing?.expiresAt,
    pairingLoading: machineBridge.loading,
    pairingError: machineBridge.error,
    startMachineAgentPairing: machineBridge.startPairing,
  };
}
