"use client";
import { signOut } from 'next-auth/react';

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 transition"
    >
      Logout
    </button>
  );
}
