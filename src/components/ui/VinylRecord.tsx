"use client";

import { useEffect, useRef } from "react";
import { BrandMark } from "@/components/ui/BrandMark";

interface VinylRecordProps {
  isPlaying: boolean;
  className?: string;
}

const PLAYING_SPEED = 10;

export function VinylRecord({ isPlaying, className = "" }: VinylRecordProps) {
  const discRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const velocityRef = useRef(0);
  const targetRef = useRef(isPlaying ? PLAYING_SPEED : 0);

  useEffect(() => {
    targetRef.current = isPlaying ? PLAYING_SPEED : 0;
  }, [isPlaying]);

  useEffect(() => {
    const el = discRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const target = targetRef.current;
      velocityRef.current += (target - velocityRef.current) * Math.min(1, dt * 1.6);
      if (Math.abs(target - velocityRef.current) < 0.015) {
        velocityRef.current = target;
      }

      angleRef.current = (angleRef.current + velocityRef.current * dt) % 360;
      el.style.transform = `rotate(${angleRef.current.toFixed(3)}deg)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      <div ref={discRef} className="absolute inset-0 will-change-transform">
        <div className="vinyl-disc">
          <div className="vinyl-grooves" />
          <div className="vinyl-sheen" />
          <div className="vinyl-label">
            <BrandMark className="h-[18%] w-[18%] text-primary/45" />
          </div>
        </div>
      </div>
    </div>
  );
}
