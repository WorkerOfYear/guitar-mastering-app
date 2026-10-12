import { Segmented } from "@/components/ui";
import { useSettings } from "@/store/settings";

/** Таб / Ноты / Ноты + таб — remembered for all tab players. Kept apart from TabPlayer so it doesn't pull alphaTab in. */
export function TabViewSwitch() {
  const { tabView, setTabView } = useSettings();
  return (
    <Segmented
      size="sm"
      value={tabView}
      onChange={setTabView}
      options={[
        { value: "tab", label: "Таб" },
        { value: "score", label: "Ноты" },
        { value: "both", label: "Ноты + таб" },
      ]}
    />
  );
}
