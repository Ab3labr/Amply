"use client";

import { Button } from "@/components/ui/Button";
import { Navbar } from "@/components/ui/Navbar";
import { PageContainer } from "@/components/ui/PageContainer";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <PageContainer>
      {/* Film grain overlay */}
      <div className="grain" />
      {/* Rich landscape gradient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          linear-gradient(to bottom, oklch(97% 0.008 85) 0%, oklch(95% 0.006 85) 40%, transparent 70%),
          radial-gradient(ellipse 120% 80% at 50% 100%, oklch(72% 0.12 25 / 0.6), transparent 50%),
          radial-gradient(ellipse 100% 60% at 20% 100%, oklch(65% 0.18 28 / 0.5), transparent 45%),
          radial-gradient(ellipse 90% 50% at 80% 100%, oklch(60% 0.10 320 / 0.4), transparent 40%),
          radial-gradient(ellipse 80% 40% at 40% 100%, oklch(70% 0.14 280 / 0.35), transparent 35%),
          radial-gradient(ellipse 70% 30% at 60% 100%, oklch(55% 0.08 200 / 0.3), transparent 30%),
          radial-gradient(ellipse 60% 25% at 30% 100%, oklch(62% 0.11 15 / 0.25), transparent 25%),
          oklch(97% 0.008 85)
        `
      }} />

      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center text-center w-full z-10 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[800px] w-full"
        >
          <h1 className="text-[56px] md:text-[80px] font-bold leading-[1.1] mb-8 tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-primary to-primary/70">
            One room.<br />
            Every device.<br />
            Perfectly together.
          </h1>
          
          <p className="text-[20px] text-secondary mb-12 max-w-xl mx-auto leading-relaxed">
            Create a listening room in seconds and play music across every connected device.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button className="w-full sm:w-auto min-w-[220px]" onClick={() => router.push("/host-setup")}>
              Host a Room
            </Button>
            <Button variant="secondary" className="w-full sm:w-auto min-w-[220px]" onClick={() => router.push("/join")}>
              Join with Code
            </Button>
          </div>
        </motion.div>
      </main>

      <footer className="w-full text-center pb-8 z-10">
        <span className="text-[13px] text-secondary font-medium tracking-wide opacity-60">
          Designed for shared listening.
        </span>
      </footer>
    </PageContainer>
  );
}
