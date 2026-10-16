import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { audioBlob, downloadAudio } from "@/lib/audioType";
import { formatClock } from "@/lib/hooks";
import { deleteTake, loadTakes, saveTake, type Take } from "@/lib/tabFiles";
import { cn } from "@/lib/utils";

// "Запись игры": the user records themselves to hear later how it went. Takes stay on this device.

/** Records from the microphone; `stop` resolves with the take's bytes. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const done = useRef<((r: { data: ArrayBuffer; mime: string } | null) => void) | null>(null);

  const start = useCallback(async () => {
    try {
      // Raw sound: the browser's voice processing eats the guitar's attack and sustain.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType });
        done.current?.(chunks.length ? { data: await blob.arrayBuffer(), mime: r.mimeType } : null);
        done.current = null;
      };
      r.start();
      rec.current = r;
      setStartedAt(Date.now());
      setRecording(true);
    } catch (e) {
      toast.error("Не удалось включить микрофон", { description: (e as Error).message });
    }
  }, []);

  const stop = useCallback(
    () =>
      new Promise<{ data: ArrayBuffer; mime: string } | null>((resolve) => {
        const r = rec.current;
        rec.current = null;
        setRecording(false);
        if (!r || r.state === "inactive") return resolve(null);
        done.current = resolve;
        r.stop();
      }),
    [],
  );

  // Leaving the screen mid-take drops it and frees the microphone.
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);
  return { recording, startedAt, start, stop };
}

/** Record / stop; a finished take is saved to the item. */
export function RecordButton({ itemId, bpm, onSaved, className }: { itemId: string; bpm?: number | null; onSaved?: () => void; className?: string }) {
  const { recording, startedAt, start, stop } = useRecorder();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [recording]);

  const toggle = async () => {
    haptic();
    if (!recording) return void start();
    const r = await stop();
    if (!r) return;
    await saveTake(itemId, { at: Date.now(), bpm: bpm ?? null, ...r });
    toast.success("Запись сохранена", { description: "Послушать — в карточке упражнения" });
    onSaved?.();
  };

  return (
    <Button variant={recording ? "destructive" : "secondary"} onClick={() => void toggle()} className={cn("h-11", className)}>
      {recording ? <Square fill="currentColor" className="size-4" /> : <Mic />}
      {recording ? `Стоп · ${formatClock((Date.now() - startedAt) / 1000)}` : "Записать игру"}
    </Button>
  );
}

/** The item's takes, newest first, with a recorder on top. */
export function TakesList({ itemId }: { itemId: string }) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const reload = useCallback(() => void loadTakes(itemId).then((t) => setTakes(t.reverse())), [itemId]);
  useEffect(reload, [reload]);

  return (
    <div className="space-y-2">
      <RecordButton itemId={itemId} onSaved={reload} className="w-full" />
      {takes?.length === 0 && <p className="px-1 text-sm text-muted">Записей пока нет. Кнопка записи есть и на занятии — рядом с упражнением.</p>}
      {takes?.map((t) => (
        <TakeRow
          key={t.at}
          take={t}
          onDelete={async () => {
            await deleteTake(itemId, t.at);
            reload();
          }}
        />
      ))}
    </div>
  );
}

function TakeRow({ take, onDelete }: { take: Take; onDelete: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(audioBlob(take.data));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [take]);
  const when = new Date(take.at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-1.5 rounded-2xl bg-surface-2/50 p-2.5">
      <div className="flex items-center gap-2 px-1 text-sm">
        <span className="flex-1 font-semibold">{when}</span>
        {take.bpm ? <span className="text-xs text-muted tabular-nums">{take.bpm} bpm</span> : null}
        <Button variant="ghost" size="icon-sm" aria-label="Скачать запись" onClick={() => downloadAudio(take.data, `запись ${when}`)}>
          <Download className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Удалить запись" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {url && <audio src={url} controls preload="metadata" className="h-10 w-full" />}
    </div>
  );
}
