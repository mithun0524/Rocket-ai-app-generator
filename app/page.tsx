import Link from 'next/link';
import AuthDashboardButton from '@/components/AuthDashboardButton';

export default function HomePage() {
  return (
    <main className="relative mx-auto max-w-7xl px-6 pt-28 pb-40">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-fuchsia-600/20 via-pink-500/10 to-cyan-400/10 blur-3xl" />
        <div className="absolute left-[10%] top-[55%] h-[28rem] w-[28rem] rounded-full bg-fuchsia-700/10 blur-3xl" />
        <div className="absolute right-[5%] top-[35%] h-[30rem] w-[30rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(250,250,255,0.08),rgba(0,0,0,0)_70%)]" />
      </div>

      {/* Hero */}
      <section className="text-center space-y-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur text-[11px] tracking-wide uppercase text-fuchsia-300/90">
          <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />{' '}
          <span>Local + Cloud LLM Orchestration</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
          <span className="bg-gradient-to-r from-fuchsia-300 via-pink-200 to-cyan-200 bg-clip-text text-transparent">
            Generate Production‑Ready
          </span>
          <br />
          <span className="relative inline-block">
            <span className="pr-3">Next.js Apps</span>
            <span className="absolute left-0 -bottom-2 h-2 w-full bg-gradient-to-r from-fuchsia-500/40 via-pink-500/40 to-cyan-400/40 blur-md" />
          </span>
        </h1>
        <p className="mx-auto max-w-3xl text-base md:text-lg leading-relaxed text-gray-300/90">
          Rocket converts natural language into a schema‑validated blueprint,
          streams file creation, previews instantly, diffs intelligently, and lets
          you iterate safely with selective rewrites.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-2">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 via-pink-600 to-indigo-600 px-8 py-4 text-sm font-semibold shadow-lg shadow-fuchsia-900/40 ring-1 ring-white/10 hover:brightness-110 transition"
          >
            <span>Open Dashboard</span>
            <svg
              className="w-4 h-4 transition-transform group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          {/* Auth-aware dashboard button */}
          <AuthDashboardButton />
        </div>
        <div className="flex flex-wrap justify-center gap-6 pt-6 text-[11px] text-gray-500 uppercase tracking-wider">
          <span>Streaming Steps</span>
          <span className="text-gray-700">•</span>
          <span>Deep Diff</span>
          <span className="text-gray-700">•</span>
          <span>Live Preview</span>
          <span className="text-gray-700">•</span>
          <span>Selective Rewrites</span>
          <span className="text-gray-700">•</span>
          <span>Run History</span>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="mt-28 grid gap-8 md:grid-cols-3">
        {[
          {
            title: 'Deterministic Blueprint',
            desc: 'Unified JSON blueprint drives generation; schema normalization guarantees structural integrity.',
          },
          {
            title: 'Provider Agnostic',
            desc: 'Switch between local Ollama models and Gemini cloud seamlessly with shared salvage + transform pipeline.',
          },
          {
            title: 'Granular Diffs',
            desc: 'Recursive structural diff highlights added / removed / changed nodes with path‑level detail.',
          },
          {
            title: 'Selective Rewrite',
            desc: 'Regenerate only chosen files or replan from an earlier step without wiping progress.',
          },
          {
            title: 'Inline Preview',
            desc: 'Sandboxed iframe assembles pages + components for rapid visual verification.',
          },
          {
            title: 'Persisted Runs',
            desc: 'Run metadata + parameters stored for auditability and reproducibility.',
          },
        ].map((f) => (
          <div
            key={f.title}
            className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[2%] p-6 backdrop-blur transition hover:border-fuchsia-400/40"
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_30%_20%,rgba(236,72,153,0.15),rgba(0,0,0,0))] transition" />
            <h3 className="relative z-10 mb-2 font-semibold text-fuchsia-300 group-hover:text-fuchsia-200">
              {f.title}
            </h3>
            <p className="relative z-10 text-sm leading-relaxed text-gray-300/90">
              {f.desc}
            </p>
          </div>
        ))}
      </section>

      {/* Workflow */}
      <section className="mt-32">
        <h2 className="text-center text-3xl md:text-4xl font-bold mb-12">
          Workflow Pipeline
        </h2>
        <ol className="relative mx-auto max-w-4xl grid gap-6 md:grid-cols-5 text-center">
          {[
            { k: 'Prompt', d: 'Describe feature scope & entities.' },
            { k: 'Parse', d: 'LLM normalizes + extracts intent.' },
            { k: 'Plan', d: 'Meta plan enumerates artifacts.' },
            { k: 'Validate', d: 'Schema coercion & shape fixing.' },
            { k: 'Write', d: 'Streamed file scaffolding + diff.' },
          ].map((s, i) => (
            <li key={s.k} className="relative flex flex-col items-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/15 text-sm font-semibold text-fuchsia-300 shadow shadow-fuchsia-900/30">
                {i + 1}
              </div>
              <div className="text-[13px] font-medium text-gray-200">
                {s.k}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-gray-400 max-w-[11rem]">
                {s.d}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Code Sample */}
      <section className="mt-32 grid gap-10 md:grid-cols-2 items-start">
        <div className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">
            Blueprint Driven Generation
          </h2>
          <p className="text-sm leading-relaxed text-gray-300/90">
            The system salvages imperfect model output, extracts a balanced JSON
            object, coerces missing arrays, then transforms into a stable internal
            blueprint. Structural diffs enable safe iterative regeneration.
          </p>
          <ul className="space-y-2 text-sm text-gray-300/80">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />{' '}
              Salvage & normalization utilities unify providers.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />{' '}
              Deep diff surfaces semantic changes rapidly.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />{' '}
              Selective rewrites avoid full regeneration churn.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />{' '}
              Run history captures params for reproducibility.
            </li>
          </ul>
          <div className="flex gap-3 pt-2">
            <Link
              href="/dashboard"
              className="rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 px-5 py-2.5 text-[13px] font-semibold shadow shadow-fuchsia-900/40"
            >
              Start Building
            <AuthDashboardButton />
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-2 rounded-xl bg-gradient-to-tr from-fuchsia-600/20 to-cyan-400/10 blur-xl" />
          <div className="relative rounded-xl border border-white/15 bg-[#0e0e12]/90 backdrop-blur p-4 text-[11px] leading-relaxed font-mono text-gray-300 overflow-hidden shadow-lg shadow-black/40">
            <div className="flex gap-2 mb-3">
              <span className="h-3 w-3 rounded-full bg-red-500/70" />
              <span className="h-3 w-3 rounded-full bg-amber-400/70" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
              <span className="ml-auto text-[10px] text-gray-500">
                blueprint.json
              </span>
            </div>
            {`{
  "pages": [
    { "route": "/", "content": "export default function Home(){return <main>Hi</main>}" }
  ],
  "components": [
    { "name": "NavBar", "content": "export default function NavBar(){return <nav/>}" }
  ],
  "apiRoutes": [
    { "route": "/api/ping", "method": "GET", "content": "export async function GET(){return Response.json({pong:true})}" }
  ],
  "schema": "model Example { id String @id }"
}`}
          </div>
        </div>
      </section>

      {/* Benefits band */}
      <section className="mt-32 rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-600/10 via-pink-600/5 to-cyan-500/10 p-10 backdrop-blur">
        <div className="grid md:grid-cols-4 gap-8 text-center">
          {[
            {
              h: 'Private First',
              t: 'Local models keep IP & data in your control.',
            },
            {
              h: 'Observable',
              t: 'SSE streaming + logs expose every step.',
            },
            {
              h: 'Composable',
              t: 'Replace providers or inject custom planners.',
            },
            {
              h: 'Future Proof',
              t: 'Schema contract isolates model variance.',
            },
          ].map((b) => (
            <div key={b.h} className="space-y-2">
              <div className="text-sm font-semibold text-fuchsia-300">
                {b.h}
              </div>
              <p className="text-[12px] text-gray-300/80 leading-relaxed">
                {b.t}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-32 text-center space-y-7">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          From Prompt to Repository in Minutes
        </h2>
        <p className="mx-auto max-w-2xl text-sm md:text-base text-gray-400 leading-relaxed">
          Describe the product. Watch the blueprint form. Inspect diffs. Preview
          the UI. Iterate with confidence.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/register"
            className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-pink-600 px-8 py-4 text-sm font-semibold shadow shadow-fuchsia-900/40 hover:brightness-110 transition"
          >
            Get Started Free
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-8 py-4 text-sm font-semibold"
          >
            Launch Now
          </Link>
        </div>
        <div className="pt-4 text-[11px] uppercase tracking-wider text-gray-600 flex items-center justify-center gap-2">
          <span>Ollama Local Runtime</span>
          <span className="text-gray-700">/</span>
          <span>Gemini Cloud Integration</span>
          <span className="text-gray-700">/</span>
          <span>Blueprint Diff Engine</span>
        </div>
      </section>
    </main>
  );
}
