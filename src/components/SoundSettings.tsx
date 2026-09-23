import { SwitchRow } from "@/components/ui/panel-section";
import { Slider } from "@/components/ui/slider";
import { cue, setSoundEnabled, setSoundVolume, useSoundPrefs } from "@/lib/sound";

export function SoundSettings() {
  const { enabled, volume } = useSoundPrefs();

  return (
    <>
      <SwitchRow
        label="Interface sounds"
        tooltip="Short cues for hover, clicks, toggles and connection events. Audio only plays in this window."
        checked={enabled}
        onCheckedChange={setSoundEnabled}
      />

      <div className="flex flex-col gap-2 rounded-[35px] bg-black/15 px-3 py-2.5 ring-1 ring-white/[0.04] light:bg-black/[0.03] light:ring-black/[0.05]">
        <div className="flex items-center justify-between text-[11px] font-medium text-foreground/80">
          <span>Volume</span>
          <span className="tabular-nums text-muted-foreground">
            {Math.round(volume * 100)}%
          </span>
        </div>
        <Slider
          value={[volume]}
          min={0}
          max={1}
          step={0.01}
          disabled={!enabled}
          aria-label="Sound volume"
          onValueChange={([v]) => setSoundVolume(v)}
          onValueCommit={() => cue("release")}
        />
      </div>
    </>
  );
}
