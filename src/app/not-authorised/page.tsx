import type { Metadata } from "next";

export const metadata: Metadata = { title: "Access needed" };

export default function NotAuthorised() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-5">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-xl font-bold text-navy">You&apos;re not on the team list yet</h1>
        <p className="mt-3 text-sm text-muted">
          This Google account isn&apos;t set up for Pexeta Ops. Ask the VP or an admin to add your work email in
          Settings, then sign in again.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn btn-outline w-full">Sign in with a different account</button>
        </form>
      </div>
    </main>
  );
}
