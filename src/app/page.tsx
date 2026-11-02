import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";

export default function Home() {
  return (
    <div className="relative flex min-h-[100svh] flex-col overflow-x-hidden bg-background">
      {/* Film grain across the cream ground and the wave */}
      <div className="grain z-10" aria-hidden="true" />

      <header className="landing-rise relative z-20 px-6 pt-6 sm:px-10 sm:pt-8">
        <Link
          href="/"
          aria-label="Amply home"
          className="inline-flex items-center gap-2.5 rounded-sm text-primary sm:gap-3"
        >
          <BrandMark className="h-[clamp(26px,4vw,64px)] w-auto" />
          <span className="text-[clamp(27px,3.55vw,58px)] font-bold leading-none tracking-[-0.04em]">
            Amply
          </span>
        </Link>
      </header>

      <main className="relative z-20 flex flex-1 flex-col items-center justify-center px-6 text-center sm:justify-end sm:pb-[clamp(10px,1.6vh,20px)]">
        <div className="landing-rise flex flex-col items-center pt-[clamp(24px,5vh,56px)] [animation-delay:90ms] sm:pt-0">
          <h1 className="text-[clamp(27px,min(5.9vw,8.4vh),86px)] font-extrabold leading-[1.06] tracking-[-0.04em] text-primary">
            <span className="block">One room. Every device.</span>
            <span className="block">Perfectly together.</span>
          </h1>

          <p className="mt-5 max-w-[54rem] text-[clamp(15px,1.35vw,21px)] leading-relaxed text-primary/85 sm:mt-6">
            Create a listening room in seconds and play music across every connected device.
          </p>

          <div className="mt-8 flex w-full max-w-[420px] flex-col items-center gap-3 sm:mt-[clamp(36px,6.4vh,64px)] sm:w-auto sm:max-w-none sm:flex-row sm:gap-5">
            <Link
              href="/host-setup"
              className="inline-flex h-[54px] w-full items-center justify-center rounded-full bg-primary px-9 text-[17px] font-semibold text-background transition-colors duration-300 hover:bg-[#1d1d1d] active:translate-y-px sm:h-[58px] sm:w-auto sm:min-w-[200px] sm:text-[18px]"
            >
              Host a Room
            </Link>
            <Link
              href="/join"
              className="inline-flex h-[54px] w-full items-center justify-center rounded-full border-[1.5px] border-primary/80 px-9 text-[17px] font-semibold text-primary transition-colors duration-300 hover:bg-primary/[0.04] active:translate-y-px sm:h-[58px] sm:w-auto sm:min-w-[200px] sm:text-[18px]"
            >
              Join with Code
            </Link>
          </div>
        </div>
      </main>

      {/* Painterly wave: the landing page's signature brand moment */}
      <div
        className="landing-wave-mask relative z-0 h-[clamp(240px,42vh,480px)] w-full sm:h-[42vh]"
        aria-hidden="true"
      >
        <div className="landing-wave absolute inset-0" />
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-[clamp(20px,6vh,60px)] z-30 px-6 text-center text-[clamp(14px,1.3vw,19px)] font-semibold tracking-[0.005em] text-white [text-shadow:0_1px_20px_rgba(64,18,0,0.5)]">
        Designed for shared listening.
      </p>
    </div>
  );
}
