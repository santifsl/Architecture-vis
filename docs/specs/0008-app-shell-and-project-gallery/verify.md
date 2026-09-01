# 0008 verify: the app shell and the personal project gallery

Hand walkthrough, per `CLAUDE.md`: a real dev server and a real browser. No test
runner, no browser automation.

Each step names the acceptance criterion it proves. Run the command and code
shape steps first, they are cheap and they catch the mistakes that make the
runtime steps meaningless.

## Before you start

- [ ] `npm run dev` boots to the home screen rather than `ConfigScreen`.
- [ ] You are signed in with a Puter account that already has **at least 13
      projects**, so the paging cap is a real state rather than a theoretical
      one. If you do not, make them: paging is the one thing here you cannot
      check with three.
- [ ] At least one of those projects has a render still `pending` or `running`,
      and at least one has `failed` or `stalled`. Start one and navigate away to
      get the first.

## Commands and code shape

- [ ] `npm run verify` passes clean: typecheck, lint, format, contrast, build.
- [ ] `grep -rn "updateProject\|createProject\|putProject" app/gallery/ app/shell/`
      returns nothing. The gallery is read only and this is the cheapest proof,
      **AC-14**.
- [ ] `grep -rn "claim\|useGenerate\|startRender" app/gallery/ app/shell/` returns
      nothing. The gallery never drives a render, **AC-4**.
- [ ] `grep -rn "STATE_WORDS" app/` shows exactly one definition, imported by
      both the card and `RenderPlate.tsx`. Two definitions means the plate and
      the card can drift on a word, **AC-4**.
- [ ] `grep -rn "\.status" app/gallery/` returns nothing that feeds a state
      word. The card must go through `renderView`. Reading the stored status is
      the defect this spec was corrected for: `stalled` is not in
      `RENDER_STATUSES`, so a card doing that shows `Working` forever on an
      abandoned render, **AC-4**.
- [ ] `grep -rn "resolveAuthState" app/routes/home.tsx` returns nothing. The
      home loader calls `listProjects` unconditionally and lets the `signedOut`
      failure be the marker, **AC-11**.
- [ ] `grep -rn "getReadURL\|readStoredUrl" app/gallery/` returns nothing: the
      card mints only through `useStoredUrl`, so the cache and the sign out
      purge still apply, **AC-6**.
- [ ] No `clientLoader` in `app/routes/projects.tsx` or `app/routes/home.tsx`
      throws. Both return the store result as data, **AC-9**.

## The navbar

- [ ] Signed out, the navbar shows the wordmark and a sign in control, and **no**
      `Projects` link, **AC-1**.
- [ ] Signed in, the `Projects` link appears and goes to `/projects`, **AC-1**.
- [ ] The wordmark returns to `/` from a project page, **AC-1**.
- [ ] The navbar is present on `/`, `/projects` and `/project/:id`, **AC-1**.
- [ ] Tab through the navbar. Every link takes focus in order and shows a
      visible focus ring, per spec 0004's state matrix.

## The grid at /projects

- [ ] Projects are newest first. Check the top card against the most recently
      created project, **AC-2**.
- [ ] Count the cards in the DOM on arrival: exactly 12, not 13 and not all of
      them. Use the elements panel, not your eyes, **AC-6**.
- [ ] Open the network panel, then press `Show more`. Exactly 12 more cards
      appear and new URL mints fire only now. Mints firing for card 13 before
      you pressed it means the cap is a display cap, which is the failure this
      step exists for, **AC-6**.
- [ ] Press `Show more` until it disappears. It goes at the end rather than
      staying and doing nothing, **AC-6**.
- [ ] A finished card shows the render as its square image, the name, the date,
      and a small floor plan thumbnail on the meta line, **AC-3**.
- [ ] The card square holds its shape before any image arrives, and is the same
      1 to 1 frame the project page uses. Nothing on the grid shifts as images
      land, **AC-3**, **AC-4**.
- [ ] Click anywhere on a card, including the thumbnail and the date. It opens
      that project, **AC-5**.
- [ ] Tab through the grid. Each card takes focus exactly **once**. Two stops on
      one card means something else in there is interactive, **AC-5**.

## Unfinished, failed, and missing

- [ ] The card for the running project shows `Working` in its square with the
      busy treatment, and the square is the same size as a finished card's.
      Nothing on the page shifts while you watch, **AC-4**.
- [ ] Leave that card on screen for a minute. It does **not** update, and no
      render request is made in the network panel. That is the decision, not a
      bug, **AC-4**.
- [ ] Open that project in a second tab and confirm it is still the only place
      the render is driven, and that it completes normally. The gallery did not
      steal or break the claim, **AC-4**.
- [ ] The failed or stalled project shows `Didn't finish` or `Stopped` rather
      than a broken image, **AC-4**.
- [ ] **The stale render check.** Hand edit a project in `puter.kv` so its render
      is `running` with a `startedAt` more than ten minutes ago. Its card must
      read `Stopped`, not `Working`, and must agree with what `/project/:id`
      shows for the same project. This is the single most important step on this
      page: it is the defect the cross check caught in the first draft, and a
      card reading the stored status passes every other step here, **AC-4**.
- [ ] Delete a render file in Puter underneath a card, reload, and confirm that
      card shows a plain placeholder, contains **no** button, and still opens the
      project. Then confirm the project page offers the real retry, **AC-12**.

## Empty, failure, and signed out

- [ ] With a fresh account that has no projects, `/projects` shows a plain empty
      state and a link back to the upload card, not an empty grid, **AC-8**.
- [ ] Go offline in devtools and reload `/projects`. You get the store's own
      sentence, not a raw exception and not an error page. The header and the
      sign in control are still there, **AC-9**.
- [ ] Press the retry on that failure with the network restored. The grid fills
      in without a manual reload, **AC-9**.
- [ ] Sign out while on `/projects`. The sign in prompt renders at the same URL
      and no project is listed, **AC-10**.
- [ ] Sign back in from that prompt. The grid appears with no manual reload.
      This is the revalidation path in `useAuthEvents`, **AC-13**.

## Skipped records

- [ ] Write a version 1 record into your own `puter.kv` by hand, reload
      `/projects`, and confirm a quiet `type-meta` line under the grid says a
      project was made with a different version and cannot be shown. Confirm it
      is a line, not a notice box, and that the rest of the grid is unaffected,
      **AC-7**.
- [ ] Remove that record and confirm the line disappears, **AC-7**.
- [ ] With an account whose records are **all** version 1, confirm `/projects`
      shows the empty state and the unreadable line together, so the empty
      gallery has a visible cause, **AC-7**, **AC-8**.
- [ ] On that same account, confirm home shows the unreadable line where the
      strip would have been, rather than silently showing nothing, **AC-7**.

## The home strip

- [ ] Signed in with projects, home shows `Recent projects` under the upload
      card with at most 3 cards and a `See all` link, **AC-11**.
- [ ] `See all` goes to `/projects`, **AC-11**.
- [ ] Signed out, the section is absent entirely, and the hero and upload card
      are exactly as they were before this feature, **AC-11**. Confirm in the
      network panel that loading home signed out makes **no** Puter request for
      the list and raises no sign in popup, **AC-11**.
- [ ] With a fresh account that has no projects, the section is absent rather
      than an empty heading, **AC-11**.
- [ ] The upload card still holds a picked file across the sign in popup. The
      strip appearing above or below it must not have remounted it. This is
      spec 0005's AC-11 and the one regression this feature could cause.

## Accessibility and look

- [ ] Every card image has meaningful `alt` text naming its project. The plan
      thumbnail is decorative and carries an empty `alt`, since the card already
      names the project.
- [ ] The grid is one column on a narrow phone, and readable at 320px wide with
      no horizontal scrolling.
- [ ] Nothing on either surface uses the clay accent except the `Show more`
      control, the links, and focus rings. No card gets a tinted frame, per
      feature 4.
- [ ] `npm run verify`'s contrast check still passes with the new screens in it.
