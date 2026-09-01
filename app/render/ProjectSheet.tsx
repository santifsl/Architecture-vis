/**
 * The project page. Spec 0006, and spec 0007 for the shape it has now.
 *
 * Composed as a drawing sheet, which is where the hierarchy comes from: a title
 * block, then the floor plan as the KEY, small and to one side, then the plate.
 * The plan is what you refer back to, not what you came to look at, so it is
 * sized like a key rather than like a hero image.
 *
 * The key and the plate share the plan between them rather than both showing it.
 * While the render works, the plate holds the drawing itself, blurred, and the
 * key steps aside for exactly that period, so the plan is never on screen twice
 * at once (AC-5). `isWorkingView` is the single fact both sides read, which is
 * what keeps them from disagreeing and showing one plan or three.
 */
import type { Project } from "~/projects/record";
import { RenderPlate } from "~/render/RenderPlate";
import { isWorkingView, plateView } from "~/render/rules";
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

  // Every render on the sheet, which spec 0007 left at one. Asking whether ANY
  // of them is working is what the key steps aside for, and it stays the right
  // question if a second model ever comes back through the seam.
  const working = project.models.some((model) => {
    const render = project.renders[model];
    return (
      render !== undefined &&
      isWorkingView(plateView(render, blocked[model] !== undefined))
    );
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="border-b border-hairline pb-6">
        <h1 className="type-display text-ink">{project.name}</h1>
        <p className="mt-2 type-meta text-ink-soft">Private</p>
      </div>

      {!working && (
        <div className="mt-8">
          <FloorPlanKey project={project} />
        </div>
      )}

      <div className="mt-12 grid gap-8">
        {project.models.map((model) => {
          const render = project.renders[model];
          return render === undefined ? null : (
            <RenderPlate
              key={model}
              model={model}
              render={render}
              planPath={project.floorPlan.path}
              blocked={blocked[model]}
              onRetry={retry}
            />
          );
        })}
      </div>

      <p className="mt-12 max-w-prose type-body text-ink-soft">
        Gemini rendered this directly from your floor plan.
      </p>
    </main>
  );
}
