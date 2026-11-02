"use client";

import { useEffect, useRef, type CSSProperties } from "react";

const STEPS = [
  {
    number: "01",
    title: "Create",
    body: "Start your listening room.",
  },
  {
    number: "02",
    title: "Invite",
    body: "Share your unique room code.",
  },
  {
    number: "03",
    title: "Listen",
    body: "Add music and listen together.",
  },
] as const;

export function ListeningSteps() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reveal = () => {
      section.dataset.revealed = "true";
    };

    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          reveal();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="listening-heading"
      data-revealed="false"
      className="listening-steps relative z-20 bg-background px-6 py-[clamp(88px,14vh,152px)] sm:px-10"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <div
          className="step-reveal"
          style={{ "--step-index": 0 } as CSSProperties}
        >
          <span
            aria-hidden="true"
            className="mb-7 block h-px w-14 bg-accent sm:mb-9"
          />
          <h2
            id="listening-heading"
            className="max-w-[15ch] text-[clamp(36px,5.4vw,66px)] font-extrabold leading-[1.02] tracking-[-0.04em] text-primary"
          >
            Listening together is simple.
          </h2>
        </div>

        <ol className="mt-[clamp(48px,8vh,84px)] grid list-none grid-cols-1 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.number}
              className="step-reveal border-t border-primary/12 py-8 first:pt-0 md:border-l md:border-t-0 md:py-2 md:pl-8 md:first:border-l-0 md:first:pl-0"
              style={{ "--step-index": index + 1 } as CSSProperties}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[12px] leading-none tracking-[0.16em] text-coral-text">
                  {step.number}
                </span>
                <span aria-hidden="true" className="text-primary/30">
                  —
                </span>
                <span className="text-[12px] font-semibold uppercase leading-none tracking-[0.2em] text-primary">
                  {step.title}
                </span>
              </div>
              <p className="mt-4 max-w-[26ch] text-[clamp(17px,1.5vw,20px)] leading-relaxed text-primary/75 sm:mt-5">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
