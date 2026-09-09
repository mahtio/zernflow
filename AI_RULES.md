# AI_RULES.md

## Tech Stack

- **Framework:** Next.js 16 with the App Router and Turbopack; routes, layouts, metadata, and API handlers live under `app/`.
- **Language and UI:** TypeScript in strict mode with React 19; use Server Components by default and Client Components only when browser APIs or interactive state are required.
- **Styling:** Tailwind CSS 4 via PostCSS, with `clsx` and `tailwind-merge` exposed through `lib/utils.ts` as `cn()`.
- **Backend services:** Supabase provides PostgreSQL, authentication, and realtime features through `@supabase/supabase-js` and `@supabase/ssr`.
- **Messaging integrations:** Zernio and `@zernio/node` handle social-platform OAuth, token management, and cross-platform messaging.
- **Flow editor:** `@xyflow/react` powers the visual automation canvas, nodes, handles, and edges.
- **AI features:** Vercel AI SDK (`ai`) is the standard integration layer for model and AI Gateway calls.
- **Icons:** `lucide-react` supplies general interface icons; `@icons-pack/react-simple-icons` supplies platform and brand icons.
- **Quality tooling:** ESLint with the Next.js configuration enforces code quality, and Vitest is used for automated tests.

## Library and Implementation Rules

- Use the **Next.js App Router** for all navigation and routing. Add pages as `app/**/page.tsx`, layouts as `layout.tsx`, and HTTP endpoints as `app/api/**/route.ts`; do not add React Router.
- Keep components as **Server Components** unless they need hooks, event handlers, local state, realtime subscriptions, or browser-only APIs. Add `"use client"` only to the smallest necessary boundary.
- Use **Tailwind CSS utilities** for layout and visual styling. Use `cn()` from `@/lib/utils` for conditional or merged class names; do not introduce CSS-in-JS or another styling framework.
- Reuse existing shared components from `components/` before creating new ones. Put feature-specific UI in the matching feature directory and keep reusable primitives focused and composable.
- Use **Lucide** for ordinary UI icons and **Simple Icons** only for recognizable third-party brand marks. Do not hand-code icon SVGs when either library provides the icon.
- Access Supabase only through the existing helpers in `lib/supabase/`. Use the browser client in Client Components and the server client in Server Components, Server Actions, and Route Handlers. Never expose service-role credentials to client code.
- Use `@xyflow/react` for flow-canvas behavior and keep execution/business logic in `lib/flow-engine/`; do not couple workflow execution to canvas components.
- Use the **Vercel AI SDK** for AI generation and streaming. Keep model credentials and model calls on the server, and do not call model-provider APIs directly from the browser.
- Use the existing Zernio client and platform adapters for social messaging. Do not duplicate OAuth, token refresh, rate-limit, or platform-normalization logic.
- Use the `@/*` path alias for project imports. Add or update **Vitest** tests for non-trivial logic in `lib/`, especially flow execution, message processing, and platform adapters.
