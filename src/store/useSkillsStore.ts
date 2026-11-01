import { create } from 'zustand';
import { readDiskSkills, writeDiskSkill, type DiskSkill } from '../lib/fileSystemStorage';

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'code-explainer',
    name: 'Code Explainer',
    description: 'Explains complex functions, algorithms, and data structures step-by-step.',
    content: 'Analyze the provided code and explain its architecture, data flow, key logic, and edge cases in clean, easy to follow markdown.',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'bug-hunter',
    name: 'Bug Hunter',
    description: 'Finds security vulnerabilities, memory leaks, logic flaws, and runtime bugs.',
    content: 'Audit the provided code for potential bugs, security issues, null pointer exceptions, unhandled errors, and race conditions.',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'refactor',
    name: 'Clean Code Refactor',
    description: 'Refactors messy code following SOLID principles, clean code patterns, and modern style guidelines.',
    content: 'Refactor the provided code for maximum readability, maintainability, modularity, and modern idiomatic patterns without altering functionality.',
    enabled: true,
    isBuiltIn: true,
  },
  {
    id: 'write-tests',
    name: 'Test Generator',
    description: 'Generates comprehensive unit and integration tests for functions and components.',
    content: 'Generate high-coverage unit tests with mock dependencies, edge case assertions, and boundary checks for the provided code.',
    enabled: true,
    isBuiltIn: true,
  },
];

/**
 * Format enabled skills into prompt context for Oorty Lite
 */
export function getSkillsPromptContext(skills: Skill[]): string {
  const enabled = skills.filter((s) => s.enabled);
  if (enabled.length === 0) return '';
  return [
    'Enabled Agent Skills (invoke instructions when user asks or references them):',
    ...enabled.map((s) => `- /${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}: ${s.description}\n  Instructions: ${s.content.trim()}`),
  ].join('\n');
}

/**
 * Parse markdown file with YAML frontmatter matching Kotlin regex implementation in SkillsRepository.kt:
 * ---
 * name: ...
 * description: ...
 * ---
 * <instructions>
 */
export function parseSkillMarkdown(fileName: string, content: string): { name: string; description: string; instructions: string } {
  const frontmatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---/m;
  const match = frontmatterRegex.exec(content);
  let name = fileName.replace(/\.md$/i, '').trim();
  let description = 'Custom imported skill';

  if (match) {
    const yaml = match[1];
    const lines = yaml.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('name:')) {
        name = trimmed.replace(/^name:\s*/, '').replace(/^['"]|['"]$/g, '').trim();
      } else if (trimmed.startsWith('description:')) {
        description = trimmed.replace(/^description:\s*/, '').replace(/^['"]|['"]$/g, '').trim();
      }
    }
  }

  const instructions = content.replace(frontmatterRegex, '').trim();
  return { name, description, instructions };
}

interface SkillsState {
  skills: Skill[];
  isLoading: boolean;
  loadSkills: () => Promise<void>;
  toggleSkill: (id: string) => void;
  addSkill: (name: string, description: string, body: string) => Promise<void>;
  importSkill: (fileName: string, content: string) => Promise<Skill>;
  deleteSkill: (id: string) => Promise<void>;
}

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  skills: BUILT_IN_SKILLS,
  isLoading: false,

  loadSkills: async () => {
    set({ isLoading: true });
    try {
      const diskSkills = await readDiskSkills();
      const userSkills: Skill[] = (diskSkills || []).map((ds: DiskSkill) => ({
        id: ds.id,
        name: ds.name,
        description: ds.description,
        content: ds.content,
        enabled: ds.enabled,
        isBuiltIn: false,
      }));

      // Combine built-in skills with disk skills (override if duplicate ID)
      const diskIds = new Set(userSkills.map((s) => s.id));
      const builtInsFiltered = BUILT_IN_SKILLS.filter((s) => !diskIds.has(s.id));

      set({ skills: [...builtInsFiltered, ...userSkills], isLoading: false });
    } catch (e) {
      console.error('[SkillsStore] Failed to load skills from disk:', e);
      set({ isLoading: false });
    }
  },

  toggleSkill: (id: string) => {
    set((state) => ({
      skills: state.skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    }));
  },

  addSkill: async (name: string, description: string, body: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `skill-${Date.now()}`;
    await writeDiskSkill(id, name, description, body);
    await get().loadSkills();
  },

  importSkill: async (fileName: string, content: string) => {
    const parsed = parseSkillMarkdown(fileName, content);
    const id = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `skill-${Date.now()}`;
    await writeDiskSkill(id, parsed.name, parsed.description, parsed.instructions);
    await get().loadSkills();
    const imported = get().skills.find((s) => s.id === id) || {
      id,
      name: parsed.name,
      description: parsed.description,
      content: parsed.instructions,
      enabled: true,
      isBuiltIn: false,
    };
    return imported;
  },

  deleteSkill: async (id: string) => {
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id || s.isBuiltIn),
    }));
  },
}));
