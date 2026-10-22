"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, ListChecks, ClipboardList, Settings, Menu, X, LogOut } from "lucide-react";
import type { Member } from "@/lib/types";

const ROLE_LABEL = { vp: "Vice President", admin: "Admin", member: "Team member" } as const;

export default function Sidebar({ member }: { member: Member }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const manager = member.role === "vp" || member.role === "admin";
  const links = [
    { href: "/dashboard", label: manager ? "VP dashboard" : "Dashboard", icon: LayoutDashboard },
    { href: "/my-work", label: "My work", icon: ListChecks },
    { href: "/tasks", label: "Task register", icon: ClipboardList },
    ...(manager ? [{ href: "/settings", label: "Settings", icon: Settings }] : []),
  ];

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-5 py-5">
        <div className="inline-block rounded-md bg-white px-2.5 py-1.5">
          <Image src="/pexeta-logo.png" alt="Pexeta" width={110} height={39} className="h-7 w-auto" priority />
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber">Ops · Tasks</div>
      </div>
      <div className="flex-1 space-y-1 px-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== "/dashboard" && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={17} className={active ? "text-amber" : ""} />
              {label}
            </Link>
          );
        })}
      </div>
      <div className="border-t border-white/10 px-5 py-4">
        <div className="text-sm font-semibold text-white">{member.full_name}</div>
        <div className="text-xs text-slate-400">{ROLE_LABEL[member.role]}</div>
        <form action="/auth/signout" method="post">
          <button className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-navy lg:block">{nav}</aside>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-navy px-4 lg:hidden">
        <span className="text-sm font-bold text-white">Pexeta Ops</span>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-white">
          <Menu size={22} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-navy">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 text-white">
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
