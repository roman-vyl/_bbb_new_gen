import { useId, useState } from "react";

export function ComponentHelpHint({ description }: { description?: string | null }) {
  const text = description?.trim();
  const popoverId = useId();
  const [open, setOpen] = useState(false);

  if (!text) {
    return null;
  }

  return (
    <span className="composer-help-hint">
      <button
        type="button"
        className="composer-help-hint__btn"
        aria-label="Component help"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open ? (
        <div
          id={popoverId}
          className="composer-help-hint__popover"
          role="dialog"
          aria-label="Component help"
        >
          <button
            type="button"
            className="composer-help-hint__close"
            aria-label="Close help"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <div className="composer-help-hint__body">{text}</div>
        </div>
      ) : null}
    </span>
  );
}
