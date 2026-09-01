import { PlanUploadCard } from "~/upload/PlanUploadCard";

export function meta() {
  return [
    { title: "Roomify" },
    {
      name: "description",
      content: "Turn a 2D floor plan into a photorealistic 3D render.",
    },
  ];
}

/**
 * The home screen. Spec 0005, build task 8.
 *
 * Structure follows scope.md feature 4's reference: a headline, a subtitle, one
 * call to action, and the upload card sitting directly under the hero. No pill
 * badge, no second "watch demo" button, no decorative background. The card
 * itself is the demo, which is why it is here rather than behind a sign in.
 *
 * The card is deliberately NOT wrapped in `RequireUser` (AC-15). It renders in
 * this one position whether or not anyone is signed in, because a picked file
 * is held in its state across Puter's sign in popup, and a guard that swapped
 * it for a prompt would unmount it and silently throw that file away.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="type-display text-ink">
        Turn a floor plan into a room you can see.
      </h1>

      <p className="mt-4 max-w-prose type-body text-ink-soft">
        Upload a 2D floor plan and get a photorealistic 3D render back, seen
        from straight above with your walls where you drew them.
      </p>

      <div className="mt-12">
        <PlanUploadCard />
      </div>
    </main>
  );
}
