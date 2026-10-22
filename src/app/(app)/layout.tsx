import Sidebar from "@/components/Sidebar";
import { getMember } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getMember();
  return (
    <div className="min-h-screen">
      <Sidebar member={member} />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
