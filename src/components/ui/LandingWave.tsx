"use client";

import { useEffect, useRef } from "react";

const LAYERS = ["pink", "violet", "coral", "olive", "amber"] as const;

/**
 * The painterly wave. CSS keeps the artwork flowing on its own; this component
 * only writes three custom properties while a fine pointer moves, so the
 * pigment layers can lean toward the cursor without re-rendering React.
 */
export function LandingWave() {
  const waveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wave = waveRef.current;
    if (!wave) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reduceMotion.matches) return;

    let targetX = 0;
    let targetY = 0;
    let targetRotation = 0;
    let x = 0;
    let y = 0;
    let rotation = 0;
    let frame = 0;
    let idleTimer: number | undefined;
    let running = false;

    const write = () => {
      wave.style.setProperty("--wave-px", `${x.toFixed(2)}px`);
      wave.style.setProperty("--wave-py", `${y.toFixed(2)}px`);
      wave.style.setProperty("--wave-rot", `${rotation.toFixed(3)}deg`);
    };

    const tick = () => {
      // Follow the pointer gently, but settle back to rest a little faster.
      const returning = targetX === 0 && targetY === 0 && targetRotation === 0;
      const ease = returning ? 0.14 : 0.075;
      x += (targetX - x) * ease;
      y += (targetY - y) * ease;
      rotation += (targetRotation - rotation) * ease;
      write();

      const settled =
        Math.abs(targetX - x) < 0.05 &&
        Math.abs(targetY - y) < 0.05 &&
        Math.abs(targetRotation - rotation) < 0.002;

      if (settled) {
        x = targetX;
        y = targetY;
        rotation = targetRotation;
        write();
        running = false;
        return;
      }

      frame = window.requestAnimationFrame(tick);
    };

    const wake = () => {
      if (running) return;
      running = true;
      frame = window.requestAnimationFrame(tick);
    };

    const reset = () => {
      targetX = 0;
      targetY = 0;
      targetRotation = 0;
      wake();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;

      const nx = (event.clientX / window.innerWidth - 0.5) * 2;
      const ny = (event.clientY / window.innerHeight - 0.5) * 2;

      targetX = -nx * 26;
      targetY = -ny * 13;
      targetRotation = nx * 0.6;

      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(reset, 550);
      wake();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("pointerleave", reset);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("pointerleave", reset);
      wave.style.removeProperty("--wave-px");
      wave.style.removeProperty("--wave-py");
      wave.style.removeProperty("--wave-rot");
    };
  }, []);

  return (
    <div className="landing-wave" ref={waveRef}>
      {LAYERS.map((layer) => (
        <div key={layer} className={`wave-cell wave-cell--${layer}`}>
          <div className="wave-cell__parallax">
            <div className="wave-cell__art" />
          </div>
        </div>
      ))}
    </div>
  );
}
