import { useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, PlugZap } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { checkServer } from "@/lib/youtubeAudio";
import { useSettings } from "@/store/settings";

/** Address and key of the user's server that takes the audio out of YouTube videos. */
export function AudioServerCard() {
  const { audioServer, setAudioServer } = useSettings();
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      toast.success(await checkServer(audioServer));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Свой сервер скачивает звук из видео — его можно сразу привязать к табу. Настраивается один раз на каждом устройстве.</p>
      <Input
        value={audioServer.url}
        onChange={(e) => setAudioServer({ ...audioServer, url: e.target.value })}
        inputMode="url"
        autoComplete="off"
        placeholder="Адрес, например 1-2-3-4.sslip.io"
      />
      <Input
        value={audioServer.key}
        onChange={(e) => setAudioServer({ ...audioServer, key: e.target.value })}
        type="password"
        autoComplete="off"
        placeholder="Ключ"
      />
      <Button variant="secondary" onClick={() => void check()} disabled={busy || !audioServer.url.trim() || !audioServer.key.trim()} className="w-full">
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
      </Button>
    </Card>
  );
}
