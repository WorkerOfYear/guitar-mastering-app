import { useState } from "react";
import { CompactMetronome } from "@/components/metronome/MetronomePanel";
import { PageHeader } from "@/components/ui/Placeholder";
import { randomTask } from "@/music/improv";
import { useData } from "@/store/data";
import { ImprovPanel } from "./ImprovPanel";

/** Improvisation outside a session. */
export function ImprovPage() {
  const [task, setTask] = useState(() => randomTask({ recentKeys: useData.getState().recentKeys }));
  return (
    <div className="space-y-3">
      <PageHeader title="Импровизация" />
      <CompactMetronome />
      <ImprovPanel task={task} onChange={setTask} />
    </div>
  );
}
