import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./timeline-range.module.css";

export interface TimelineRangeProps {
  label: string;
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number, handle: "start" | "end") => void;
  disabled?: boolean;
  step?: number;
}

export function formatMediaTime(seconds: number) {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${String(Math.floor((tenths % 600) / 10)).padStart(2, "0")}.${tenths % 10}`;
}

/** Two independently focusable handles. Runtime percentages describe media geometry. */
export function TimelineRange({
  label,
  duration,
  start,
  end,
  onChange,
  disabled = false,
  step = 0.1,
}: TimelineRangeProps) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; handle: "start" | "end" } | null>(null);
  const usable = Number.isFinite(duration) && duration >= step && step > 0;
  const locked = disabled || !usable;
  const update = (handle: "start" | "end", value: number) => {
    if (locked) return;
    const rounded = Math.round(value / step) * step;
    if (handle === "start")
      onChange(Number(Math.max(0, Math.min(end - step, rounded)).toFixed(4)), end, handle);
    else
      onChange(
        start,
        Number(Math.min(duration, Math.max(start + step, rounded)).toFixed(4)),
        handle,
      );
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointer !== event.pointerId || !track.current) return;
    const bounds = track.current.getBoundingClientRect();
    if (bounds.width)
      update(drag.current.handle, ((event.clientX - bounds.left) / bounds.width) * duration);
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>, handle: "start" | "end") => {
    const current = handle === "start" ? start : end;
    const increment = event.shiftKey ? step * 10 : step;
    const values: Record<string, number> = {
      ArrowLeft: current - increment,
      ArrowDown: current - increment,
      ArrowRight: current + increment,
      ArrowUp: current + increment,
      PageDown: current - 10,
      PageUp: current + 10,
      Home: handle === "start" ? 0 : start + step,
      End: handle === "start" ? end - step : duration,
    };
    if (event.key in values) {
      event.preventDefault();
      update(handle, values[event.key]);
    }
  };
  return (
    <div className={styles.root} role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className={styles.label}>
        {label}
      </span>
      <div className={styles.timeline}>
        <div className={styles.track} ref={track}>
          <div
            className={styles.selection}
            aria-hidden="true"
            // ds-exception: runtime-measurements
            style={{
              left: `${usable ? (start / duration) * 100 : 0}%`,
              width: `${usable ? ((end - start) / duration) * 100 : 0}%`,
            }}
          />
          {(["start", "end"] as const).map((handle) => (
            <button
              key={handle}
              type="button"
              role="slider"
              className={`${styles.handle} ${handle === "end" ? styles.end : styles.start}`}
              // ds-exception: runtime-measurements
              style={{
                left: `${usable ? ((handle === "start" ? start : end) / duration) * 100 : 0}%`,
              }}
              disabled={locked}
              aria-label={handle === "start" ? "Clip start" : "Clip end"}
              aria-valuemin={handle === "start" ? 0 : start + step}
              aria-valuemax={handle === "start" ? Math.max(0, end - step) : duration}
              aria-valuenow={handle === "start" ? start : end}
              aria-valuetext={formatMediaTime(handle === "start" ? start : end)}
              aria-describedby={`${id}-help`}
              onKeyDown={(event) => key(event, handle)}
              onPointerDown={(event) => {
                if (event.button !== 0 || locked) return;
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { pointer: event.pointerId, handle };
              }}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <div className={styles.times}>
        <span>Start {formatMediaTime(start)}</span>
        <span>End {formatMediaTime(end)}</span>
      </div>
      <p id={`${id}-help`} className={styles.help}>
        Drag the handles or use the arrow keys to adjust the clip.
      </p>
    </div>
  );
}
