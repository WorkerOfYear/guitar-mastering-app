import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { loadSamples } from "@/audio/clicks";
import { MetronomePanel, SettingsPanel, useMetronomeKeys } from "@/components/metronome/MetronomePanel";
import { IconButton } from "@/components/ui";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/Placeholder";

export function MetronomePage() {
  const [settings, setSettings] = useState(false);
  useMetronomeKeys();
  // decode the click recordings while the page is idle, so the first click is not delayed
  useEffect(() => void loadSamples(), []);
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
