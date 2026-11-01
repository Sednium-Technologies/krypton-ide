import { create } from 'zustand';
import React from 'react';

export type CommandCategory = 'Editor' | 'Git' | 'Terminal' | 'AI' | 'View' | 'Project';

export interface IdeCommand {
  id: string;
  category: CommandCategory;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void | Promise<void>;
}

interface CommandRegistryState {
  commands: Record<string, IdeCommand>;
  registerCommand: (command: IdeCommand) => void;
  registerCommands: (commands: IdeCommand[]) => void;
  unregisterCommand: (id: string) => void;
  getCommands: () => IdeCommand[];
  getCommandsByCategory: (category: CommandCategory) => IdeCommand[];
}

export const useCommandRegistry = create<CommandRegistryState>((set, get) => ({
  commands: {},

  registerCommand: (command: IdeCommand) => {
    set((state) => ({
      commands: {
        ...state.commands,
        [command.id]: command,
      },
    }));
  },

  registerCommands: (newCommands: IdeCommand[]) => {
    set((state) => {
      const updated = { ...state.commands };
      for (const cmd of newCommands) {
        updated[cmd.id] = cmd;
      }
      return { commands: updated };
    });
  },

  unregisterCommand: (id: string) => {
    set((state) => {
      const next = { ...state.commands };
      delete next[id];
      return { commands: next };
    });
  },

  getCommands: () => {
    return Object.values(get().commands);
  },

  getCommandsByCategory: (category: CommandCategory) => {
    return Object.values(get().commands).filter((c) => c.category === category);
  },
}));
