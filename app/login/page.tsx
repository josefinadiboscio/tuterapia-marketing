export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; falta?: string }>;
}) {
  const { error, falta } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold">Tu Terapia · Marketing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Acceso restringido.
        </p>
      </div>

      {falta ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Falta configurar <code>DASHBOARD_PASSWORD</code> en Vercel.
        </p>
      ) : null}

      <form action="/api/login" method="post" className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Contraseña"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Entrar
        </button>
        {error ? (
          <p className="text-sm text-red-600">Contraseña incorrecta.</p>
        ) : null}
      </form>
    </main>
  );
}
