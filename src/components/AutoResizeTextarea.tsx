import { TextareaHTMLAttributes, useLayoutEffect, useRef } from "react";

type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

function resizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }

  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

export function AutoResizeTextarea(props: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      onInput={(event) => {
        resizeTextarea(event.currentTarget);
        props.onInput?.(event);
      }}
    />
  );
}
