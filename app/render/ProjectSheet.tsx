/**
 * The project page. Spec 0006, and spec 0007 for the shape it has now.
 *
 * Composed as a drawing sheet, which is where the hierarchy comes from: a title
 * block, then the floor plan as the KEY, small and to one side, then the plate.
 * The plan is what you refer back to, not what you came to look at, so it is
 * sized like a key rather than like a hero image.
 *
 * The plan is on the sheet exactly once, in one of three places, and which one
 * is a single decision about the whole sheet rather than three components each
 * testing their own condition. `planPlacement` is that decision (spec 0009,
 * AC-5): while a render works the plate holds the drawing itself, blurred; once
 * one is complete the comparison holds it; otherwise the small key does. Written
 * as three independent checks, a sheet with one render working and another
 * complete would show a blurred plan and a sharp one at the same time.
 */
import { RenderComparison } from "~/compare/RenderComparison";
import type { Project } from "~/projects/record";
import { RenderPlate } from "~/render/RenderPlate";
import { planPlacement, plateView } from "~/render/rules";
import { useProjectRenders } from "~/render/useProjectRenders";
import { useStoredUrl } from "~/storage/useStoredUrl";

function FloorPlanKey({ project }: { readonly project: Project }) {
  const { url, failed, retry } = useStoredUrl(project.floorPlan.path);

  return (
    <div>
      <h2 className="type-meta text-ink-soft">Floor plan</h2>
      {failed ? (
        <>
          <p className="mt-2 type-body text-ink">
            Your floor plan is saved, but it can&rsquo;t be shown right now.
          </p>
          <button type="button" className="btn-quiet mt-1" onClick={retry}>
            Try showing it again
          </button>
        </>
      ) : (
        url !== null && (
          <img
            className="plan-key mt-2"
            src={url}
            alt={`The floor plan for ${project.name}`}
          />
        )
      )}
    </div>
  );
}

export function ProjectSheet({ loaded }: { readonly loaded: Project }) {
  const { project, retry, blocked } = useProjectRenders(loaded);

  /*
   * Every render on the sheet, which spec 0007 left at one, paired with what its
   * plate is showing. Resolved once, here, because both the plan's placement and
   * each plate's own comparison read the same view, and asking twice is how the
   * two would eventually disagree. It stays the right shape if a second model
   * ever comes back through the seam spec 0007 left open.
   */
  const plates = project.models.flatMap((model) => {
    const render = project.renders[model];
    return render === undefined
      ? []
      : [
          {
            model,
            render,
            view: plateView(render, blocked[model] !== undefined),
          },
        ];
  });

  const placement = planPlacement(plates.map((plate) => plate.view));

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="border-b border-hairline pb-6">
        <h1 className="type-display text-ink">{project.name}</h1>
        <p className="mt-2 type-meta text-ink-soft">Private</p>
      </div>

      {placement === "key" && (
        <div className="mt-12">
          <FloorPlanKey project={project} />
        </div>
      )}

      <div className="mt-16 grid gap-12">
        {plates.map(({ model, render, view }) => (
          <div key={model}>
            <RenderPlate
              model={model}
              render={render}
              planPath={project.floorPlan.path}
              blocked={blocked[model]}
              onRetry={retry}
            />

            {/*
              The comparison sits under its own plate, and only when the sheet
              has handed the plan to it. `render.path` is checked as well as the
              view because `RenderState.path` is typed `string | null` and
              `complete` does not narrow it, which is the same double guard the
              plate applies before showing its image.
            */}
            {placement === "comparison" &&
              view === "complete" &&
              render.path !== null && (
                <RenderComparison
                  planPath={project.floorPlan.path}
                  renderPath={render.path}
                  projectName={project.name}
                />
              )}
          </div>
        ))}
      </div>

      <p className="mt-16 max-w-prose type-body text-ink-soft">
        Gemini rendered this directly from your floor plan.
      </p>
    </main>
  );
}
