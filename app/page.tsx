import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="px-6 pt-24 pb-32 max-w-7xl mx-auto">
      {/* Hero */}
      <section className="text-center space-y-8">
        <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent inline-block animate-[pulse_6s_ease-in-out_infinite]">
            Ship Ideas Faster
          </span>
        </h1>
        <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
          Transform natural language prompts into full-stack Next.js apps. Local,
          private, blazing fast. Own your code & infrastructure.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 px-8 py-4 rounded-lg font-semibold shadow-lg shadow-fuchsia-600/30 transition"
          >
            <span>Launch Dashboard</span>
            <span className="opacity-0 -translate-x-2 group-hover:translate-x-0 group-hover:opacity-100 transition">
              →
            </span>
          </Link>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-8 py-4 rounded-lg font-semibold transition"
          >
            Get Started
          </Link>
        </div>
        <div className="text-xs uppercase tracking-widest text-gray-500 pt-4">
          Powered by local LLMs (Ollama)
        </div>
      </section>

      {/* Features */}
      <section className="mt-28 grid md:grid-cols-3 gap-10">
        { [
          {
            title: 'End-to-End',
            desc: 'Prompt to running Next.js app with routes, components, and API endpoints.',
          },
          {
            title: 'Local & Private',
            desc: 'All generation happens against your local Ollama model.',
          },
          {
            title: 'Blueprint JSON',
            desc: 'Deterministic schema-validated blueprint drives scaffolding.',
          },
          {
            title: 'Preview Fast',
            desc: 'Inline iframe preview of generated index with raw file viewer.',
          },
          {
            title: 'Extendable',
            desc: 'Handlebars templates and utils make customizing output simple.',
          },
          {
            title: 'Own Your Stack',
            desc: 'Deploy anywhere. Swap models, databases, rate limiters.',
          },
        ].map(f => (
          <div
            key={f.title}
            className="p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur hover:border-fuchsia-400/40 transition group"
          >
            <h3 className="font-semibold mb-2 text-fuchsia-300 group-hover:text-fuchsia-200">
              {f.title}
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              {f.desc}
            </p>
          </div>
        )) }
      </section>

      {/* CTA */}
      <section className="mt-32 text-center space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold">
          From idea to repo in minutes
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Sign up, describe your vision, iterate instantly with private local
          inference. No vendor lock-in, no data leakage.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/auth/register"
            className="bg-fuchsia-600 hover:bg-fuchsia-500 px-8 py-4 rounded-lg font-semibold transition"
          >
            Create Account
          </Link>
          <Link
            href="/dashboard"
            className="bg-gray-800 hover:bg-gray-700 px-8 py-4 rounded-lg font-semibold transition"
          >
            Try Now
          </Link>
        </div>
      </section>
    </main>
  );
}
