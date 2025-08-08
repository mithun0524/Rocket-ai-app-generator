import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

function buildPreviewHTML(blueprint: any, route: string) {
  const page = (blueprint.pages || []).find((p: any) => p.route === route) || (blueprint.pages || [])[0];
  if (!page) return '<html><body><h3>No page found</h3></body></html>';
  const components = blueprint.components || [];
  const sanitize = (code: string) => {
    // drop imports & exports we will handle
    let c = code.replace(/^[ \t]*import[^\n]*\n/gm, '');
    c = c.replace(/export default function Page/,'function Page');
    c = c.replace(/export default /g,'');
    c = c.replace(/export const /g,'const ');
    c = c.replace(/export function /g,'function ');
    c = c.replace(/export class /g,'class ');
    return c;
  };
  const componentCode = components.map((c:any)=> sanitize(c.code)).join('\n\n');
  const pageCode = sanitize(page.code);
  const routes = (blueprint.pages||[]).map((p:any)=>p.route);
  return `<!DOCTYPE html><html><head><meta charset='utf-8'/><title>Preview ${route}</title><style>body{margin:0;font-family:system-ui;background:#0a0a0a;color:#eee;}#root{padding:16px;}select{background:#111;color:#eee;border:1px solid #333;padding:4px;border-radius:4px;}</style></head><body>
  <div style='position:fixed;top:8px;right:12px;z-index:10;display:flex;gap:8px;align-items:center;font-size:12px;'>
    <label style='color:#aaa;'>Route:
      <select id='routeSel'>${routes.map((r:string)=>`<option ${r===route?'selected':''}>${r}</option>`).join('')}</select>
    </label>
  </div>
  <div id='root'></div>
  <script src='https://unpkg.com/react@18/umd/react.development.js'></script>
  <script src='https://unpkg.com/react-dom@18/umd/react-dom.development.js'></script>
  <script type='module'>
    const exports = {};
    ${componentCode}
    ${pageCode}
    const RootComp = typeof Page==='function'? Page : (typeof exports.default==='function'? exports.default: ()=>React.createElement('div',null,'No component'));
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(RootComp));
    document.getElementById('routeSel').addEventListener('change', (e)=>{ const r = (e.target as HTMLSelectElement).value; const url = new URL(window.location.href); url.searchParams.set('route', r); window.location.href = url.toString(); });
  </script>
</body></html>`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');
  const route = url.searchParams.get('route') || '/';
  if (!projectId) return NextResponse.json({ error:'Missing projectId' }, { status:400 });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.blueprint) return NextResponse.json({ error:'Not found' }, { status:404 });
  let blueprint: any;
  try { blueprint = JSON.parse(project.blueprint); } catch { return NextResponse.json({ error:'Invalid blueprint JSON' }, { status:500 }); }
  const html = buildPreviewHTML(blueprint, route);
  return new Response(html, { status:200, headers: { 'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store' } });
}
