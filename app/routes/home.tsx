import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Roomify" },
    {
      name: "description",
      content: "Turn a 2D floor plan into a photorealistic 3D render.",
    },
  ];
}

export default function Home() {
  // A placeholder until feature 5 (Upload) and feature 7 (App shell & gallery)
  // build the real home screen. Feature 1 only needs a page for the root
  // layout's auth chrome to sit above.
  return (
    <main className="px-6 py-16">
      <h1 className="text-2xl font-medium tracking-tight text-ink">Roomify</h1>
      <p className="mt-2 text-sm text-ink">
        Upload a floor plan and get a photorealistic render back.
      </p>
    </main>
  );
}
