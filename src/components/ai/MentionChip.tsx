import React from 'react';
import { Sparkles, FileCode2, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SkillMention {
  type: 'skill';
  id: string;
  name: string;
}

export interface FileMention {
  type: 'file';
  id: string;
  name: string;
}

export type MentionTag = SkillMention | FileMention;

interface MentionChipProps {
  tag: MentionTag;
  onRemove?: () => void;
  className?: string;
}

export function MentionChip({ tag, onRemove, className }: MentionChipProps) {
  if (tag.type === 'skill') {
    return (
      <span
        className={cn(
          "inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-500/20 to-teal-500/20 border border-teal-500/40 text-teal-200 shadow-[0_0_12px_rgba(20,184,166,0.25)] select-none",
          className
        )}
      >
        <Sparkles size={13} className="text-teal-300 flex-shrink-0 animate-pulse-glow" />
        <span className="font-mono text-[11px]">/{tag.name}</span>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="ml-1 p-0.5 hover:bg-teal-500/30 rounded-full transition-colors text-teal-200 focus-visible:ring-1 focus-visible:ring-teal-300 focus-visible:outline-none"
            aria-label={`Remove skill ${tag.name}`}
            title={`Remove skill ${tag.name}`}
          >
            <X size={12} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-400/40 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.25)] select-none",
        className
      )}
    >
      <FileCode2 size={13} className="text-blue-300 flex-shrink-0" />
      <span className="font-mono text-[11px]">@{tag.name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 p-0.5 hover:bg-blue-500/30 rounded-full transition-colors text-blue-200 focus-visible:ring-1 focus-visible:ring-blue-300 focus-visible:outline-none"
          aria-label={`Remove file ${tag.name}`}
          title={`Remove file ${tag.name}`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
