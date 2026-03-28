import { FeedbackRatingValue } from "../types";

const faces: Array<{ value: FeedbackRatingValue; label: string; icon: string }> = [
  { value: "frowny", label: "Low value", icon: "☹" },
  { value: "neutral", label: "Okay", icon: "◔" },
  { value: "smiley", label: "Helpful", icon: "☺" },
];

export function ReactionFaces({
  value,
  onChange,
  readOnly = false,
}: {
  value?: FeedbackRatingValue;
  onChange?: (value: FeedbackRatingValue) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="reaction-faces" role="radiogroup" aria-label="Feedback rating">
      {faces.map((face) => (
        <button
          key={face.value}
          type="button"
          className={`reaction-face${value === face.value ? " reaction-face--active" : ""}`}
          onClick={() => onChange?.(face.value)}
          disabled={readOnly}
          aria-pressed={value === face.value}
        >
          <span className="reaction-face__icon" aria-hidden="true">
            {face.icon}
          </span>
          <span>{face.label}</span>
        </button>
      ))}
    </div>
  );
}