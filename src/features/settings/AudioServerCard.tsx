import { useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, PlugZap } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { checkServer, type AudioServer } from "@/lib/youtubeAudio";
import { checkScoreServer } from "@/lib/scoreDownload";
import { useSettings } from "@/store/settings";

/** Address and key of one of the user's servers: the YouTube audio one or the MuseScore one. */
function ServerCard({ text, server, onChange, checkIt }: { text: string; server: AudioServer; onChange: (s: AudioServer) => void; checkIt: (s: AudioServer) => Promise<string> }) {
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      toast.success(await checkIt(server));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">{text}</p>
      <Input
        value={server.url}
        onChange={(e) => onChange({ ...server, url: e.target.value })}
        inputMode="url"
        autoComplete="off"
        placeholder="Адрес, например 1-2-3-4.sslip.io"
      />
      <Input
        value={server.key}
        onChange={(e) => onChange({ ...server, key: e.target.value })}
        type="password"
        autoComplete="off"
        placeholder="Ключ"
      />
      <Button variant="secondary" onClick={() => void check()} disabled={busy || !server.url.trim() || !server.key.trim()} className="w-full">
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
      </Button>
    </Card>
  );
}

/** The server that takes the audio out of YouTube and Instagram videos. */
export function AudioServerCard() {
  const { audioServer, setAudioServer } = useSettings();
  return (
    <ServerCard
      text="Свой сервер скачивает звук из видео — его можно сразу привязать к табу. Настраивается один раз на каждом устройстве."
      server={audioServer}
      onChange={setAudioServer}
      checkIt={checkServer}
    />
  );
}

/** The server that downloads sheet music from MuseScore (server/score-download). */
export function ScoreServerCard() {
  const { scoreServer, setScoreServer } = useSettings();
  return (
    <ServerCard
      text="Свой сервер скачивает ноты с MuseScore по ссылке, прикреплённой к песне: MusicXML (сразу в табы, только бесплатные ноты), PDF, MIDI, звук. Настраивается один раз на каждом устройстве."
      server={scoreServer}
      onChange={setScoreServer}
      checkIt={checkScoreServer}
    />
  );
}
