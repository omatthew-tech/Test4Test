import { useRef, type KeyboardEvent } from "react";
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
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = faces.findIndex((face) => face.value === value);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % faces.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + faces.length) % faces.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? faces.length - 1
              : null;
    if (nextIndex === null || readOnly) return;
    event.preventDefault();
    onChange?.(faces[nextIndex].value);
    refs.current[nextIndex]?.focus();
  };

  return (
    <div className="reaction-faces" role="radiogroup" aria-label="Feedback rating">
      {faces.map((face, index) => (
        <button
          key={face.value}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="radio"
          className={`reaction-face${value === face.value ? " reaction-face--active" : ""}`}
          onClick={() => onChange?.(face.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          disabled={readOnly}
          aria-checked={value === face.value}
          tabIndex={selectedIndex < 0 ? (index === 0 ? 0 : -1) : index === selectedIndex ? 0 : -1}
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
