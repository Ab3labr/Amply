"use client";

import { Copy } from "lucide-react";
import { toast } from "@/components/ui/Toast";

interface RoomCodeChipProps {
  code: string;
}

export function RoomCodeChip({ code }: RoomCodeChipProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast("Room code copied");
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface/70 py-1.5 pl-3.5 pr-1.5">
      <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-primary tabular-nums">
        {code}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy room code"
        title="Copy room code"
        className="grid h-7 w-7 place-items-center rounded-full text-secondary transition-colors duration-200 hover:bg-surface-2 hover:text-primary active:translate-y-px"
      >
        <Copy size={13} strokeWidth={1.8} />
      </button>
    </div>
  );
}
