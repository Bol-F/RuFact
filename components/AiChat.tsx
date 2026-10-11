"use client";

import { ArrowUp, ArrowLeft, ExternalLink, Globe2, LoaderCircle, MessageCircle, ShieldCheck, Square, RotateCcw, Sparkles, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "./LanguageProvider";
import { chatCopy } from "@/lib/chat-copy";
import { CHAT_MESSAGE_LIMIT, recentChatMessages, safeChatSources, type ChatMessage, type ChatReply } from "@/lib/chat";
import { CHAT_SESSION_KEY, VISIBLE_TURN_LIMIT, parseChatSession, serializeChatSession, type ChatTurn } from "@/lib/chat-session";

function Answer({ reply }: { reply: Extract<ChatReply, { status: "complete" }> }) {
  // Text nodes only; turn real citation numbers into safe links, never render AI HTML.
  return <p className="whitespace-pre-wrap break-words text-base leading-relaxed">{reply.text.split(/(\[\d+\])/g).map((part, index) => {
    const number = /^\[(\d+)\]$/.exec(part);
    const source = number ? reply.sources[Number(number[1]) - 1] : undefined;
    return source ? <a key={index} href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${part} ${source.title}`} className="focus-ring rounded text-[#3d746b] underline decoration-[#94b3a6] underline-offset-4">{part}</a> : part;
  })}</p>;
}

export function AiChat() {
  const { locale } = useLanguage();
  const router = useRouter();
  const copy = chatCopy[locale];
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const latestReply = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let saved: ChatTurn[] = [];
    try { saved = parseChatSession(sessionStorage.getItem(CHAT_SESSION_KEY)); } catch { /* Storage may be disabled. In-memory chat still works. */ }
    startTransition(() => { setTurns(saved); setRestored(saved.length > 0); setReady(true); });
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      if (turns.some(turn => turn.reply)) sessionStorage.setItem(CHAT_SESSION_KEY, serializeChatSession(turns));
      else sessionStorage.removeItem(CHAT_SESSION_KEY);
    } catch { /* Never block chat when private browsing or quota prevents storage. */ }
  }, [turns, ready]);
  useEffect(() => {
    const container = thread.current;
    if (!turns.length || !container) return;
    const reply = latestReply.current;
    const top = turns.at(-1)?.reply && reply
      ? reply.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12
      : container.scrollHeight;
    container.scrollTo({ top, behavior: "smooth" });
  }, [turns, busy]);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 128)}px`;
  }, [draft]);

  async function ask(question: string, retry = false) {
    if (!ready || controller.current || !question.trim() || question.trim().length > CHAT_MESSAGE_LIMIT) return;
    const completed = retry ? turns.slice(0, -1) : turns;
    const history: ChatMessage[] = completed.flatMap(turn => turn.reply ? [{ role: "user", content: turn.question }, { role: "assistant", content: turn.reply.text }] : []);
    const messages = recentChatMessages([...history, { role: "user", content: question.trim() }]);
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(""); setDraft(""); setRestored(false);
    setTurns([...completed.filter(turn => turn.reply), { question: question.trim() }].slice(-VISIBLE_TURN_LIMIT));
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, locale }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35_000)]) });
      const reply = await response.json() as ChatReply;
      if (controller.current !== abort) return;
      if (!response.ok || reply.status !== "complete") {
        setError(reply.status === "unavailable" && reply.reason === "limited" ? copy.limited : reply.status === "unavailable" && reply.reason === "not-configured" ? copy.notConfigured : copy.unavailable);
      } else if (typeof reply.text === "string" && Array.isArray(reply.sources)) {
        setTurns(current => current.map((turn, index) => index === current.length - 1 ? { ...turn, reply: { ...reply, text: reply.text.slice(0, CHAT_MESSAGE_LIMIT), sources: safeChatSources(reply.sources) } } : turn));
      } else setError(copy.unavailable);
    } catch {
      if (controller.current !== abort) return;
      if (!abort.signal.aborted) setError(copy.unavailable);
    } finally {
      if (controller.current === abort) {
        controller.current = null; setBusy(false);
        if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
      }
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(draft); }
  function cancel() {
    const active = controller.current;
    if (!active) return;
    controller.current = null; active.abort();
    setBusy(false); setError(""); setDraft(current => current || turns.at(-1)?.question || "");
    setTurns(current => current.slice(0, -1));
  }
  function clear(end = false) {
    const active = controller.current;
    controller.current = null; active?.abort();
    setTurns([]); setError(""); setDraft(""); setBusy(false); setRestored(false);
    try { sessionStorage.removeItem(CHAT_SESSION_KEY); } catch { /* Optional storage. */ }
    if (end) router.push("/#analyzer"); else input.current?.focus();
  }
  const retryQuestion = turns.at(-1)?.reply ? null : turns.at(-1)?.question;
  const lastReply = turns.at(-1)?.reply;

  return (
    <section className="chat-workspace content-gutter flex min-h-0 flex-1 flex-col pb-2 sm:pb-4" aria-labelledby="chat-heading">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
        <div className="chat-heading-row mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0"><p className="mb-1 hidden text-[0.625rem] font-bold uppercase tracking-[0.14em] text-accent sm:block">{copy.eyebrow}</p><h1 id="chat-heading" className="font-serif text-xl leading-tight sm:text-2xl">{copy.title}</h1></div>
          <Link href="/#analyzer" aria-label={copy.check} title={copy.check} className="focus-ring flex min-h-11 shrink-0 items-center rounded-xl border border-[#d8ddd9] bg-white/60 px-3 text-xs font-semibold sm:text-sm"><ArrowLeft size={17} className="sm:hidden" /><span className="hidden sm:inline">{copy.check} ↗</span></Link>
        </div>
        <div className="chat-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[#d5ddd9] bg-[#fffdf9] shadow-[0_12px_45px_rgba(16,47,80,0.06)]">
          <div className="chat-toolbar flex shrink-0 items-center justify-between gap-2 border-b border-[#e5e7e2] bg-[#edf3f3] px-3 py-2 sm:px-5 sm:py-3">
            <div className="flex min-w-0 items-center gap-2.5"><div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white"><Sparkles size={18} /></div><div className="min-w-0"><h2 className="text-sm font-bold">{copy.assistant}</h2><p className="mt-0.5 truncate text-xs text-[#46716a]">{copy.retention}</p></div></div>
            <div className="flex shrink-0 gap-1">
              <button type="button" disabled={!ready || !turns.length} aria-label={copy.clear} title={copy.clear} onClick={() => clear()} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-white disabled:opacity-40"><RotateCcw size={17} /><span className="hidden sm:inline">{copy.clear}</span></button>
              <button type="button" aria-label={copy.end} title={copy.end} onClick={() => clear(true)} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-white"><LogOut size={17} /><span className="hidden sm:inline">{copy.end}</span></button>
            </div>
          </div>
          <div ref={thread} role="log" aria-label={copy.assistant} aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6">
            {restored ? <p role="status" className="mb-4 text-center text-xs text-muted">{copy.restored}</p> : null}
            {!turns.length ? <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-3 text-center sm:py-8"><MessageCircle aria-hidden="true" className="mb-3 text-[#729398]" size={30} /><h3 className="text-lg font-bold">{copy.emptyTitle}</h3><p className="mb-5 mt-2 max-w-md text-sm leading-relaxed text-muted">{copy.emptyText}</p><div className="grid w-full gap-2">{copy.prompts.map(prompt => <button key={prompt} type="button" onClick={() => { setDraft(prompt); input.current?.focus(); }} className="chat-prompt focus-ring flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#e0e5df] bg-[#f7f8f3] px-4 py-3 text-left text-sm hover:bg-[#edf2ed]">{prompt}<span aria-hidden="true">↗</span></button>)}</div></div> : <div className="space-y-6">{turns.map((turn, index) => <div key={index} className="space-y-3">
              <div className="chat-question ml-auto max-w-[92%] rounded-[18px] rounded-br-md bg-ink px-4 py-3 text-white sm:max-w-[80%]"><p className="mb-1 text-xs font-bold text-white/65">{copy.you}</p><p className="whitespace-pre-wrap break-words text-base leading-relaxed">{turn.question}</p></div>
              {turn.reply ? <article ref={index === turns.length - 1 ? latestReply : undefined} className="chat-answer max-w-full rounded-[18px] rounded-tl-md border border-[#e5e6dd] bg-[#f7f8f3] p-4 sm:max-w-[90%] sm:p-5"><p className="chat-answer-label mb-3 flex items-center gap-2 text-xs font-bold text-[#46716a]"><Sparkles size={14} />RuFact</p><Answer reply={turn.reply} />
                {turn.reply.sources.length ? <details className="mt-4 border-t border-[#dfe4d9] pt-2"><summary className="focus-ring min-h-11 cursor-pointer rounded-lg py-3 text-sm font-semibold text-[#46716a]"><Globe2 aria-hidden="true" size={15} className="mr-2 inline-block" />{copy.sources} <span className="ml-1 rounded-md bg-[#e7eee3] px-2 py-0.5 text-xs">{turn.reply.sources.length}</span></summary><div className="grid gap-2 pb-2 sm:grid-cols-2">{turn.reply.sources.map((source, number) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="focus-ring flex min-w-0 items-center gap-2 rounded-xl border border-[#dce2d6] bg-white px-3 py-3 text-sm"><span className="font-bold text-accent">[{number + 1}]</span><span className="min-w-0 flex-1 break-words">{source.title}</span><ExternalLink size={14} className="shrink-0" /></a>)}</div></details> : null}
              </article> : null}
            </div>)}</div>}
            {busy ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="animate-spin shrink-0" size={17} />{copy.thinking}</p> : null}
            {error ? <div role="alert" className="mt-5 rounded-xl border border-[#edd6c8] bg-[#fff1e7] p-4 text-sm leading-relaxed"><p>{error}</p>{retryQuestion ? <button type="button" onClick={() => void ask(retryQuestion, true)} className="focus-ring mt-2 min-h-11 rounded-lg px-3 font-bold underline">{copy.retry}</button> : null}</div> : null}
          </div>
          <form onSubmit={submit} className="chat-composer shrink-0 border-t border-[#e2e6df] bg-[#fffdf9] p-3 sm:px-5">
            {lastReply && !busy ? <div className="chat-followups mb-2 flex flex-wrap gap-2">{[[copy.more, copy.moreQuestion], [copy.explain, copy.explainQuestion]].map(([label, question]) => <button key={label} type="button" onClick={() => { setDraft(question); input.current?.focus(); }} className="focus-ring min-h-11 rounded-xl border border-[#e0e5df] px-3 text-xs font-semibold text-[#46716a] hover:bg-[#edf2ed]">{label} ↗</button>)}</div> : null}
            <div className="flex items-end gap-2 rounded-2xl border border-[#cbd8d0] bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-[#6d9186]/30"><textarea ref={input} aria-label={copy.input} placeholder={copy.placeholder} value={draft} maxLength={CHAT_MESSAGE_LIMIT} rows={1} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) { event.preventDefault(); void ask(draft); } }} className="min-h-11 min-w-0 flex-1 resize-none rounded-xl px-2 py-2 text-base leading-relaxed outline-none" />{busy ? <button key="stop" type="button" aria-label={copy.stop} title={copy.stop} onClick={cancel} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white"><Square size={17} /></button> : <button key="send" type="submit" aria-label={copy.send} title={copy.send} disabled={!ready || !draft.trim()} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white disabled:opacity-40"><ArrowUp size={21} /></button>}</div>
            <div className="mt-2 flex justify-between gap-2 text-[0.6875rem] leading-relaxed text-muted"><p className="hidden sm:block">{copy.keyboard}</p><p className="sm:hidden">{copy.hint}</p><p className="shrink-0">{draft.length} / {CHAT_MESSAGE_LIMIT}</p></div>
          </form>
        </div>
        <details className="chat-privacy relative mt-2 shrink-0 text-xs text-muted"><summary className="focus-ring cursor-pointer rounded-lg py-1.5 text-center"><ShieldCheck aria-hidden="true" size={13} className="mr-1 inline-block" />{copy.details} · {copy.caution}</summary><div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-[40dvh] overflow-auto rounded-2xl border border-[#d8ddd9] bg-[#fffdf9] p-4 text-sm leading-relaxed shadow-lg"><p>{copy.privacy}</p><p className="mt-2">{copy.resetLanguage}</p><a href="https://t.me/RuFact_bot" target="_blank" rel="noopener noreferrer" className="focus-ring mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-ink">{copy.telegram}<ExternalLink size={14} /></a></div></details>
      </div>
    </section>
  );
}
