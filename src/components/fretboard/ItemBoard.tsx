import { useMemo, useState } from "react";
import { ScaleBoard } from "./ScaleBoard";
import { choiceOf, theoryView } from "@/music/theoryView";
import type { TheoryLink } from "@/shared/types";

/** An exercise's scale or chord on the neck, with its own position stepper. */
export function ItemBoard({ link }: { link: TheoryLink }) {
  const [position, setPosition] = useState(0);
  const view = useMemo(() => theoryView(choiceOf(link)), [link.tab, link.tonic, link.scaleId, link.chordType, link.diatonic]);
  return (
    <ScaleBoard
      title={view.title}
      subtitle={view.subtitle}
      tones={view.tones}
      chord={view.chord}
      patterns={view.patterns}
      position={position}
      onPosition={setPosition}
      chordOnly={link.tab === "chord"}
    />
  );
}
