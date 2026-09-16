export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; falta?: string }>;
}) {
  const { error, falta } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-medium">Tu Terapia · Marketing</h1>
        <p className="mt-1 text-sm text-sec">
          Acceso restringido.
        </p>
      </div>

      {falta ? (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
          Falta configurar DASHBOARD_PASSWORD en Vercel.
        </p>
      ) : null}

      <form action="/api/login" method="post" className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Contraseña"
          className="rounded-md border border-borde px-3 py-2 text-sm outline-none focus:border-acento"
        />
        <button
          type="submit"
          className="rounded-md bg-acento px-3 py-2 text-sm text-bg"
        >
          Entrar
        </button>
        {error ? (
          <p className="text-sm text-danger">Contraseña incorrecta.</p>
        ) : null}
      </form>
    </main>
  );
}
