import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  /** The id of the title inside the popup */
  titleId: string;
  /** The id of the text that explains the popup */
  descriptionId: string;
  /** Called for Esc and for a click on the dark background */
  onCancel: () => void;
  children: ReactNode;
}

/**
 * The frame of our popups. Show it only while you need it.
 * It uses the browser's <dialog>, which keeps the focus inside and closes with Esc.
 */
export function Dialog({ titleId, descriptionId, onCancel, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Selecting text and letting go outside must not close the popup
  const pressedOutside = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      // The dark background is the dialog itself, not the box inside
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="p-5">{children}</div>
    </dialog>
  );
}
