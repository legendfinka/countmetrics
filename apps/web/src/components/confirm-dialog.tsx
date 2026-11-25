import { useEffect, useId, useRef } from "react";
import { Button } from "./ui/button";

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** The text of the button that does the action, like "Delete" */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks "are you sure?". Show it only while you need an answer.
 * It uses the browser's <dialog>, which keeps the focus inside and closes with Esc.
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      // A click on the dark background hits the dialog itself, not the box inside
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p id={messageId} className="mt-2 break-words text-sm text-muted">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          {/* First, so it gets the focus. Enter then does nothing dangerous. */}
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
