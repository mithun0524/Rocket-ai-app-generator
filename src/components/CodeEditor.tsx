"use client";
import { useCallback } from 'react';
import Editor, { OnChange, BeforeMount } from '@monaco-editor/react';

interface CodeEditorProps {
  path: string;
  language?: string;
  value: string;
  onChange: (val: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export default function CodeEditor({ path, language, value, onChange, onSave, readOnly }: CodeEditorProps) {
  const handleChange: OnChange = (val) => {
    onChange(val ?? '');
  };
  const beforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('rocket-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#000000',
      }
    });
  };
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSave?.();
    }
  }, [onSave]);
  return (
    <div className="h-full" onKeyDown={handleKeyDown}>
      <Editor
        height="100%"
        theme="rocket-dark"
        path={path}
        defaultLanguage={language || inferLanguage(path)}
        value={value}
        onChange={handleChange}
        options={{ minimap: { enabled: false }, fontSize: 13, readOnly }}
      />
    </div>
  );
}

function inferLanguage(p: string | undefined) {
  if (!p) return 'typescript';
  if (p.endsWith('.ts') || p.endsWith('.tsx')) return 'typescript';
  if (p.endsWith('.js') || p.endsWith('.jsx')) return 'javascript';
  if (p.endsWith('.json')) return 'json';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.prisma')) return 'prisma';
  return 'plaintext';
}
