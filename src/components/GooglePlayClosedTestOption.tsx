import { Checkbox } from "@test4test/design-system";

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
    <Checkbox
      checked={checked}
      description={infoText}
      label="I need users to test my app consecutively for 14 days to meet Google Play's developer requirements"
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
