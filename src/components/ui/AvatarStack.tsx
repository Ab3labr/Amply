"use client";

import { Participant } from "@/components/ui/ParticipantItem";

interface AvatarStackProps {
  members: Participant[];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AvatarStack({ members }: AvatarStackProps) {
  const visible = members.slice(0, 3);
  const overflow = members.length - visible.length;
  const hostPresent = members.some((m) => m.isHost);

  return (
    <div className="flex items-center gap-3">
      {hostPresent && (
        <span className="hidden rounded-full border border-border-subtle px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-secondary sm:inline-flex">
          Host
        </span>
      )}

      <div className="flex">
        {visible.map((member) => {
          const connected =
            member.status === "Online" || member.status === "Connected";
          return (
            <div
              key={member.id}
              title={member.isHost ? `${member.name} (host)` : member.name}
              className={`relative -ml-2 grid h-8 w-8 place-items-center rounded-full border-2 text-[11px] font-medium tracking-[0.02em] text-primary first:ml-0 ${
                member.isHost
                  ? "border-coral-text/50 bg-surface"
                  : "border-background bg-surface-2"
              }`}
            >
              {initials(member.name)}
              {!member.isHost && connected && (
                <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border-2 border-background bg-success" />
              )}
            </div>
          );
        })}
        {overflow > 0 && (
          <div className="-ml-2 grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-surface-2 text-[11px] font-medium text-secondary">
            +{overflow}
          </div>
        )}
      </div>

      {members.length > 0 && (
        <span
          aria-label={`${members.length} in the room`}
          className="font-mono text-[11px] tracking-[0.04em] text-secondary tabular-nums"
        >
          {members.length}
          <span className="hidden sm:inline"> in the room</span>
        </span>
      )}
    </div>
  );
}
