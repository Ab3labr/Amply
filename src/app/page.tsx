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
          <BrandMark className="h-[clamp(26px,3.6vw,54px)] w-auto" />
          <span className="text-[clamp(27px,3.3vw,50px)] font-extrabold leading-none tracking-[-0.045em]">
            Amply
          </span>
        </Link>
      </header>

      <main className="relative z-20 flex flex-col items-center px-6 text-center">
        <div className="landing-rise flex flex-col items-center pt-[clamp(34px,10vh,148px)] [animation-delay:90ms]">
          <h1 className="text-[clamp(27px,5.9vw,82px)] font-extrabold leading-[1.04] tracking-[-0.04em] text-primary">
            <span className="block">One room. Every device.</span>
            <span className="block">Perfectly together.</span>
          </h1>

          <p className="mt-5 max-w-[46rem] text-[clamp(15px,1.35vw,21px)] leading-relaxed text-primary/75 sm:mt-6">
            Create a listening room in seconds and play music across every connected device.
          </p>

          <div className="mt-8 flex w-full max-w-[420px] flex-col items-center gap-3 sm:mt-10 sm:w-auto sm:max-w-none sm:flex-row sm:gap-5">
            <Link
              href="/host-setup"
              className="inline-flex h-[54px] w-full items-center justify-center rounded-full bg-primary px-9 text-[17px] font-semibold text-background transition-colors duration-300 hover:bg-[#1d1d1d] active:translate-y-px sm:h-[56px] sm:w-auto sm:min-w-[200px] sm:text-[18px]"
            >
              Host a Room
            </Link>
            <Link
              href="/join"
              className="inline-flex h-[54px] w-full items-center justify-center rounded-full border-[1.5px] border-primary/80 px-9 text-[17px] font-semibold text-primary transition-colors duration-300 hover:bg-primary/[0.04] active:translate-y-px sm:h-[56px] sm:w-auto sm:min-w-[200px] sm:text-[18px]"
            >
              Join with Code
            </Link>
          </div>
        </div>
      </main>

      {/* Painterly wave: the landing page's signature brand moment */}
      <div
        className="landing-wave-mask relative z-0 mt-auto h-[clamp(230px,40vh,500px)] w-full"
        aria-hidden="true"
      >
        <div className="landing-wave absolute inset-0" />
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-[clamp(18px,4.6vh,52px)] z-30 px-6 text-center text-[clamp(14px,1.3vw,19px)] font-semibold tracking-[0.005em] text-white [text-shadow:0_1px_20px_rgba(64,18,0,0.5)]">
        Designed for shared listening.
      </p>
    </div>
  );
}
