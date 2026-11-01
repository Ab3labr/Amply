"use client";

import { useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/components/ui/Toast";

interface QueueInputProps {
  code: string;
  variant?: "header" | "queue";
  className?: string;
}

export function QueueInput({ code, variant = "header", className = "" }: QueueInputProps) {
  const [link, setLink] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    if (!link.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/rooms/${code}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      if (res.ok) {
        toast("Added to queue");
        setLink("");
        inputRef.current?.focus();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`flex h-12 items-center gap-2 rounded-full border border-border-subtle bg-surface/75 pl-5 pr-1.5 transition-colors duration-200 focus-within:border-border-strong focus-within:bg-surface ${
        variant === "queue" ? "w-full" : "w-full max-w-[420px]"
      } ${className}`}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Paste YouTube link to add"
        aria-label="Add a YouTube link to the queue"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        disabled={isLoading}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-primary placeholder:text-secondary focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={!link.trim() || isLoading}
        aria-label="Add to queue"
        className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary text-background transition-[opacity,transform] duration-200 hover:opacity-85 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {isLoading ? (
          <Loader2 size={16} strokeWidth={2} className="animate-spin" />
        ) : (
          <Plus size={18} strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}
