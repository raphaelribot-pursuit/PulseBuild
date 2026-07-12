import { CommandCenterShell } from "@/components/layout/CommandCenterShell";
import { CommandTopBar } from "@/components/layout/CommandTopBar";
import { TopBlockerBanner } from "@/components/command-center/TopBlockerBanner";
import { HealthStrip } from "@/components/command-center/HealthStrip";
import { LiveSignalFeed } from "@/components/command-center/LiveSignalFeed";
import { RecommendationQueue } from "@/components/command-center/RecommendationQueue";
import { AgentChatPanel } from "@/components/chat/AgentChatPanel";
import { VoiceEngine } from "@/components/chat/VoiceEngine";
import { TimelinePanel } from "@/components/timeline/TimelinePanel";

/**
 * Command Center / Home
 * Source: PulseBuild Source of Truth v2.0, Section 11
 *
 * All panels are wired to real seed data via the Agent Orchestrator and
 * Zustand stores, including live simulation (Phase 5), Approval +
 * Verification (Phase 6), and Chat + Voice (Phase 7). VoiceEngine renders
 * nothing — it's a background watcher that speaks Tier 1/2 alerts per
 * the Architecture Section 14 voice rules.
 */
export default function Home() {
  return (
    <CommandCenterShell>
      <VoiceEngine />
      <CommandTopBar />

      <main className="flex-1 p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        <TopBlockerBanner />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
            <HealthStrip />
            <LiveSignalFeed />
            <RecommendationQueue />
          </div>

          <div className="flex flex-col gap-4 sm:gap-6">
            <AgentChatPanel />
            <TimelinePanel />
          </div>
        </div>
      </main>
    </CommandCenterShell>
  );
}
