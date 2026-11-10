import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  FolderOpen,
  Clock,
  FileCode2,
  ChevronRight,
  ChevronDown,
  X,
  FileText,
  Github,
  Loader2,
  Smartphone,
  MonitorPlay,
  Server,
  TerminalSquare,
  Sparkles,
  Search,
  Play,
  FolderUp,
} from 'lucide-react';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useIdeStore } from '../../store/useIdeStore';
import { LanguageIcon } from '../sidebar/LanguageIcon';
import { type ProjectTemplate } from '../../lib/projectTemplates';
import { useAuthStore } from '../../store/useAuthStore';
import { createRepo, listRepos, pullRepo, type GitHubRepo } from '../../lib/githubService';
import { Capacitor } from '@capacitor/core';
import { readConfig, saveConfigNow } from '../../lib/fileSystemStorage';
import { describeGoogleAuthError } from '../../lib/googleAuthError';
import { nativeSignInWithGoogle } from '../../lib/googleAuth';
import { BottomSheet } from '../ui/BottomSheet';
import { Modal } from '../ui/Modal';

export interface ProjectLanguageInfo {
  dominantLanguage: string;
  dominantColor: string;
  languages: { language: string; extension: string; byte_count: number; color: string }[];
}

// File maps are replaced (not mutated) when content changes, so a WeakMap keeps
// language analysis off the hot render path without risking stale results.
const languageAnalysisCache = new WeakMap<object, ProjectLanguageInfo>();

export const getProjectLanguages = (projectFiles: Record<string, any> = {}): ProjectLanguageInfo => {
  if (projectFiles && typeof projectFiles === 'object') {
    const cached = languageAnalysisCache.get(projectFiles);
    if (cached) return cached;
  }
  const filesList = Object.values(projectFiles || {})
    .filter((f: any) => f && f.type === 'file')
    .map((f: any) => ({ path: f.name || '', content: f.content || '' }));

  const EXT_LANG_MAP: Record<string, { lang: string; color: string; ext: string }> = {
    rs: { lang: 'Rust', color: '#dea584', ext: 'rs' },
    ts: { lang: 'TypeScript', color: '#3178c6', ext: 'ts' },
    tsx: { lang: 'TypeScript', color: '#3178c6', ext: 'tsx' },
    js: { lang: 'JavaScript', color: '#f1e05a', ext: 'js' },
    jsx: { lang: 'JavaScript', color: '#f1e05a', ext: 'jsx' },
    py: { lang: 'Python', color: '#3572A5', ext: 'py' },
    kt: { lang: 'Kotlin', color: '#7C9B79', ext: 'kt' },
    java: { lang: 'Java', color: '#b07219', ext: 'java' },
    html: { lang: 'HTML', color: '#e34c26', ext: 'html' },
    css: { lang: 'CSS', color: '#7C9B79', ext: 'css' },
    scss: { lang: 'SCSS', color: '#c6538c', ext: 'scss' },
    json: { lang: 'JSON', color: '#cbcb41', ext: 'json' },
    c: { lang: 'C', color: '#555555', ext: 'c' },
    cpp: { lang: 'C++', color: '#f34b7d', ext: 'cpp' },
    go: { lang: 'Go', color: '#00ADD8', ext: 'go' },
    sh: { lang: 'Shell', color: '#89e051', ext: 'sh' },
    md: { lang: 'Markdown', color: '#083fa1', ext: 'md' },
  };

  const volumeMap = new Map<string, { bytes: number; lines: number; ext: string; color: string }>();

  for (const f of filesList) {
    const ext = f.path.split('.').pop()?.toLowerCase() || '';
    const info = EXT_LANG_MAP[ext];
    if (!info) continue;

    const content = f.content || '';
    const bytes = new TextEncoder().encode(content).length;
    const lines = content ? content.split('\n').length : 1;

    const existing = volumeMap.get(info.lang) || { bytes: 0, lines: 0, ext: info.ext, color: info.color };
    existing.bytes += bytes;
    existing.lines += lines;
    volumeMap.set(info.lang, existing);
  }

  const langs = Array.from(volumeMap.entries()).map(([lang, stat]) => ({
    language: lang,
    extension: stat.ext,
    byte_count: stat.bytes,
    color: stat.color,
  })).sort((a, b) => b.byte_count - a.byte_count);

  const dominant = langs[0] || { language: 'TypeScript', color: '#3178c6', extension: 'ts', byte_count: 0 };

  const result: ProjectLanguageInfo = {
    dominantLanguage: dominant.language,
    dominantColor: dominant.color,
    languages: langs,
  };
  if (projectFiles && typeof projectFiles === 'object') {
    languageAnalysisCache.set(projectFiles, result);
  }
  return result;
};

// Language-specific SVG icons (memoized for fast rendering)
const AndroidIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M17.523 15.341a1.003 1.003 0 0 0 0-2.006 1.003 1.003 0 0 0 0 2.006zm-11.046 0a1.003 1.003 0 0 0 0-2.006 1.003 1.003 0 0 0 0 2.006zm11.405-6.018l1.991-3.448a.414.414 0 0 0-.717-.414L17.16 8.928c-1.522-.694-3.23-1.081-5.06-1.081-1.83 0-3.538.387-5.06 1.081L5.045 5.461a.414.414 0 0 0-.717.414l1.991 3.448C3.369 11.184 1.498 14.334 1.498 18h21.004c0-3.666-1.871-6.816-4.82-8.677z" fill="#3DDC84"/>
  </svg>
));
const KotlinIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M2 22L12 12 22 22H2z" fill="#C711E1"/><path d="M2 2h10L2 12V2z" fill="#E44857"/><path d="M12 2L2 12l10 10h10L12 12 22 2H12z" fill="#7F52FF"/>
  </svg>
));
const ComposeIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="10" stroke="#4285F4" strokeWidth="1.5"/>
    <path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="12" cy="12" r="1.5" fill="#4285F4"/>
  </svg>
));
const HtmlIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4.136 3L5.918 20.162 11.99 22l6.082-1.838L19.864 3H4.136z" fill="#E44D26"/>
    <path d="M12 4.808v15.37l4.918-1.49L18.31 4.808H12z" fill="#F16529"/>
    <path d="M8.724 9.098L8.5 7h7l-.2 2.098H10.93l.2 2.098h5.45L16.15 17l-4.15 1.15L7.85 17l-.25-2.8h2.1l.13 1.4 2.17.58 2.17-.58.23-2.52H7.74L7.3 9.098h1.424z" fill="#fff"/>
  </svg>
));
const ReactIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="2.1" fill="#61DAFB"/>
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61DAFB" strokeWidth="1" fill="none" transform="rotate(0 12 12)"/>
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61DAFB" strokeWidth="1" fill="none" transform="rotate(60 12 12)"/>
    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#61DAFB" strokeWidth="1" fill="none" transform="rotate(120 12 12)"/>
  </svg>
));
const ViteIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M21.5 3.5l-9 18.5L3 3.5l9 2.5 9.5-2.5z" fill="#BD34FE"/>
    <path d="M15.5 2L12 13l-3-1.5L15.5 2z" fill="#FFBD4F"/>
  </svg>
));
const NextIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="10" fill="white"/>
    <path d="M9.5 8v8l7-4.5V8L9.5 12.5V8z" fill="black"/>
    <line x1="16" y1="8" x2="16" y2="16" stroke="black" strokeWidth="1.5"/>
  </svg>
));
const PythonIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M11.914 1c-2.724 0-5.097.459-5.097 2.593v1.9h5.186v.58H5.307C3.29 6.073 1.5 7.38 1.5 10.19c0 2.811 1.414 4.72 3.807 4.72h2.2v-2.27c0-2.163 1.873-4.07 4.407-4.07h5.172c1.932 0 3.414-1.213 3.414-3.06V2.593C20.5 1.46 18.638 1 15.914 1h-4zm-2.79 1.5a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9z" fill="#3776AB"/>
    <path d="M12.086 23c2.724 0 5.097-.459 5.097-2.593v-1.9h-5.186v-.58h6.696c2.017 0 3.807-1.307 3.807-4.117 0-2.811-1.414-4.72-3.807-4.72h-2.2v2.27c0 2.163-1.873 4.07-4.407 4.07H6.914c-1.932 0-3.414 1.213-3.414 3.06v2.917C3.5 22.54 5.362 23 8.086 23h4zm2.79-1.5a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9z" fill="#FFD43B"/>
  </svg>
));
const FastApiIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#009688"/>
    <path d="M13 6L9.5 12.5h3L11 18l5-7h-3.5L13 6z" fill="white" strokeLinejoin="round"/>
  </svg>
));
const NodeIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M12 2l9 5.2v10.4L12 22l-9-4.4V7.2L12 2z" fill="#339933"/>
    <path d="M12 7v5l4.33 2.5M12 12L7.67 9.5" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
    <text x="12" y="18" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="Arial">N</text>
  </svg>
));
const RustIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="9" stroke="#CE422B" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="3" fill="#CE422B"/>
    <line x1="12" y1="3" x2="12" y2="6" stroke="#CE422B" strokeWidth="1.5"/><line x1="12" y1="18" x2="12" y2="21" stroke="#CE422B" strokeWidth="1.5"/>
    <line x1="3" y1="12" x2="6" y2="12" stroke="#CE422B" strokeWidth="1.5"/><line x1="18" y1="12" x2="21" y2="12" stroke="#CE422B" strokeWidth="1.5"/>
  </svg>
));
const JavaIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.013-10.633-.118-6.943-1.149z" fill="#E76F00"/>
    <path d="M8.143 15.938s-1.029.762.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.131-7.942-.1218z" fill="#E76F00"/>
    <path d="M13.398 11.257c1.155 1.332-.304 2.533-.304 2.533s2.939-1.52 1.59-3.418c-1.261-1.772-2.228-2.653 3.007-5.688 0 0-8.216 2.052-4.293 6.573z" fill="#E76F00"/>
  </svg>
));
const CIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="10" fill="#A8B9CC"/>
    <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="Arial">C</text>
  </svg>
));
const CppIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="10" fill="#00599C"/>
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="Arial">C++</text>
  </svg>
));
const MarkdownIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect x="1" y="4" width="22" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M5 15V9l3 3.5L11 9v6M15 9v6l3-3 3 3V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
));

const TsIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect width="24" height="24" rx="4" fill="#3178C6" />
    <path d="M12 7.5v1.8H8.5V18H6.5V9.3H3V7.5h9zm9 4.3c-.3-.5-.8-.8-1.5-.8-.8 0-1.3.4-1.3 1 0 .6.4.9 1.4 1.3 1.6.6 2.4 1.3 2.4 2.6 0 1.5-1.2 2.6-3 2.6-1.4 0-2.4-.6-2.9-1.6l1.5-1c.3.6.8.9 1.4.9.7 0 1.1-.3 1.1-.8 0-.5-.4-.8-1.4-1.2-1.6-.6-2.4-1.3-2.4-2.6 0-1.4 1.1-2.4 2.8-2.4 1.2 0 2.2.5 2.7 1.4l-1.4 1z" fill="white" />
  </svg>
));

const JsIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect width="24" height="24" rx="4" fill="#F7DF1E" />
    <path d="M7 17.5c0 1.2.7 1.8 1.8 1.8 1.1 0 1.7-.6 1.7-1.5v-7.1H8.7v6.8c0 .3-.1.5-.4.5s-.4-.2-.4-.5V10.7H6v6.8zm7.5.3c-.6.6-1.5.9-2.5.9-1.7 0-2.8-1-2.8-2.7 0-1.6 1.1-2.6 2.6-2.6.8 0 1.4.3 1.8.8l-1.1 1.2c-.2-.3-.5-.5-.8-.5-.6 0-.9.4-.9 1.1 0 .7.4 1.1 1 1.1.4 0 .7-.2.9-.5l1 1.2z" fill="#000" />
  </svg>
));

const CssIcon = React.memo(({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4.136 3L5.918 20.162 11.99 22l6.082-1.838L19.864 3H4.136z" fill="#264DE4"/>
    <path d="M12 4.808v15.37l4.918-1.49L18.31 4.808H12z" fill="#2965F1"/>
    <path d="M12 9.098H8.724l.2 2.098h3.076v2.196H9.124l.2 2.098H12v2.108l3.15-.87.45-5.132.2-2.398H12z" fill="#fff"/>
  </svg>
));

export const renderLanguageVectorIcon = (extOrLang: string, size = 16) => {
  const norm = (extOrLang || '').toLowerCase();
  switch (norm) {
    case 'rs':
    case 'rust':
      return <RustIcon size={size} />;
    case 'ts':
    case 'tsx':
    case 'typescript':
      return <TsIcon size={size} />;
    case 'js':
    case 'jsx':
    case 'javascript':
      return <JsIcon size={size} />;
    case 'py':
    case 'python':
      return <PythonIcon size={size} />;
    case 'kt':
    case 'kotlin':
      return <KotlinIcon size={size} />;
    case 'java':
      return <JavaIcon size={size} />;
    case 'html':
      return <HtmlIcon size={size} />;
    case 'css':
    case 'scss':
      return <CssIcon size={size} />;
    case 'c':
      return <CIcon size={size} />;
    case 'cpp':
    case 'c++':
      return <CppIcon size={size} />;
    case 'md':
    case 'markdown':
      return <MarkdownIcon size={size} />;
    default:
      return <FileCode2 size={size} className="text-[#f3f0e7]/70" />;
  }
};

const TEMPLATE_ICON_EXTENSION: Record<string, string> = {
  'html-css-js': 'html',
  'react-ts': 'tsx',
  'react-js': 'jsx',
  'python': 'py',
  'rust-cli': 'rs',
  'java-cli': 'java',
  'android-java': 'java',
  'android-kotlin': 'kt',
  'node-express': 'js',
};

const renderThemedProjectIcon = (
  analysis: ProjectLanguageInfo,
  template: string | undefined,
  size: number
) => {
  const extension = analysis.languages[0]?.extension
    || TEMPLATE_ICON_EXTENSION[template || '']
    || 'ts';
  return <LanguageIcon fileName={`file.${extension}`} size={size} />;
};

const templateCategories = [
  {
    id: 'mobile',
    name: 'Android & Mobile',
    icon: <Smartphone size={18} />,
    templates: [
      { id: 'android-java', name: 'Android (Java)', desc: 'Standard Android app with Java & XML', icon: <AndroidIcon size={18} />, color: 'from-amber-600 to-amber-800' },
      { id: 'android-kotlin', name: 'Android (Kotlin)', desc: 'Modern Android app with Kotlin', icon: <KotlinIcon size={18} />, color: 'from-emerald-700 to-teal-900' },
      { id: 'android-compose', name: 'Android (Compose)', desc: 'Jetpack Compose native UI', icon: <ComposeIcon size={18} />, color: 'from-sky-600 to-blue-700' },
    ]
  },
  {
    id: 'web',
    name: 'Web Frontend',
    icon: <MonitorPlay size={18} />,
    templates: [
      { id: 'html-css-js', name: 'HTML / JS', desc: 'Web project with starter files', icon: <HtmlIcon size={18} />, color: 'from-amber-600 to-rose-700' },
      { id: 'react', name: 'React', desc: 'React app with JSX & CDN', icon: <ReactIcon size={18} />, color: 'from-emerald-700 to-teal-900' },
      { id: 'vite-react', name: 'Vite + React', desc: 'Modern React app with Vite', icon: <ViteIcon size={18} />, color: 'from-sky-600 to-indigo-800' },
      { id: 'nextjs', name: 'Next.js', desc: 'Full-stack React framework', icon: <NextIcon size={18} />, color: 'from-zinc-700 to-stone-900' },
    ]
  },
  {
    id: 'backend',
    name: 'Backend & APIs',
    icon: <Server size={18} />,
    templates: [
      { id: 'python-fastapi', name: 'FastAPI', desc: 'High-performance Python API', icon: <FastApiIcon size={18} />, color: 'from-teal-600 to-emerald-700' },
      { id: 'nodejs-express', name: 'Node + Express', desc: 'Express.js backend server', icon: <NodeIcon size={18} />, color: 'from-emerald-700 to-stone-900' },
    ]
  },
  {
    id: 'cli',
    name: 'CLI & Scripts',
    icon: <TerminalSquare size={18} />,
    templates: [
      { id: 'python', name: 'Python Script', desc: 'Standalone Python script', icon: <PythonIcon size={18} />, color: 'from-blue-600 to-amber-600' },
      { id: 'c-cli', name: 'C Program', desc: 'Standard C program', icon: <CIcon size={18} />, color: 'from-stone-600 to-stone-800' },
      { id: 'cpp-cli', name: 'C++ Program', desc: 'Modern C++ program', icon: <CppIcon size={18} />, color: 'from-indigo-700 to-stone-900' },
      { id: 'rust-cli', name: 'Rust CLI', desc: 'Command line tool in Rust', icon: <RustIcon size={18} />, color: 'from-amber-700 to-rose-800' },
      { id: 'java-cli', name: 'Java Console', desc: 'Simple Java app', icon: <JavaIcon size={18} />, color: 'from-amber-600 to-rose-700' },
      { id: 'kotlin-cli', name: 'Kotlin Console', desc: 'Simple Kotlin app', icon: <KotlinIcon size={18} />, color: 'from-emerald-600 to-teal-800' },
    ]
  },
  {
    id: 'other',
    name: 'Blank',
    icon: <FileText size={18} />,
    templates: [
      { id: 'markdown', name: 'Markdown', desc: 'Documentation project', icon: <MarkdownIcon size={18} />, color: 'from-slate-600 to-zinc-800' },
      { id: 'blank', name: 'Blank', desc: 'Empty workspace', icon: <FolderOpen size={18} />, color: 'from-stone-600 to-stone-800' },
    ]
  }
];

const TemplateCard = React.memo(({ t, isSelected, onSelect }: { t: any; isSelected: boolean; onSelect: (id: ProjectTemplate) => void }) => {
  const isLight = useIdeStore((state) => state.theme === 'light');
  return (
    <button
      type="button"
      onClick={() => onSelect(t.id)}
      className={`flex items-start space-x-3 p-3 rounded-2xl border text-left transition-colors ${
        isSelected
          ? (isLight ? 'border-[#2a2529] bg-[#2a2529]/10 font-semibold' : 'border-[#f3f0e7] bg-[#f3f0e7]/15 font-semibold')
          : (isLight ? 'border-[#2a2529]/10 bg-white/70 hover:bg-white' : 'border-[#f3f0e7]/10 bg-[#32303a]/60 hover:bg-[#32303a]')
      }`}
    >
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center flex-shrink-0 shadow-md`}>
        {t.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-bold text-xs truncate ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{t.name}</div>
        <div className={`text-[10px] line-clamp-1 ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>{t.desc}</div>
      </div>
    </button>
  );
});

const templateOptions = templateCategories.flatMap(c => c.templates);

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

function countFiles(files: Record<string, any>): number {
  return Object.values(files).filter((f: any) => f.type === 'file').length;
}

function getRecentFiles(files: Record<string, any>): string[] {
  return Object.values(files)
    .filter((f: any) => f.type === 'file')
    .slice(0, 3)
    .map((f: any) => f.name);
}

// LocalStorage caching for instantaneous dashboard cold-starts (changelog Sec. 9)
const META_CACHE_KEY = 'krypton_project_meta_cache';
function getCachedFileCount(projectId: string, fallbackFiles: Record<string, any>): number {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (raw) {
      const cache = JSON.parse(raw);
      if (cache[projectId]?.fileCount !== undefined) {
        return cache[projectId].fileCount;
      }
    }
  } catch {}
  return countFiles(fallbackFiles || {});
}

function updateFileCountCache(projects: Record<string, any>) {
  try {
    const cache: Record<string, { fileCount: number; updatedAt: number }> = {};
    for (const [id, p] of Object.entries(projects)) {
      cache[id] = {
        fileCount: countFiles(p.files || {}),
        updatedAt: p.updatedAt || Date.now(),
      };
    }
    localStorage.setItem(META_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// Welcome Screen
function WelcomeScreen({ onSkip }: { onSkip: () => void }) {
  const { setGoogleUser, setGoogleAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowContent(true), 100);
    const t2 = setTimeout(() => setShowButton(true), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      if (!Capacitor.isNativePlatform()) {
        alert('Google sign-in is available in the Android app. You can continue without it.');
        return;
      }

      const result = await nativeSignInWithGoogle({
        useCredentialManager: false,
      });
      
      const user = result.user;
      if (result.accessToken) {
        setGoogleAuth(user, result.accessToken);
      } else {
        setGoogleUser(user);
      }
      readConfig().then(c => { if (c) { c.welcomed = true; saveConfigNow(c); } });
      onSkip();
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      const authError = describeGoogleAuthError(err);
      if (!authError.isCancelled) {
        const details = authError.technical && authError.technical !== authError.message
          ? `\n\nDetails: ${authError.technical}`
          : '';
        alert(`${authError.message}${details}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#2a2529] text-[#f3f0e7] flex flex-col items-center justify-center px-8 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#f3f0e7]/[0.05] blur-[120px] animate-ambient-drift" />
        <div className="absolute bottom-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-[#7c9b79]/[0.08] blur-[120px] animate-ambient-drift" style={{ animationDelay: '-10s' }} />
      </div>

      <div className={`relative flex flex-col items-center transition-all duration-1000 ease-out ${showContent ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-12 scale-95'}`}>
        <div className="mb-8 animate-float">
          <div className="relative">
            <div className="absolute inset-0 bg-[#f3f0e7]/15 blur-2xl rounded-3xl animate-pulse-glow" />
            <div 
              className="relative w-28 h-28 rounded-[2rem] shadow-2xl shadow-black/50 border border-[#f3f0e7]/10 bg-cover bg-center" 
              style={{ backgroundImage: "url('/icon.png')" }} 
            />
          </div>
        </div>

        <h1 className="text-5xl font-extrabold text-[#f3f0e7] mb-3 tracking-tight text-center pb-1">Kryptonide</h1>
        <p className="text-[#f3f0e7]/60 text-lg mb-12 text-center max-w-[300px] font-medium leading-relaxed">
          The mobile workspace for software craft
        </p>

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className={`w-full max-w-[320px] flex items-center justify-center space-x-3 bg-[#32303a] border border-[#f3f0e7]/10 text-[#f3f0e7] hover:bg-[#3a3844] py-4 rounded-2xl font-semibold text-lg shadow-xl active:scale-[0.97] transition-all duration-300 mb-4 disabled:opacity-60 ${showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-[#f3f0e7] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="20" height="20" className="flex-shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <button
          onClick={() => {
            readConfig().then(c => { if (c) { c.welcomed = true; saveConfigNow(c); } });
            onSkip();
          }}
          className={`text-[#f3f0e7]/60 hover:text-[#f3f0e7] text-sm py-2 transition-all duration-300 ${showButton ? 'opacity-100' : 'opacity-0'}`}
        >
          Skip for now
        </button>

        <p className="text-[#f3f0e7]/30 text-[11px] mt-10">v4.0 • Sednium</p>
      </div>
    </div>
  );
}

export function ProjectsDashboard() {
  const { projects, createProject, deleteProject, renameProject, openProject, setProjectGitHubRepo } = useProjectsStore();
  const { googleUser, githubUser, githubToken } = useAuthStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [customFolderPath, setCustomFolderPath] = useState('');
  const [showCustomFolder, setShowCustomFolder] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>('html-css-js');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);
  const [linkGitHub, setLinkGitHub] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCloneRepo, setShowCloneRepo] = useState(false);
  const [cloneSearch, setCloneSearch] = useState('');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [isCloning, setIsCloning] = useState<string | null>(null);

  // Scroll fix for Projects Dashboard
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.body.style.position = 'relative';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
    };
  }, []);

  useEffect(() => {
    readConfig().then(config => {
      if (config && !config.welcomed) {
        setShowWelcome(true);
      }
    });
  }, []);

  // Sync file counts and metadata in background without blocking UI
  useEffect(() => {
    if (Object.keys(projects).length > 0) {
      setTimeout(() => updateFileCountCache(projects), 50);
    }
  }, [projects]);

  const [searchQuery, setSearchQuery] = useState('');
  const sortedProjects = Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt);
  const continueProject = sortedProjects[0] || null;

  const filteredProjects = sortedProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = p.name.toLowerCase().includes(q);
    const templateName = templateOptions.find((t) => t.id === p.template)?.name || p.template;
    const templateMatch = templateName.toLowerCase().includes(q);
    const filesMatch =
      p.files &&
      Object.values(p.files).some((f: any) => f.name && f.name.toLowerCase().includes(q));
    return nameMatch || templateMatch || filesMatch;
  });

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const name = newProjectName.trim() || 'Untitled Project';
      const folder = customFolderPath.trim() || undefined;
      const id = createProject(name, selectedTemplate, folder);
      
      if (linkGitHub && githubToken && githubUser) {
        try {
          const repoSafeName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const repo = await createRepo(repoSafeName, `Created with Kryptonide`, true);
          setProjectGitHubRepo(id, repo.full_name);
        } catch (e: any) {
          console.error('Failed to create GitHub repo', e);
          alert(`Project created, but GitHub repo creation failed: ${e.message}`);
        }
      }

      setShowNewProject(false);
      setNewProjectName('');
      setCustomFolderPath('');
      setShowCustomFolder(false);
      setLinkGitHub(true);
      openProject(id);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClone = async (repo: GitHubRepo) => {
    if (isCloning) return;
    setIsCloning(repo.full_name);
    try {
      const id = createProject(repo.name, 'blank');
      setProjectGitHubRepo(id, repo.full_name);
      openProject(id);
      
      const [owner, name] = repo.full_name.split('/');
      await pullRepo(owner, name);
      
      setShowCloneRepo(false);
    } catch (e: any) {
      console.error('Clone failed:', e);
      alert(`Clone failed: ${e.message}`);
    } finally {
      setIsCloning(null);
    }
  };

  const loadGitHubRepos = async () => {
    if (!githubToken) return;
    setLoadingRepos(true);
    try {
      const r = await listRepos();
      setRepos(r);
    } catch (e) {
      console.error(e);
    }
    setLoadingRepos(false);
  };

  useEffect(() => {
    if (showCloneRepo && repos.length === 0) {
      loadGitHubRepos();
    }
  }, [showCloneRepo, githubToken]);

  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const handleImportProject = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const core = (Capacitor as any).Plugins?.KryptonCore;
        if (core && typeof core.pickDirectory === 'function') {
          const res = await core.pickDirectory();
          if (res?.path) {
            const folderName = res.path.split('/').filter(Boolean).pop() || 'Imported_Project';
            const id = createProject(folderName, 'blank', res.path);
            openProject(id);
            return;
          }
        }
      }
      directoryInputRef.current?.click();
    } catch (e) {
      console.error('Import project error:', e);
    }
  };

  const handleDirectorySelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const firstRel = (files[0] as any).webkitRelativePath || files[0].name;
    const rootName = firstRel.split('/')[0] || 'Imported_Project';

    const projectFiles: Record<string, any> = {};
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = (file as any).webkitRelativePath || file.name;
      const cleanPath = relPath.startsWith(rootName + '/') ? relPath.slice(rootName.length + 1) : relPath;
      if (!cleanPath) continue;
      const content = await file.text();
      projectFiles[cleanPath] = {
        name: cleanPath.split('/').pop() || cleanPath,
        type: 'file',
        content,
      };
    }

    const projectId = createProject(rootName, 'blank');
    useProjectsStore.getState().updateProjectFiles(projectId, projectFiles);
    openProject(projectId);
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      renameProject(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this project? This action cannot be undone.')) {
      deleteProject(id);
    }
  };

  return (
    <div className={`h-full w-full flex flex-col relative overflow-y-auto min-h-screen select-none ${
      isLight ? 'bg-[#f3f0e7] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'
    }`}>
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#f3f0e7]/[0.05] blur-[120px] animate-ambient-drift" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#7c9b79]/[0.05] blur-[120px] animate-ambient-drift" style={{ animationDelay: '-10s' }} />
      </div>

      {showWelcome && (
        <WelcomeScreen onSkip={() => setShowWelcome(false)} />
      )}

      {/* Header */}
      <div className="relative z-10 px-6 pt-[var(--safe-area-top,48px)] pb-6 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative shadow-xl shadow-black/40 rounded-[1.25rem]">
              <div 
                className="w-14 h-14 rounded-[1.25rem] border border-[#f3f0e7]/10 bg-cover bg-center" 
                style={{ backgroundImage: "url('/icon.png')" }} 
              />
            </div>
            <div>
              <h1 className={`text-2xl font-extrabold tracking-tight ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
                Kryptonide
              </h1>
              <p className={`text-xs font-medium ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>
                {googleUser ? `Welcome, ${googleUser.name.split(' ')[0]}` : 'Mobile IDE'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleImportProject}
              className={`p-3 rounded-2xl border active:scale-95 transition-all shadow-md flex items-center space-x-1.5 ${
                isLight ? 'bg-white border-[#2a2529]/15 text-[#2a2529] hover:bg-[#e8e4d9]' : 'bg-[#342f33] border-[#f3f0e7]/10 text-[#f3f0e7] hover:bg-[#3d373c]'
              }`}
              title="Import Project"
            >
              <FolderUp size={20} />
              <span className="hidden sm:inline text-xs font-bold">Import</span>
            </button>
            <button
              onClick={() => setShowCloneRepo(true)}
              className={`p-3 rounded-2xl border active:scale-95 transition-all shadow-md ${
                isLight ? 'bg-white border-[#2a2529]/15 text-[#2a2529] hover:bg-[#e8e4d9]' : 'bg-[#342f33] border-[#f3f0e7]/10 text-[#f3f0e7] hover:bg-[#3d373c]'
              }`}
              title="Clone from GitHub"
            >
              <Github size={20} />
            </button>
            <button
              onClick={() => setShowNewProject(true)}
              className={`px-4 py-3 rounded-2xl font-bold text-sm flex items-center space-x-2 shadow-lg active:scale-95 transition-all ${
                isLight ? 'bg-[#2a2529] text-white hover:bg-black shadow-black/10' : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white shadow-[#f3f0e7]/10'
              }`}
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>New</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-24 relative z-10">
        {/* Continue Working Hero Card (hidden during active search) */}
        {continueProject && !searchQuery.trim() && (() => {
          const continueLangAnalysis = getProjectLanguages(continueProject.files);
          const continueDominantColor = continueLangAnalysis.dominantColor || '#e87a38';

          return (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <span className={`text-[11px] font-bold uppercase tracking-widest flex items-center space-x-1.5 ${
                  isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'
                }`}>
                  <span>Continue Working</span>
                </span>
              </div>

              <div 
                onClick={() => openProject(continueProject.id)}
                className={`krypton-hero-card group relative rounded-[26px] p-5 sm:p-6 border shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden active:scale-[0.99] ${
                  isLight
                    ? 'bg-[#e8e4d9] border-[#2a2529]/15 hover:border-[#2a2529]/35 text-[#2a2529]'
                    : 'bg-[#342f33] border-[#f3f0e7]/15 hover:border-[#f3f0e7]/35 text-[#f3f0e7]'
                }`}
              >
                <div 
                  className="absolute top-0 left-0 right-0 h-[3px]" 
                  style={{ 
                    backgroundColor: continueDominantColor, 
                    boxShadow: `0 0 8px ${continueDominantColor}55` 
                  }} 
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start space-x-4 min-w-0 flex-1">
                    <div 
                      className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md border"
                      style={{ 
                        backgroundColor: `${continueDominantColor}18`, 
                        borderColor: `${continueDominantColor}35` 
                      }}
                    >
                      {renderThemedProjectIcon(continueLangAnalysis, continueProject.template, 28)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className={`font-extrabold text-lg sm:text-xl truncate ${
                          isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
                        }`}>
                          {continueProject.name}
                        </h3>
                      </div>

                      <div className={`flex items-center space-x-3 mt-1 text-xs ${
                        isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'
                      }`}>
                        <span className="flex items-center space-x-1">
                          <Clock size={12} />
                          <span>Last modified {formatDate(continueProject.updatedAt)}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1 font-mono">
                          <FileCode2 size={12} />
                          <span>{getCachedFileCount(continueProject.id, continueProject.files)} files</span>
                        </span>
                      </div>

                      {continueLangAnalysis.languages.length > 0 && (
                        <div className="flex items-center space-x-1.5 mt-2.5 overflow-hidden flex-wrap gap-y-1">
                          {continueLangAnalysis.languages.slice(0, 3).map(l => (
                            <span 
                              key={l.language} 
                              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                                isLight 
                                  ? 'bg-white/80 text-[#2a2529]/90 border-[#2a2529]/10' 
                                  : 'bg-[#1f1b1f]/70 text-[#f3f0e7]/80 border-[#f3f0e7]/10'
                              }`}
                              title={`${l.language}: ${(l.byte_count / 1024).toFixed(1)} KB`}
                            >
                              {renderLanguageVectorIcon(l.extension || l.language, 12)}
                              <span>{l.language}</span>
                            </span>
                          ))}
                          {continueLangAnalysis.languages.length > 3 && (
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${
                              isLight 
                                ? 'bg-white/80 text-[#2a2529]/60 border-[#2a2529]/10' 
                                : 'bg-[#1f1b1f]/70 text-[#f3f0e7]/60 border-[#f3f0e7]/10'
                            }`}>
                              +{continueLangAnalysis.languages.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col justify-end items-end flex-shrink-0">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        openProject(continueProject.id);
                      }}
                      className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-all w-full sm:w-auto justify-center ${
                        isLight
                          ? 'bg-[#2a2529] text-white hover:bg-black'
                          : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white'
                      }`}
                    >
                      <Play size={15} fill="currentColor" />
                      <span>Resume</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Smooth Search Bar */}
        {sortedProjects.length > 0 && (
          <div className="relative mb-4 group">
            <Search
              size={16}
              className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors pointer-events-none ${
                searchQuery 
                  ? (isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]') 
                  : (isLight ? 'text-[#2a2529]/40 group-focus-within:text-[#2a2529]' : 'text-[#f3f0e7]/40 group-focus-within:text-[#f3f0e7]')
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects by name, template, or files..."
              className={`w-full rounded-2xl pl-11 pr-10 py-3 text-xs sm:text-sm focus:outline-none transition-all shadow-sm focus:shadow-md border ${
                isLight
                  ? 'bg-white border-[#2a2529]/15 text-[#2a2529] placeholder-[#2a2529]/40 focus:border-[#2a2529]/40'
                  : 'bg-[#342f33] border-[#f3f0e7]/10 text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:border-[#f3f0e7]/40'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full active:scale-95 transition-all cursor-pointer ${
                  isLight
                    ? 'text-[#2a2529]/40 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                    : 'text-[#f3f0e7]/40 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                }`}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Projects Grid Header */}
        <div className="flex items-center justify-between mb-3.5">
          <h2 className={`text-xs font-bold uppercase tracking-widest ${
            isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'
          }`}>
            All Projects ({filteredProjects.length}{searchQuery.trim() ? ` of ${sortedProjects.length}` : ''})
          </h2>
        </div>

        {sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 opacity-70">
            <div className={`w-16 h-16 rounded-[1.25rem] border flex items-center justify-center mb-4 shadow-xl ${
              isLight ? 'bg-white border-[#2a2529]/15' : 'bg-[#342f33] border-[#f3f0e7]/10'
            }`}>
              <FolderOpen size={28} className={isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'} />
            </div>
            <p className={`text-base font-semibold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>No projects found</p>
            <p className={`text-xs mt-1 mb-4 ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>Start creating your next software project now</p>
            <button
              onClick={() => setShowNewProject(true)}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 shadow-md active:scale-95 transition-all ${
                isLight ? 'bg-[#2a2529] text-white hover:bg-black' : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white'
              }`}
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Create Project</span>
            </button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 opacity-75">
            <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-3 shadow-lg ${
              isLight ? 'bg-white border-[#2a2529]/15' : 'bg-[#342f33] border-[#f3f0e7]/10'
            }`}>
              <Search size={24} className={isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'} />
            </div>
            <p className={`text-base font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>No matching projects</p>
            <p className={`text-xs mt-1 mb-4 ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>
              No projects matched &ldquo;{searchQuery}&rdquo;
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold active:scale-95 transition-all cursor-pointer ${
                isLight 
                  ? 'bg-white border-[#2a2529]/15 hover:bg-[#e8e4d9] text-[#2a2529]' 
                  : 'bg-[#342f33] border-[#f3f0e7]/15 hover:bg-[#3d373c] text-[#f3f0e7]'
              }`}
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project, i) => {
              const fileCount = getCachedFileCount(project.id, project.files);
              const langAnalysis = getProjectLanguages(project.files);
              const dominantColor = langAnalysis.dominantColor || '#e87a38';

              return (
                <div
                  key={project.id}
                  className={`group relative rounded-[26px] p-5 shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden active:scale-[0.98] border ${
                    isLight
                      ? 'bg-[#e8e4d9] border-[#2a2529]/10 hover:border-[#2a2529]/30 text-[#2a2529]'
                      : 'bg-[#342f33] border-[#f3f0e7]/10 hover:border-[#f3f0e7]/30 text-[#f3f0e7]'
                  }`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => {
                    if (editingId !== project.id) openProject(project.id);
                  }}
                >
                  {/* Dynamic Dominant Language Accent Line */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-[3px]" 
                    style={{ 
                      backgroundColor: dominantColor, 
                      boxShadow: `0 0 8px ${dominantColor}55` 
                    }} 
                  />

                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        <div 
                          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md border"
                          style={{ 
                            backgroundColor: `${dominantColor}15`, 
                            borderColor: `${dominantColor}30` 
                          }}
                        >
                          {renderThemedProjectIcon(langAnalysis, project.template, 24)}
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingId === project.id ? (
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={() => handleRename(project.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(project.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className={`border rounded-lg px-2 py-0.5 font-semibold text-sm w-full focus:outline-none ${
                                isLight 
                                  ? 'bg-white border-[#2a2529]/30 text-[#2a2529]' 
                                  : 'bg-[#2a2529] border-[#f3f0e7]/30 text-[#f3f0e7]'
                              }`}
                            />
                          ) : (
                            <div className="flex items-center space-x-2">
                              <h3 className={`font-extrabold text-base truncate transition-colors ${
                                isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
                              }`}>
                                {project.name}
                              </h3>
                            </div>
                          )}
                          <div className={`flex items-center space-x-2.5 mt-1 text-xs ${
                            isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'
                          }`}>
                            <span className="flex items-center space-x-1">
                              <Clock size={11} />
                              <span>Last modified {formatDate(project.updatedAt)}</span>
                            </span>
                            <span>•</span>
                            <span className="flex items-center space-x-1 font-mono">
                              <FileCode2 size={11} />
                              <span>{fileCount} files</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(project.id);
                            setEditName(project.name);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isLight
                              ? 'text-[#2a2529]/40 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                              : 'text-[#f3f0e7]/40 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                          }`}
                          title="Rename project"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(project.id, e)}
                          className="p-1.5 text-red-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors"
                          title="Delete project"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Dynamic Language Badges — up to 3 dominant inline + overflow pill */}
                    {langAnalysis.languages.length > 0 && (
                      <div className="flex items-center space-x-1.5 mt-3 overflow-hidden flex-wrap gap-y-1">
                        {langAnalysis.languages.slice(0, 3).map((l) => (
                          <span
                            key={l.language}
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                              isLight
                                ? 'bg-white/80 text-[#2a2529]/90 border-[#2a2529]/10'
                                : 'bg-[#2a2529]/60 text-[#f3f0e7]/80 border-[#f3f0e7]/10'
                            }`}
                            title={`${l.language}: ${(l.byte_count / 1024).toFixed(1)} KB`}
                          >
                            {renderLanguageVectorIcon(l.extension || l.language, 12)}
                            <span>{l.language}</span>
                          </span>
                        ))}
                        {langAnalysis.languages.length > 3 && (
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${
                              isLight
                                ? 'bg-white/80 text-[#2a2529]/60 border-[#2a2529]/10'
                                : 'bg-[#2a2529]/60 text-[#f3f0e7]/60 border-[#f3f0e7]/10'
                            }`}
                            title={langAnalysis.languages.slice(3).map(l => l.language).join(', ')}
                          >
                            +{langAnalysis.languages.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Project BottomSheet Modal */}
      <BottomSheet
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
        title={
          <div className="flex items-center space-x-2">
            <Sparkles className="text-[#f3f0e7]" size={20} />
            <span>Create New Project</span>
          </div>
        }
      >
        <div className="space-y-6 px-6 py-4 pb-12">
          <div>
            <label className="text-xs font-bold text-[#f3f0e7]/60 mb-2 block uppercase tracking-wider">
              Project Name
            </label>
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="My Project"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full bg-[#32303a] border border-[#f3f0e7]/10 rounded-2xl px-4 py-3 text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40 focus:outline-none font-semibold text-base"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowCustomFolder(!showCustomFolder)}
              className="text-xs text-[#f3f0e7]/60 hover:text-[#f3f0e7] flex items-center space-x-1.5 font-medium transition-colors mb-1"
            >
              {showCustomFolder ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span>Advanced: Custom storage subfolder</span>
            </button>
            {showCustomFolder && (
              <div className="mt-2 p-3 bg-[#2a2529] rounded-xl border border-[#f3f0e7]/10 space-y-1">
                <label className="text-[11px] text-[#f3f0e7]/50 block font-mono">
                  Subfolder relative path (inside storage root):
                </label>
                <input
                  type="text"
                  value={customFolderPath}
                  onChange={(e) => setCustomFolderPath(e.target.value)}
                  placeholder="projects/MyCustomFolder"
                  className="w-full bg-[#342f33] border border-[#f3f0e7]/15 rounded-lg px-3 py-2 text-xs text-[#f3f0e7] font-mono focus:outline-none focus:border-[#f3f0e7]/40"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-[#f3f0e7]/60 mb-3 block uppercase tracking-wider">
              Select Template
            </label>
            <div className="space-y-5">
              {templateCategories.map((category) => (
                <div key={category.id}>
                  <div className="flex items-center space-x-2 text-xs font-bold text-[#f3f0e7]/80 mb-2">
                    {category.icon}
                    <span>{category.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {category.templates.map((t) => (
                      <TemplateCard
                        key={t.id}
                        t={t}
                        isSelected={selectedTemplate === t.id}
                        onSelect={(id) => setSelectedTemplate(id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {githubToken && githubUser && (
            <label className="flex items-center space-x-3 cursor-pointer pt-2">
              <input 
                type="checkbox" 
                checked={linkGitHub}
                onChange={(e) => setLinkGitHub(e.target.checked)}
                className="w-5 h-5 accent-[#f3f0e7] rounded"
              />
              <span className="text-xs text-[#f3f0e7]/80 font-medium">Create private GitHub repository</span>
            </label>
          )}

          <button 
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full py-4 rounded-2xl font-bold text-base bg-[#f3f0e7] text-[#2a2529] shadow-lg shadow-[#f3f0e7]/10 hover:bg-white active:scale-[0.98] transition-all flex items-center justify-center space-x-2 disabled:opacity-60"
          >
            {isCreating ? (
              <>
                <Loader2 size={20} className="animate-spin text-[#2a2529]" />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Project</span>
            )}
          </button>
        </div>
      </BottomSheet>

      {/* Clone Repo Modal */}
      <Modal
        isOpen={showCloneRepo}
        onClose={() => setShowCloneRepo(false)}
        title="Clone GitHub Repository"
      >
        {!githubToken ? (
          <div className="text-center py-6">
            <Github size={40} className="mx-auto mb-3 text-[#f3f0e7]" />
            <h3 className="text-base font-bold mb-1">GitHub Not Connected</h3>
            <p className="text-xs text-[#f3f0e7]/60 mb-6">
              Connect your GitHub account in settings to pull your repositories.
            </p>
            <button
              onClick={() => setShowCloneRepo(false)}
              className="bg-[#f3f0e7] text-[#2a2529] px-6 py-2 rounded-xl font-bold text-sm hover:bg-white transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3.5 text-[#f3f0e7]/40" />
              <input
                value={cloneSearch}
                onChange={(e) => setCloneSearch(e.target.value)}
                placeholder="Search repositories..."
                className="w-full bg-[#2a2529] border border-[#f3f0e7]/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40 focus:outline-none"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2 scrollbar-hide">
              {loadingRepos ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={24} className="animate-spin text-[#f3f0e7]" />
                </div>
              ) : (
                repos
                  .filter(r => r.name.toLowerCase().includes(cloneSearch.toLowerCase()))
                  .map((repo) => (
                    <div
                      key={repo.full_name}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#2a2529]/60 border border-[#f3f0e7]/5 hover:border-[#f3f0e7]/20 transition-colors"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="font-semibold text-xs text-[#f3f0e7] truncate">{repo.name}</p>
                        <p className="text-[10px] text-[#f3f0e7]/40 truncate">{repo.full_name}</p>
                      </div>
                      <button
                        onClick={() => handleClone(repo)}
                        disabled={isCloning !== null}
                        className="px-3 py-1.5 rounded-lg bg-[#f3f0e7] text-[#2a2529] text-xs font-bold flex items-center space-x-1 hover:bg-white disabled:opacity-50 transition-colors"
                      >
                        {isCloning === repo.full_name ? <Loader2 size={12} className="animate-spin text-[#2a2529]" /> : <MonitorPlay size={12} />}
                        <span>{isCloning === repo.full_name ? 'Cloning...' : 'Clone'}</span>
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Hidden directory input for Import Project */}
      <input
        type="file"
        ref={directoryInputRef}
        onChange={handleDirectorySelected}
        style={{ display: 'none' }}
        {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
      />
    </div>
  );
}
