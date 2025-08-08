import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return <div className="p-8 text-center text-sm">Unauthorized</div>;
  }
  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, createdAt: true }
  });
  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link href="/dashboard" className="text-fuchsia-400 underline text-sm">New Generation</Link>
      </div>
      <table className="w-full text-sm border border-gray-800">
        <thead className="bg-gray-800">
          <tr className="text-left">
            <th className="p-2">Name</th>
            <th className="p-2">Status</th>
            <th className="p-2">Created</th>
            <th className="p-2">Open</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} className="border-t border-gray-800 hover:bg-gray-800/40">
              <td className="p-2">{p.name}</td>
              <td className="p-2 lowercase">{p.status}</td>
              <td className="p-2">{new Date(p.createdAt).toLocaleString()}</td>
              <td className="p-2"><Link href={`/dashboard?project=${p.id}`} className="text-fuchsia-400 underline">Open</Link></td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr><td colSpan={4} className="p-4 text-center text-gray-500">No projects yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
