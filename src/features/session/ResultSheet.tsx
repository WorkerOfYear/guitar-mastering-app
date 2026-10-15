import { useEffect, useState } from "react";
import { m } from "motion/react";
import { Check, CircleAlert, Minus, Plus, Target, X } from "lucide-react";
import { Button, IconButton, Input, Toggle } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { haptic } from "@/app/telegram";
import { clampBpm } from "@/store/metronome";
import { findSection, targetBpm, unitTitle } from "@/lib/progress";
import { localDate } from "@/lib/date";
import { useData } from "@/store/data";
import type { PlanEntry, Result } from "@/shared/types";

interface Props {
  open: boolean;
  entry: PlanEntry;
  bpm: number;
  onClose: (saved: boolean) => void;
}

const RESULTS: { value: Result; label: string; color: string; icon: typeof Check }[] = [
  { value: "clean", label: "Чисто", color: "var(--good)", icon: Check },
  { value: "errors", label: "С ошибками", color: "var(--root)", icon: CircleAlert },
  { value: "fail", label: "Не вышло", color: "var(--guide)", icon: X },
];

/** Bottom sheet: which tempo was played and how clean it was. */
export function ResultSheet({ open, entry, bpm: initialBpm, onClose }: Props) {
  const { items, logTempo, markPlayed, setStatus, updateSection } = useData();
  const item = items.find((i) => i.id === entry.itemId);
  const hasTempo = item?.startBpm != null || item?.targetBpm != null || item?.type === "song";
  const [bpm, setBpm] = useState(initialBpm);
  const [useTempo, setUseTempo] = useState(hasTempo);
  const [note, setNote] = useState("");
  const [reached, setReached] = useState(false);

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setBpm(initialBpm);
    setUseTempo(hasTempo);
    setNote("");
    setReached(false);
  }, [open]);

  const save = (result: Result) => {
    haptic();
    const date = localDate();
    logTempo({ itemId: entry.itemId, sectionId: entry.sectionId, date, bpm: useTempo ? bpm : null, result, note: note.trim() || undefined });
    markPlayed([entry], date);
    const target = targetBpm(item, entry.sectionId);
    // Clean at the target tempo: offer the "learned" mark (unless it's already there). The user decides.
    const learned = (entry.sectionId ? findSection(item, entry.sectionId)?.status : item?.status) === "rotation";
    if (result === "clean" && useTempo && target && bpm >= target && !learned) setReached(true);
    else onClose(true);
  };

  const toRotation = () => {
    if (entry.sectionId) updateSection(entry.itemId, entry.sectionId, { status: "rotation" });
    else setStatus(entry.itemId, "rotation");
    onClose(true);
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerDescription>Результат</DrawerDescription>
          <DrawerTitle>{unitTitle(item, entry.sectionId)}</DrawerTitle>
        </DrawerHeader>

        {reached ? (
          <m.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3 pb-1">
            <div className="flex items-center gap-3 rounded-2xl bg-good/15 p-4 text-good">
              <Target className="size-8 shrink-0" />
              <p className="text-lg font-semibold">Цель достигнута: {bpm} bpm чисто!</p>
            </div>
            <p className="text-sm text-muted">
              Похоже, {entry.sectionId ? "раздел разобран" : "разобрано"}. Отметить? Тогда это будет попадать в блок «Повторение», а в «Разбор нового» придёт
              следующее.
            </p>
            <div className="flex gap-2">
              <Button size="lg" onClick={toRotation} className="flex-1">
                <Check /> Разобрано
              </Button>
              <Button size="lg" variant="secondary" onClick={() => onClose(true)} className="flex-1">
                Ещё поработаю
              </Button>
            </div>
          </m.div>
        ) : (
          <div className="space-y-3">
            {hasTempo && <Toggle label="Записать темп" checked={useTempo} onChange={setUseTempo} />}
            {useTempo && (
              <div className="flex items-center gap-2">
                <IconButton label="−5" onClick={() => setBpm(clampBpm(bpm - 5))}>
                  −5
                </IconButton>
                <IconButton label="−1" onClick={() => setBpm(clampBpm(bpm - 1))}>
                  <Minus />
                </IconButton>
                <div className="flex-1 text-center">
                  <div className="text-5xl font-bold leading-none tabular-nums tracking-tight">{bpm}</div>
                  <div className="text-xs text-muted">bpm</div>
                </div>
                <IconButton label="+1" onClick={() => setBpm(clampBpm(bpm + 1))}>
                  <Plus />
                </IconButton>
                <IconButton label="+5" onClick={() => setBpm(clampBpm(bpm + 5))}>
                  +5
                </IconButton>
              </div>
            )}
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка" />
            <div className="grid grid-cols-3 gap-2">
              {RESULTS.map((r) => (
                <m.button
                  key={r.value}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => save(r.value)}
                  className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-bold text-on-accent"
                  style={{ background: r.color, boxShadow: `0 8px 20px -10px ${r.color}` }}
                >
                  <r.icon className="size-6" />
                  {r.label}
                </m.button>
              ))}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
