import { Info } from "lucide-react";

const infoText =
  "We'll match you with other Google Play Store app founders who have the same requirement";

export function GooglePlayClosedTestOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="field field--checkbox field--google-play-closed-test">
      <div className="google-play-closed-test__row">
        <label className="checkbox-row google-play-closed-test__label">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>I need users to test my app consecutively for 14 days to meet Google Play&apos;s developer requirements</span>
        </label>
        <span className="google-play-closed-test__info-wrap">
          <button
            type="button"
            className="google-play-closed-test__info"
            aria-label="More information about Google Play closed-test matching"
            aria-describedby="google-play-closed-test-tooltip"
          >
            <Info size={14} aria-hidden="true" />
          </button>
          <span
            id="google-play-closed-test-tooltip"
            role="tooltip"
            className="google-play-closed-test__tooltip"
          >
            {infoText}
          </span>
        </span>
      </div>
    </div>
  );
}
