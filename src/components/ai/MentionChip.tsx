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
          "inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 border border-black/15 dark:border-white/20 text-[#2a2529] dark:text-[#f3f0e7] select-none",
          className
        )}
      >
        <Sparkles size={13} className="text-[#7C9B79] flex-shrink-0" />
        <span className="font-mono text-[11px]">/{tag.name}</span>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="ml-1 p-0.5 hover:bg-black/10 dark:hover:bg-white/15 rounded-full transition-colors text-[#2a2529] dark:text-[#f3f0e7] focus-visible:ring-1 focus-visible:ring-[#7C9B79] focus-visible:outline-none"
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
        "inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 border border-black/15 dark:border-white/20 text-[#2a2529] dark:text-[#f3f0e7] select-none",
        className
      )}
    >
      <FileCode2 size={13} className="text-[#7C9B79] flex-shrink-0" />
      <span className="font-mono text-[11px]">@{tag.name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 p-0.5 hover:bg-black/10 dark:hover:bg-white/15 rounded-full transition-colors text-[#2a2529] dark:text-[#f3f0e7] focus-visible:ring-1 focus-visible:ring-[#7C9B79] focus-visible:outline-none"
          aria-label={`Remove file ${tag.name}`}
          title={`Remove file ${tag.name}`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
