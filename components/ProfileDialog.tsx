"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileSettings } from "./ProfileSettings";

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [restoreDisabled, setRestoreDisabled] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    const analyzer = document.getElementById("analyzer");
    const updateBusy = () => setRestoreDisabled(analyzer?.getAttribute("aria-busy") === "true");
    const observer = new MutationObserver(updateBusy);
    if (analyzer) observer.observe(analyzer, { attributes: true, attributeFilter: ["aria-busy"] });
    updateBusy();
    return () => {
      observer.disconnect();
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return <dialog ref={dialog} data-testid="profile-dialog" aria-labelledby="profile-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}
    className="profile-dialog m-auto max-h-[92dvh] w-[calc(100%_-_24px)] max-w-[940px] overflow-y-auto rounded-[22px] border border-[var(--region-border,#d9d7d1)] bg-paper p-0 text-ink shadow-2xl backdrop:bg-[#102a49]/45 backdrop:backdrop-blur-sm sm:w-[calc(100%_-_48px)]">
    <div className="sm:p-3"><ProfileSettings onClose={onClose} restoreDisabled={restoreDisabled} onRestore={item => {
      if (document.getElementById("analyzer")) {
        if (document.getElementById("analyzer")?.getAttribute("aria-busy") === "true") return;
        const event = new CustomEvent("rufact-history-restore", { detail: item.id, cancelable: true });
        if (!window.dispatchEvent(event)) return;
      }
      else router.push(`/?history=${encodeURIComponent(item.id)}#analyzer`);
      onClose();
    }} /></div>
  </dialog>;
}
