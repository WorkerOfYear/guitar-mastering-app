import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { loadSamples } from "@/audio/clicks";
import { useMetronome } from "@/store/metronome";
import { MetronomePanel, SettingsPanel, preloadRhythmImages, useMetronomeKeys } from "@/components/metronome/MetronomePanel";
import { IconButton } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/Placeholder";

export function MetronomePage() {
  const [settings, setSettings] = useState(false);
  useMetronomeKeys();
  // decode the click recordings while the page is idle, so the first click is not delayed
  useEffect(() => void loadSamples(), []);
  // …and the pattern icons, so the picker does not draw them one by one
  useEffect(() => preloadRhythmImages(useMetronome.getState().beatUnit), []);
  return (
    <div>
      <PageHeader
        title="Метроном"
        action={
          <IconButton label="Настройки метронома" onClick={() => setSettings(true)}>
            <Settings2 />
          </IconButton>
        }
      />
      <MetronomePanel />
      <Drawer open={settings} onOpenChange={setSettings}>
        <DrawerContent>
          <DrawerTitle className="pb-3">Настройки метронома</DrawerTitle>
          <DrawerDescription className="sr-only">Звук клика, громкость и вспышка экрана</DrawerDescription>
          <div className="overflow-y-auto pb-4">
            <SettingsPanel />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
