import type { Metadata } from "next";
import Image from "next/image";
import GoogleButton from "./GoogleButton";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-5">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        <Image src="/pexeta-logo.png" alt="Pexeta" width={140} height={50} className="mx-auto h-10 w-auto" priority />
        <div className="eyebrow mt-6">Ops · Task tracker</div>
        <h1 className="mt-2 text-2xl font-bold text-navy">Good delivery is visible</h1>
        <p className="mt-2 text-sm text-muted">Sign in with your Pexeta Google account.</p>
        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Sign-in didn&apos;t complete. Try again.</p>}
        <div className="mt-6">
          <GoogleButton />
        </div>
      </div>
    </main>
  );
}
