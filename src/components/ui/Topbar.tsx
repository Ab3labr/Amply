"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { RoomCodeChip } from "@/components/ui/RoomCodeChip";
import { AvatarStack } from "@/components/ui/AvatarStack";
import { MusicSearch } from "@/components/ui/MusicSearch";
import { Participant } from "@/components/ui/ParticipantItem";

interface TopbarProps {
  code: string;
  members: Participant[];
  onLeave: () => void;
  canPlayNow?: boolean;
  queuedVideoIds?: string[];
}

export function Topbar({
  code,
  members,
  onLeave,
  canPlayNow = false,
  queuedVideoIds = [],
}: TopbarProps) {
  return (
    <header className="relative z-30 flex h-[60px] flex-none items-center gap-3 border-b border-border-subtle px-3.5 sm:h-[68px] sm:gap-5 sm:px-6 lg:px-8 xl:px-10">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <Link
          href="/"
          replace
          aria-label="Amply home"
          className="flex flex-none items-center gap-2 text-[21px] font-medium tracking-[-0.02em] text-primary transition-opacity hover:opacity-75 sm:text-[23px]"
        >
          <BrandMark className="h-3.5 w-3.5 text-primary" />
          Amply
        </Link>

        <RoomCodeChip code={code} />
      </div>

      <div className="hidden min-w-0 flex-1 justify-center px-6 lg:flex">
        <MusicSearch
          code={code}
          variant="header"
          canPlayNow={canPlayNow}
          queuedVideoIds={queuedVideoIds}
        />
      </div>

      <div className="ml-auto flex flex-none items-center gap-1.5 sm:gap-3">
        <AvatarStack members={members} />

        <button
          type="button"
          onClick={onLeave}
          aria-label="Log out"
          title="Log out"
          className="grid h-9 w-9 place-items-center rounded-full text-secondary transition-colors duration-200 hover:bg-primary/5 hover:text-primary active:translate-y-px"
        >
          <LogOut size={16} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
