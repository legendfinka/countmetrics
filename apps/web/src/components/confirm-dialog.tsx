import { useId } from "react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** The text of the button that does the action, like "Delete" */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks "are you sure?". Show it only while you need an answer. */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();

  return (
    <Dialog titleId={titleId} descriptionId={messageId} onCancel={onCancel}>
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <p id={messageId} className="mt-2 wrap-break-word text-sm text-muted">
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
    </Dialog>
  );
}
