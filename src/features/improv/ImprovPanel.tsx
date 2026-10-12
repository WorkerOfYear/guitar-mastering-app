import { useMemo, useState } from "react";
import { ScaleBoard, highlightOf } from "@/components/fretboard/ScaleBoard";
import { Dices, ExternalLink, Lock, LockOpen, Play, Target } from "lucide-react";
import { Button, Card, Chip, ScrollRow, SectionTitle } from "@/components/ui";
import { strum } from "@/audio/player";
import { chordTones, voicings } from "@/music/chords";
import { buildPatterns, STANDARD_TUNING } from "@/music/fretboard";
import { randomTask, resolveProgression, youtubeBackingUrl } from "@/music/improv";
import { scaleById, scaleTones } from "@/music/scales";
import { useData } from "@/store/data";
import type { ImprovTask } from "@/shared/types";

interface Props {
  task: ImprovTask;
  onChange: (task: ImprovTask) => void;
}

/** Improvisation task: key, chord progression, scale choices per chord shown on the fretboard. */
export function ImprovPanel({ task, onChange }: Props) {
  const { recentKeys, pushRecentKey } = useData();
  const [lockKey, setLockKey] = useState(false);
  const [lockProgression, setLockProgression] = useState(false);
  const [chordIndex, setChordIndex] = useState(0);
  const [scalePick, setScalePick] = useState<{ rootId: string; scaleId: string } | null>(null);
  const [position, setPosition] = useState(0);

  const r = useMemo(() => resolveProgression(task.key, task.progressionId), [task.key, task.progressionId]);
  const chord = r.chords[Math.min(chordIndex, r.chords.length - 1)];
  const scale = scalePick ?? r.overall[0];
  const def = scaleById(scale.scaleId);
  const tones = scaleTones(scale.rootId, scale.scaleId);
  const base = def.patternBase ? scaleTones(scale.rootId, def.patternBase) : tones;
  const patterns = useMemo(() => buildPatterns(base, STANDARD_TUNING, { extra: def.patternBase ? tones : undefined }), [scale.rootId, scale.scaleId]);
  const chordSet = highlightOf(chordTones(chord.rootId, chord.type));
  const chordVoicings = voicings(chord.rootId, chord.type, STANDARD_TUNING).slice(0, 2);

  const regenerate = () => {
    const next = randomTask({
      recentKeys,
      lock: { key: lockKey ? task.key : undefined, progressionId: lockProgression ? task.progressionId : undefined },
    });
    pushRecentKey(next.key);
    setChordIndex(0);
    setScalePick(null);
    setPosition(0);
    onChange(next);
  };

  const pickChord = (i: number) => {
    setChordIndex(i);
    // Keep "one scale for everything" if that is what's selected, otherwise follow the chord.
    if (scalePick && !r.overall.some((o) => o.rootId === scalePick.rootId && o.scaleId === scalePick.scaleId)) {
      setScalePick(r.chords[i].scales[0]);
    }
  };

  const isPicked = (s: { rootId: string; scaleId: string }) => s.rootId === scale.rootId && s.scaleId === scale.scaleId;

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-bold tracking-tight">{r.keyName}</div>
            <div className="text-sm text-muted">{r.progression.name}</div>
          </div>
          <Button onClick={regenerate}>
            <Dices /> Новое
          </Button>
        </div>
        <div className="mt-3 flex gap-2 text-xs">
          <LockChip label="тональность" locked={lockKey} onToggle={() => setLockKey(!lockKey)} />
          <LockChip label="прогрессия" locked={lockProgression} onToggle={() => setLockProgression(!lockProgression)} />
        </div>
        <div className="mt-3 flex gap-2.5 rounded-2xl bg-accent/10 p-3 text-sm">
          <Target className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            <span className="text-muted">Задание: </span>
            <b>{task.challenge}</b>
          </span>
        </div>
      </Card>

      <SectionTitle>Аккорды — нажми, чтобы подсветить на грифе</SectionTitle>
      <ScrollRow>
        {r.chords.map((c, i) => (
          <Chip key={i} active={i === chordIndex} sub={`${c.roman}${c.bars > 1 ? ` · ${c.bars} т.` : ""}`} onClick={() => pickChord(i)}>
            {c.symbol}
          </Chip>
        ))}
      </ScrollRow>

      <SectionTitle>Лады</SectionTitle>
      <div className="space-y-2">
        <ScrollRow>
          {r.overall.map((s) => (
            <Chip key={s.scaleId} active={isPicked(s)} sub="на всю прогрессию" onClick={() => setScalePick(s)}>
              {s.name}
            </Chip>
          ))}
        </ScrollRow>
        <ScrollRow>
          {chord.scales
            .filter((s) => !r.overall.some((o) => o.rootId === s.rootId && o.scaleId === s.scaleId))
            .map((s) => (
              <Chip key={s.scaleId} active={isPicked(s)} sub={`под ${chord.symbol}`} onClick={() => setScalePick(s)}>
                {s.name}
              </Chip>
            ))}
        </ScrollRow>
      </div>

      <ScaleBoard
        title={tones[0].name + " " + def.name.toLowerCase()}
        subtitle={`Подсвечен ${chord.symbol}`}
        tones={tones}
        chord={chordSet}
        patterns={patterns}
        position={position}
        onPosition={setPosition}
      />

      {chordVoicings.length > 0 && (
        <Card className="flex items-center justify-between gap-3">
          <div className="text-sm">
            Проиграй аккорды по кругу, чтобы услышать гармонию.
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  r.chords.forEach((c, i) => {
                    const v = voicings(c.rootId, c.type, STANDARD_TUNING)[0];
                    if (v) setTimeout(() => strum(v.notes.map((n) => n.midi)), i * 900);
                  });
                }}
              >
                <Play className="size-4" fill="currentColor" /> Прослушать прогрессию
              </Button>
              <Button asChild variant="secondary" size="sm">
                <a href={youtubeBackingUrl(r.overall[0].rootId, r.overall[0].scaleId)} target="_blank" rel="noreferrer">
                  Бэкинг на YouTube <ExternalLink className="size-4 text-muted" />
                </a>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function LockChip({ label, locked, onToggle }: { label: string; locked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={locked}
      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-medium transition-colors ${locked ? "border-accent bg-accent/10 text-accent" : "border-line text-muted"}`}
    >
      {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />} {label}
    </button>
  );
}
