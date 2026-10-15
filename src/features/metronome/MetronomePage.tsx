import { useState } from "react";
import { MetronomePanel, SoundPanel, useMetronomeKeys } from "@/components/metronome/MetronomePanel";
import { Segmented } from "@/components/ui";
import { PageHeader } from "@/components/ui/Placeholder";

export function MetronomePage() {
  const [tab, setTab] = useState<"metronome" | "sound">("metronome");
  useMetronomeKeys();
  return (
    <div>
      <PageHeader title="Метроном" />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "metronome", label: "Метроном" },
          { value: "sound", label: "Звук" },
        ]}
      />
      {tab === "metronome" ? <MetronomePanel /> : <SoundPanel />}
    </div>
  );
}
