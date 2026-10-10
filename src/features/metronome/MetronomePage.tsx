import { MetronomePanel } from "@/components/metronome/MetronomePanel";
import { PageHeader } from "@/components/ui/Placeholder";

export function MetronomePage() {
  return (
    <div>
      <PageHeader title="Метроном" />
      <MetronomePanel />
    </div>
  );
}
