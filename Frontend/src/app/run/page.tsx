"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent, KeyboardEvent } from "react";
import { toast } from "sonner";
import { FileText, LoaderCircle, Paperclip, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/Stepper";
import { ChatBubble } from "@/components/ChatBubble";
import { AnalyticsSection, RunAnswer } from "@/components/AnswerSections";
import { cn } from "@/lib/utils";
import { agent2Api, orchestratorApi } from "@/lib/api";
import type { Agent3Result, PipelineRunResponse, PipelineStatus, RuleSuggestion } from "@/types";

const DEMO_FILE = "insurance_variance_data_native.csv";
const DEMO_QUESTION = "What is the gross written premium trend and are there any anomalies?";
const POLL_INTERVAL_MS = 1500;
const MAX_QUESTION = 2000;

type UserMsg = { id: string; role: "user"; fileName?: string; fileSize?: number; text?: string };
type AssistantMsg = {
  id: string;
  role: "assistant";
  kind: "run" | "ask";
  state: "pending" | "done" | "error";
  status?: PipelineStatus | null;
  result?: PipelineRunResponse;
  agent3?: Agent3Result | null;
  rules?: RuleSuggestion[];
  error?: string;
};
type Msg = UserMsg | AssistantMsg;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function errorDetail(err: unknown): string {
  type AgentErr = { error?: { message?: string } };
  const data = (err as {
    response?: { data?: { note?: string; detail?: unknown; agent1?: AgentErr; agent2?: AgentErr } };
  })?.response?.data;
  // The orchestrator's `note` says which stage failed; the agent's own error message says why.
  const reason = data?.agent2?.error?.message || data?.agent1?.error?.message;
  const detail = data?.note || data?.detail;
  if (detail) {
    const text = typeof detail === "string" ? detail : JSON.stringify(detail);
    return reason ? `${text} Reason: ${reason}` : text;
  }
  return "The request failed. Check that all backend services are running (start-all.ps1).";
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<File | null>(null);
  // The dataset the conversation is about — follow-up questions re-use it via /pipeline/ask.
  const [dataset, setDataset] = useState<{ file: File; runId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const patch = (id: string, p: Partial<AssistantMsg>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? ({ ...m, ...p } as Msg) : m)));

  async function runPipeline(file: File, question: string, replyId: string) {
    const jobId = crypto.randomUUID();
    pollTimer.current = setInterval(async () => {
      try {
        const { data } = await orchestratorApi.get<PipelineStatus>(`/pipeline/status/${jobId}`);
        patch(replyId, { status: data });
        if (data.status !== "running") stopPolling();
      } catch {
        // 404 until the POST registers the job server-side — expected.
      }
    }, POLL_INTERVAL_MS);

    const form = new FormData();
    form.append("file", file);
    form.append("job_id", jobId);
    if (question) form.append("business_question", question);

    try {
      const { data } = await orchestratorApi.post<PipelineRunResponse>("/pipeline/run", form);
      stopPolling();
      sessionStorage.setItem("mva:lastPipelineResult", JSON.stringify(data));
      let rules: RuleSuggestion[] = [];
      if (data.agent2?.run_id) {
        setDataset({ file, runId: data.agent2.run_id });
        try {
          const { data: s } = await agent2Api.get<{ suggestions: RuleSuggestion[] }>("/rule-suggestions", {
            params: { status: "proposed" },
          });
          rules = s.suggestions.filter((r) => r.run_id === data.agent2.run_id);
        } catch {
          // Non-fatal: Agent 2 may be unreachable directly from the browser.
        }
      }
      patch(replyId, { state: "done", result: data, rules });
    } catch (err) {
      stopPolling();
      patch(replyId, { state: "error", error: errorDetail(err) });
    }
  }

  async function ask(file: File, runId: string, question: string, replyId: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("run_id", runId);
    form.append("business_question", question);
    try {
      const { data } = await orchestratorApi.post<{ agent3: Agent3Result }>("/pipeline/ask", form);
      patch(replyId, { state: "done", agent3: data.agent3 });
    } catch (err) {
      patch(replyId, { state: "error", error: errorDetail(err) });
    }
  }

  async function send(file: File | null, question: string) {
    question = question.trim();
    if (busy) return;
    if (!file && !dataset) {
      toast.error("Attach a CSV or Excel file to start.");
      return;
    }
    if (!file && !question) return;

    const userMsg: UserMsg = {
      id: crypto.randomUUID(),
      role: "user",
      fileName: file?.name,
      fileSize: file?.size,
      text: question || undefined,
    };
    const reply: AssistantMsg = {
      id: crypto.randomUUID(),
      role: "assistant",
      kind: file ? "run" : "ask",
      state: "pending",
    };
    setMessages((prev) => [...prev, userMsg, reply]);
    setText("");
    setAttached(null);
    setBusy(true);
    try {
      if (file) await runPipeline(file, question, reply.id);
      else await ask(dataset!.file, dataset!.runId, question, reply.id);
    } finally {
      setBusy(false);
      textRef.current?.focus();
    }
  }

  async function runDemo() {
    try {
      const res = await fetch(`/demo/${DEMO_FILE}`);
      if (!res.ok) throw new Error();
      const demo = new File([await res.blob()], DEMO_FILE, { type: "text/csv" });
      send(demo, DEMO_QUESTION);
    } catch {
      toast.error("Could not load the bundled demo dataset.");
    }
  }

  function reset() {
    stopPolling();
    setMessages([]);
    setDataset(null);
    setAttached(null);
    setText("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(attached, text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(attached, text);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) setAttached(f);
  }

  const canSend = !busy && (!!attached || (!!dataset && !!text.trim()));

  return (
    <div
      className="relative mx-auto flex h-[calc(100dvh-7.5rem)] max-w-3xl flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-accent/80 text-sm font-medium text-accent-foreground">
          Drop your CSV or Excel file
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">PrismBI Assistant</h1>
          <p className="text-xs text-muted-foreground">
            {dataset ? (
              <>
                Talking about <span className="font-medium text-foreground">{dataset.file.name}</span> — ask a
                follow-up, or attach a new file.
              </>
            ) : (
              "Attach a dataset and ask a business question."
            )}
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> New chat
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1" aria-live="polite">
        <div className="flex flex-col gap-5 pb-4">
          {messages.length === 0 && (
            <ChatBubble role="assistant">
              <div>
                <p className="font-medium">Hi! I&apos;m your BI assistant.</p>
                <p className="mt-1 text-muted-foreground">
                  Attach a CSV or Excel file and I&apos;ll run a quality check, classify its business domain, score
                  its AI readiness and — if you ask a question — find KPIs, trends and anomalies. You can keep asking
                  follow-up questions about the same dataset.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={runDemo} className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Try the Insurance demo
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> Attach a file
                  </Button>
                </div>
              </div>
            </ChatBubble>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <ChatBubble key={m.id} role="user">
                {m.fileName && (
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-primary-foreground/80">
                    <FileText className="h-3.5 w-3.5" />
                    {m.fileName} {m.fileSize != null && `· ${formatBytes(m.fileSize)}`}
                  </div>
                )}
                {m.text ? <p className="whitespace-pre-wrap">{m.text}</p> : <p>Analyse this dataset.</p>}
              </ChatBubble>
            ) : (
              <ChatBubble
                key={m.id}
                role="assistant"
                tone={m.state === "error" ? "destructive" : "default"}
                plain={m.state === "done"}
              >
                <AssistantBody msg={m} onRuleReviewed={(id) =>
                  patch(m.id, { rules: (m.rules ?? []).filter((r) => r.suggestion_id !== id) })
                } />
              </ChatBubble>
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
        {attached && (
          <div className="mb-2 flex w-fit items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-medium">{attached.name}</span>
            <span className="text-muted-foreground">{formatBytes(attached.size)}</span>
            <button type="button" aria-label="Remove file" onClick={() => setAttached(null)} className="rounded-full p-0.5 hover:bg-background">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach file"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            ref={textRef}
            rows={1}
            value={text}
            maxLength={MAX_QUESTION}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              dataset ? "Ask a follow-up question…" : "Ask a business question (optional), then attach a file…"
            }
            aria-label="Message"
            className="[field-sizing:content] max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={!canSend}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={(e) => {
            setAttached(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </form>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line · drag a file anywhere to attach
      </p>
    </div>
  );
}

function AssistantBody({ msg, onRuleReviewed }: { msg: AssistantMsg; onRuleReviewed: (id: string) => void }) {
  if (msg.state === "error") {
    return (
      <div>
        <p className="font-medium">{msg.kind === "run" ? "Pipeline failed" : "Couldn't answer that"}</p>
        <p className="mt-1">{msg.error}</p>
      </div>
    );
  }
  if (msg.state === "pending") {
    return (
      <div>
        {msg.kind === "run" ? (
          <>
            <p className="mb-1 font-medium">Working on it…</p>
            <p className="mb-3 text-xs text-muted-foreground">
              LLM stages can take up to a minute each when rate-limited — this is normal.
            </p>
            <Stepper
              stagesCompleted={msg.status?.stages_completed ?? []}
              status={msg.status?.status ?? "running"}
            />
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Analysing your question…
          </p>
        )}
      </div>
    );
  }
  return msg.kind === "run" && msg.result ? (
    <RunAnswer result={msg.result} pendingRules={msg.rules ?? []} onRuleReviewed={onRuleReviewed} />
  ) : (
    <AnalyticsSection agent3={msg.agent3} />
  );
}
