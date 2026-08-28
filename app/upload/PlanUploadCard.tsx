/**
 * The upload card. Spec 0005, build tasks 6 and 7.
 *
 * Structure is fixed by scope.md feature 4: icon, heading, file type note, drop
 * zone, hairline border, no decorative background. Type, spacing, colour and
 * the busy treatment come from spec 0004, so nothing here states a size, a
 * weight, or a colour of its own.
 *
 * The real `<input type="file">` is the control, not a decorative div with a
 * click handler (AC-12). It is visually hidden but focusable, and the label
 * wrapping it is what a pointer clicks, so the keyboard path and the mouse path
 * are the same control rather than two implementations that can drift. Drag and
 * drop is layered on top and is never the only way in.
 */
import { useCallback, useEffect, useId, useState } from "react";
import type { CSSProperties, DragEvent } from "react";

import { ALLOWED_TYPES } from "~/upload/plan";
import { readPlanUrl } from "~/upload/store";
import { usePlanUpload, type UploadPhase } from "~/upload/usePlanUpload";

const ACCEPT = ALLOWED_TYPES.join(",");

/**
 * A room outline with a door swing.
 *
 * Deliberately not a cloud with an arrow. This app's subject is architectural
 * drawing, and the generic upload glyph is the same mark every upload control
 * on the internet uses. The heading carries the instruction, so the icon is
 * free to say what the thing is instead of what the control does.
 */
function PlanMark() {
  return (
    <svg
      className="plan-mark"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 5.5h24v21H4z" />
      <path d="M4 15h9M19 15h9" />
      <path d="M13 26.5v-6" />
      <path d="M13 20.5a6 6 0 0 1 6 6" />
    </svg>
  );
}

/**
 * The stored plan, loaded from a freshly minted URL so it proves the round trip.
 *
 * The caller gives this a `key` of the path, so a replaced plan remounts and
 * React discards the previous URL for us. Resetting that state inside the
 * effect instead would be a synchronous `setState` in an effect body, which
 * causes a second render pass before paint and which the lint rules reject on
 * exactly those grounds. A `key` is the cheaper and more honest way to say
 * "this is a different image now".
 */
function PlanPreview({
  path,
  filename,
}: {
  readonly path: string;
  readonly filename: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;

    void readPlanUrl(path).then((result) => {
      if (!current) return;
      if (result.ok) setUrl(result.value);
      else setFailed(true);
    });

    return () => {
      current = false;
    };
  }, [path]);

  if (failed) {
    return (
      <p className="mt-4 type-body text-ink">
        Your floor plan is saved, but it can&rsquo;t be shown right now.
      </p>
    );
  }

  if (url === null) return null;

  return <img className="plan-preview mt-4" src={url} alt={filename} />;
}

/** What the middle of the card says, per phase. */
function PhaseBody({ phase }: { readonly phase: UploadPhase }) {
  if (phase.kind === "hosted") {
    return (
      <>
        <PlanPreview
          key={phase.plan.path}
          path={phase.plan.path}
          filename={phase.filename}
        />
        <p className="mt-3 type-meta text-ink-soft">{phase.filename}</p>
      </>
    );
  }

  if (phase.kind === "uploading") {
    return (
      <div className="mt-6 w-full">
        <div
          className="plan-progress"
          role="progressbar"
          aria-label="Uploading your floor plan"
          aria-valuenow={Math.round(phase.fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="plan-progress-bar"
            style={{ "--fraction": phase.fraction } as CSSProperties}
          />
        </div>
      </div>
    );
  }

  return null;
}

export function PlanUploadCard() {
  const { phase, notice, pick, busy } = usePlanUpload();
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const take = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file !== undefined) pick(file);
    },
    [pick],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (busy) return;
      take(event.dataTransfer.files);
    },
    [busy, take],
  );

  const label =
    phase.kind === "hosted"
      ? "Replace floor plan"
      : phase.kind === "uploading"
        ? "Uploading"
        : phase.kind === "held"
          ? "Waiting for Puter"
          : "Choose a floor plan";

  return (
    <section aria-labelledby={`${inputId}-heading`}>
      <div
        className="plan-card"
        data-dragging={dragging ? "true" : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        {phase.kind !== "hosted" && <PlanMark />}

        <h2 id={`${inputId}-heading`} className="mt-4 type-heading text-ink">
          {phase.kind === "hosted"
            ? "Your floor plan"
            : "Drop your floor plan here"}
        </h2>

        <p className="mt-2 type-meta text-ink-soft">
          PNG, JPEG or WebP, up to 10 MB
        </p>

        <PhaseBody phase={phase} />

        {/*
         * The label is the clickable surface and the input is the real control.
         * The input is positioned rather than `display: none` so it stays in the
         * tab order and keeps its own focus ring, which a hidden input loses.
         */}
        <label htmlFor={inputId} className="btn-accent mt-6" aria-busy={busy}>
          {label}
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              take(event.target.files);
              // Cleared so picking the same file twice in a row still fires a
              // change event, which it otherwise would not.
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {notice !== null && (
        <p className="notice" role="status">
          <svg
            className="notice-mark"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.75v4" />
            <path d="M8 11.1v.4" />
          </svg>
          {notice}
        </p>
      )}
    </section>
  );
}
