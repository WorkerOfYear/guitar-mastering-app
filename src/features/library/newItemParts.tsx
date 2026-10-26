import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FileMusic, Globe, Upload, Video, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { haptic } from "@/app/telegram";
import { cn } from "@/lib/utils";
import { TAB_ACCEPT, TAB_MAX } from "./MediaCard";
import { TabSearch } from "./TabSearch";

// Pieces of the "new exercise" and "new piece" forms.

/** Checks a picked file's size before taking it. */
export const pickFile = (max: number, set: (f: File) => void, tooBig: string) => (f: File) => (f.size > max ? toast.error(tooBig) : set(f));

export function VideoField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Video className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="url" placeholder="Ссылка YouTube (можно с таймкодом) или Instagram" className="pl-10 text-sm" />
      </div>
      {error && <p className="px-1 text-xs text-guide">Не похоже на ссылку YouTube или Instagram</p>}
    </div>
  );
}

/** Own file or links found online. Both stay mounted: switching back keeps the results and the chosen file. */
export function ScoreFields({
  file,
  onFile,
  links,
  onLinks,
  query,
  auto,
  initialMode = "file",
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  links: string[];
  onLinks: (l: string[]) => void;
  query: string;
  auto: boolean;
  initialMode?: "file" | "search";
}) {
  const [mode, setMode] = useState(initialMode);
  return (
    <>
      <div role="radiogroup" aria-label="Ноты" className="grid grid-cols-2 gap-2">
        <SourceTile active={mode === "file"} onClick={() => setMode("file")} icon={<Upload />} title="Загрузить" sub="Guitar Pro, MusicXML" />
        <SourceTile active={mode === "search"} onClick={() => setMode("search")} icon={<Globe />} title="Найти в интернете" sub="Songsterr, UG, MuseScore" />
      </div>
      <div hidden={mode !== "file"}>
        <FileField icon={<FileMusic />} file={file} accept={TAB_ACCEPT} onFile={pickFile(TAB_MAX, onFile, "Файл больше 5 МБ — это точно ноты?")} onClear={() => onFile(null)}>
          Выбрать файл (.gp, .gp5, .gpx, .musicxml, .mxl)
        </FileField>
      </div>
      <div hidden={mode !== "search"}>
        <TabSearch
          query={query}
          auto={auto}
          picked={links}
          onToggle={(url) => onLinks(links.includes(url) ? links.filter((u) => u !== url) : [...links, url])}
          onScore={(data, name, url) => {
            onFile(new File([data], name));
            if (!links.includes(url)) onLinks([...links, url]);
          }}
        />
        {file && (
          <div className="mt-2">
            <FileField icon={<FileMusic />} file={file} accept={TAB_ACCEPT} onFile={onFile} onClear={() => onFile(null)}>
              {file.name}
            </FileField>
          </div>
        )}
      </div>
    </>
  );
}

/** One of two options (play-along source, where the tab comes from), picked like a radio button. */
export function SourceTile({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => {
        haptic();
        onClick();
      }}
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition-[background-color,border-color,transform] active:scale-[0.98] [&_svg]:size-6",
        active ? "border-accent bg-accent/10 text-fg" : "border-line text-muted",
      )}
    >
      <span className={active ? "text-accent" : ""}>{icon}</span>
      <span className="text-sm font-semibold text-fg">{title}</span>
      <span className="text-[11px] leading-tight">{sub}</span>
    </button>
  );
}

/** A chosen file with a remove button, or a dashed button to choose one. */
export function FileField({
  icon,
  file,
  accept,
  onFile,
  onClear,
  children,
}: {
  icon: ReactNode;
  file: File | null;
  accept: string;
  onFile: (f: File) => void;
  onClear: () => void;
  children: ReactNode;
}) {
  if (file)
    return (
      <div className="flex h-12 items-center gap-2 rounded-2xl bg-surface-2/60 pl-4 pr-1 text-sm [&_svg]:size-4">
        <span className="shrink-0 text-accent">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Убрать файл" onClick={onClear}>
          <X />
        </Button>
      </div>
    );
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-3 py-2 text-center text-sm font-semibold transition-colors hover:bg-surface-2 active:scale-[0.99]">
      <Upload className="size-4 shrink-0 text-muted" />
      <span>{children}</span>
      <input type="file" accept={accept} hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}
