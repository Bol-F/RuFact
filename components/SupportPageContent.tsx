"use client";

import { ArrowLeft, ArrowRight, Check, Clock3, ExternalLink, Heart, LoaderCircle, LockKeyhole, MessageSquareText, Send, Share2, ShieldCheck, Star, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/copy-text";
import { STARS_AMOUNTS, type StarsAmount, type SupportAvailability } from "@/lib/support";
import { useFeedback } from "./FeedbackProvider";
import { useLanguage } from "./LanguageProvider";

const PUBLIC_SITE_URL = "https://rufact.vercel.app/";
const GITHUB_URL = "https://github.com/Bol-F/RuFact";
type InvoiceState = "idle" | "loading" | "ready" | "error" | "rate-limit" | "unavailable";
type ShareState = "idle" | "copied" | "shared" | "error";

function GitHubMark() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.71-1.5-2.5-.29-5.12-1.25-5.12-5.56 0-1.23.44-2.23 1.16-3.01-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.64 0c2.15-1.45 3.1-1.15 3.1-1.15.61 1.55.23 2.69.11 2.98.72.78 1.16 1.78 1.16 3.01 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" /></svg>;
}

function readInvoiceUrl(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== 1 || typeof candidate.url !== "string") return null;
  // Only Telegram's one-time invoice links, never arbitrary provider redirects.
  return /^https:\/\/t\.me\/\$[A-Za-z0-9_-]{10,256}$/u.test(candidate.url) ? candidate.url : null;
}

export function SupportPageContent({ availability }: { availability: SupportAvailability }) {
  const { locale, copy: translations } = useLanguage();
  const copy = translations.support;
  const { openFeedback } = useFeedback();
  const [amount, setAmount] = useState<StarsAmount>(100);
  const [invoiceState, setInvoiceState] = useState<InvoiceState>("idle");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const invoiceRequest = useRef<AbortController | null>(null);
  const loading = invoiceState === "loading";

  useEffect(() => () => invoiceRequest.current?.abort(), []);

  function selectAmount(nextAmount: StarsAmount) {
    setAmount(nextAmount);
    setInvoiceUrl(null);
    setInvoiceState("idle");
  }

  async function createInvoice() {
    if (!availability.starsEnabled || invoiceRequest.current) return;
    const controller = new AbortController();
    invoiceRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    setInvoiceState("loading");
    setInvoiceUrl(null);
    try {
      const response = await fetch("/api/support/stars", {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ amount, locale }), signal: controller.signal,
      });
      if (!response.ok) {
        setInvoiceState(response.status === 429 ? "rate-limit" : response.status === 503 ? "unavailable" : "error");
        return;
      }
      const body = await response.text();
      if (body.length > 4096) throw new Error("Invalid invoice response");
      const url = readInvoiceUrl(JSON.parse(body));
      if (!url) throw new Error("Invalid invoice response");
      setInvoiceUrl(url);
      setInvoiceState("ready");
    } catch {
      setInvoiceState("error");
    } finally {
      window.clearTimeout(timeout);
      invoiceRequest.current = null;
    }
  }

  async function shareProject() {
    setShareState("idle");
    if (navigator.share) {
      try {
        await navigator.share({ title: "RuFact", text: copy.shareText, url: PUBLIC_SITE_URL });
        setShareState("shared");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    setShareState(await copyText(PUBLIC_SITE_URL) ? "copied" : "error");
  }

  const invoiceError = invoiceState === "rate-limit" ? copy.invoiceRateLimit
    : invoiceState === "unavailable" ? copy.invoiceUnavailable
    : invoiceState === "error" ? copy.invoiceError : null;
  const shareMessage = shareState === "copied" ? copy.shareCopied
    : shareState === "shared" ? copy.shareDone
    : shareState === "error" ? copy.shareError : null;

  return (
    <div className="support-page content-gutter">
      <section className="support-intro" aria-labelledby="support-heading">
        <Link className="support-back focus-ring" href="/#analyzer"><ArrowLeft size={15} aria-hidden="true" />{copy.back}</Link>
        <h1 id="support-heading">{copy.title}<Heart className="support-title-heart" aria-hidden="true" /></h1>
        <p className="support-intro-copy">{copy.intro}</p>
        <p className="support-voluntary">{copy.voluntary}</p>
      </section>

      <div className="support-methods">
        <section className="support-card support-stars" aria-labelledby="stars-heading" data-testid="support-stars" data-enabled={availability.starsEnabled}>
          <div className="support-card-heading">
            <span className="support-icon support-icon-star"><Star size={28} fill="currentColor" strokeWidth={1.5} aria-hidden="true" /></span>
            <div><h2 id="stars-heading">{copy.starsTitle}</h2><p>{copy.starsDescription}</p></div>
          </div>
          <fieldset className="support-amounts" disabled={loading}>
            <legend className="sr-only">{copy.amountLegend}</legend>
            {STARS_AMOUNTS.map(value => (
              <label className="support-amount" key={value}>
                <input className="sr-only" type="radio" name="stars-amount" value={value} checked={amount === value} onChange={() => selectAmount(value)} aria-label={copy.amountAria.replace("{amount}", String(value))} />
                <span><strong>{value}</strong><Star size={16} fill="currentColor" aria-hidden="true" /></span>
              </label>
            ))}
          </fieldset>
          {!availability.starsEnabled ? (
            <div className="support-availability" data-testid="stars-disabled-status"><Clock3 size={20} aria-hidden="true" /><div><strong>{copy.starsDisabled}</strong><p>{copy.starsDisabledDescription}</p></div></div>
          ) : (
            <div className="support-availability support-availability-enabled"><ShieldCheck size={20} aria-hidden="true" /><div><strong>{copy.starsReady}</strong><p>{copy.starsNote}</p></div></div>
          )}
          <button className="support-primary focus-ring" type="button" disabled={!availability.starsEnabled || loading} onClick={createInvoice} aria-describedby="support-invoice-note">
            {loading ? <LoaderCircle className="support-spinner" size={19} aria-hidden="true" /> : <Send size={19} aria-hidden="true" />}
            {loading ? copy.starsLoading : copy.starsButton}
          </button>
          <div aria-live="polite" aria-atomic="true">
            {invoiceState === "ready" && invoiceUrl ? (
              <div className="support-invoice-ready" data-testid="support-invoice-ready"><p><Check size={18} aria-hidden="true" />{copy.invoiceReady}</p><a className="support-invoice-link focus-ring" href={invoiceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{copy.invoiceOpen}<ExternalLink size={16} aria-hidden="true" /></a></div>
            ) : null}
            {invoiceError ? <p className="support-error" role="alert">{invoiceError}</p> : null}
          </div>
          <p className="support-payment-note" id="support-invoice-note"><ShieldCheck size={17} aria-hidden="true" /><span>{copy.invoiceNotPaid}</span></p>
        </section>

        <section className="support-card support-wallet" aria-labelledby="wallet-heading" data-testid="support-wallet">
          <div className="support-card-heading"><span className="support-icon support-icon-wallet"><LockKeyhole size={26} aria-hidden="true" /></span><div><h2 id="wallet-heading">{copy.walletTitle}</h2></div></div>
          <p className="support-wallet-description">{copy.walletDescription}</p>
          <div className="support-wallet-art" aria-hidden="true"><Wallet size={95} strokeWidth={1.15} /><span><LockKeyhole size={27} strokeWidth={1.6} /></span></div>
          <div className="support-wallet-status"><LockKeyhole size={16} aria-hidden="true" />{copy.walletStatus}</div>
          <p className="support-wallet-eligibility">{copy.walletEligibility}</p>
          <p className="support-wallet-note">{copy.walletNote}</p>
        </section>
      </div>

      <section className="support-alternatives" aria-labelledby="other-support-heading">
        <h2 id="other-support-heading">{copy.otherTitle}</h2>
        <p className="support-other-intro">{copy.otherIntro}</p>
        <div className="support-alternative-list">
          <a className="support-alternative focus-ring" href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={copy.githubAction}><span className="support-alternative-icon"><GitHubMark /></span><span><strong>{copy.githubTitle}</strong><span>{copy.githubDescription}</span></span><ArrowRight className="support-alternative-arrow" size={19} aria-hidden="true" /></a>
          <button className="support-alternative focus-ring" type="button" onClick={shareProject} aria-label={copy.shareAction}><span className="support-alternative-icon"><Share2 size={24} aria-hidden="true" /></span><span><strong>{copy.shareTitle}</strong><span>{copy.shareDescription}</span></span><ArrowRight className="support-alternative-arrow" size={19} aria-hidden="true" /></button>
          <button className="support-alternative focus-ring" type="button" onClick={() => openFeedback()} aria-label={copy.feedbackAction}><span className="support-alternative-icon"><MessageSquareText size={24} aria-hidden="true" /></span><span><strong>{copy.feedbackTitle}</strong><span>{copy.feedbackDescription}</span></span><ArrowRight className="support-alternative-arrow" size={19} aria-hidden="true" /></button>
        </div>
        <p className="support-share-status" role="status">{shareMessage}</p>
      </section>
      <section className="support-trust" aria-labelledby="support-trust-heading"><ShieldCheck size={21} aria-hidden="true" /><div><h2 id="support-trust-heading">{copy.trustTitle}</h2><p>{copy.trust}</p>{availability.contactUrl ? <a className="focus-ring" href={availability.contactUrl} target="_blank" rel="noopener noreferrer">{copy.contact}<ExternalLink size={13} aria-hidden="true" /></a> : null}</div></section>
    </div>
  );
}
