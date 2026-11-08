import React, { useState, useMemo } from 'react';
import { Search, CaseSensitive, WholeWord, Regex, FileCode, ChevronRight, ChevronDown, X } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { LanguageIcon } from './LanguageIcon';

interface MatchItem {
  lineNum: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

interface FileSearchResult {
  fileId: string;
  fileName: string;
  relativePath: string;
  matches: MatchItem[];
}

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchWord, setMatchWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const files = useIdeStore((state) => state.files);
  const openFile = useIdeStore((state) => state.openFile);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  // Build relative path helper
  const getRelativePath = (nodeId: string): string => {
    const parts: string[] = [];
    let curr = files[nodeId];
    while (curr && curr.parentId && curr.parentId !== 'root') {
      const parent = files[curr.parentId];
      if (parent) {
        parts.unshift(parent.name);
        curr = parent;
      } else {
        break;
      }
    }
    return parts.length > 0 ? parts.join('/') : '';
  };

  const results: FileSearchResult[] = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    let regex: RegExp;
    try {
      let pattern = useRegex ? trimmed : trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (matchWord) {
        pattern = `\\b${pattern}\\b`;
      }
      regex = new RegExp(pattern, matchCase ? 'g' : 'gi');
    } catch {
      return [];
    }

    const matchedList: FileSearchResult[] = [];

    for (const [fileId, node] of Object.entries(files)) {
      if (!node || node.type !== 'file' || typeof node.content !== 'string') continue;

      const lines = node.content.split('\n');
      const fileMatches: MatchItem[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
          fileMatches.push({
            lineNum: i + 1,
            lineText: line,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });

          // Break to prevent infinite loop on empty match
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
          // Limit to max 50 matches per line
          if (fileMatches.length >= 200) break;
        }

        if (fileMatches.length >= 200) break;
      }

      // Also match by file name if no line content matches
      if (fileMatches.length === 0) {
        regex.lastIndex = 0;
        if (regex.test(node.name)) {
          fileMatches.push({
            lineNum: 1,
            lineText: `(Matched file name: ${node.name})`,
            matchStart: 0,
            matchEnd: node.name.length,
          });
        }
      }

      if (fileMatches.length > 0) {
        matchedList.push({
          fileId,
          fileName: node.name,
          relativePath: getRelativePath(fileId),
          matches: fileMatches,
        });
      }
    }

    return matchedList;
  }, [query, matchCase, matchWord, useRegex, files]);

  const totalMatches = useMemo(() => {
    return results.reduce((acc, r) => acc + r.matches.length, 0);
  }, [results]);

  const handleSelectMatch = (fileId: string, lineNum: number) => {
    openFile(fileId);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('krypton-goto-line', { detail: { line: lineNum } }));
    }, 100);
  };

  const toggleCollapse = (fileId: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  return (
    <div className={`flex flex-col h-full select-none ${isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
      {/* Search Input Bar */}
      <div className={`p-3 border-b space-y-2 ${isLight ? 'border-[#2a2529]/10 bg-[#f4f0e6]' : 'border-[#f3f0e7]/10 bg-[#231e22]'}`}>
        <div className="relative flex items-center">
          <Search size={14} className={`absolute left-3 pointer-events-none ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}`} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lines & files..."
            autoFocus
            className={`w-full text-xs rounded-xl pl-8 pr-16 py-2 transition-all font-mono outline-none border focus:ring-2 ${
              isLight
                ? 'bg-white border-[#2a2529]/15 text-[#2a2529] placeholder-[#2a2529]/40 focus:ring-[#7C9B79]/30 focus:border-[#7C9B79]'
                : 'bg-[#2a2529] border-[#f3f0e7]/15 text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:ring-[#7C9B79]/40 focus:border-[#7C9B79]'
            }`}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className={`absolute right-14 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}`}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}

          {/* Toggle Chips (Case, Word, Regex) */}
          <div className="absolute right-2 flex items-center space-x-0.5">
            <button
              onClick={() => setMatchCase(!matchCase)}
              className={`p-1 rounded text-[10px] font-bold transition-colors ${
                matchCase
                  ? 'bg-[#7C9B79] text-white shadow-sm'
                  : isLight
                  ? 'text-[#2a2529]/50 hover:bg-[#2a2529]/10'
                  : 'text-[#f3f0e7]/50 hover:bg-[#f3f0e7]/10'
              }`}
              title="Match Case (Alt+C)"
            >
              <CaseSensitive size={13} />
            </button>
            <button
              onClick={() => setMatchWord(!matchWord)}
              className={`p-1 rounded text-[10px] font-bold transition-colors ${
                matchWord
                  ? 'bg-[#7C9B79] text-white shadow-sm'
                  : isLight
                  ? 'text-[#2a2529]/50 hover:bg-[#2a2529]/10'
                  : 'text-[#f3f0e7]/50 hover:bg-[#f3f0e7]/10'
              }`}
              title="Match Whole Word (Alt+W)"
            >
              <WholeWord size={13} />
            </button>
            <button
              onClick={() => setUseRegex(!useRegex)}
              className={`p-1 rounded text-[10px] font-bold transition-colors ${
                useRegex
                  ? 'bg-[#7C9B79] text-white shadow-sm'
                  : isLight
                  ? 'text-[#2a2529]/50 hover:bg-[#2a2529]/10'
                  : 'text-[#f3f0e7]/50 hover:bg-[#f3f0e7]/10'
              }`}
              title="Use Regular Expression (Alt+R)"
            >
              <Regex size={13} />
            </button>
          </div>
        </div>

        {/* Results Count Header */}
        {query.trim() && (
          <div className="flex items-center justify-between text-[10px] px-1 font-mono">
            <span className={isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}>
              {results.length > 0 ? (
                <>
                  <strong className={isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}>{totalMatches}</strong> match{totalMatches === 1 ? '' : 'es'} across{' '}
                  <strong className={isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}>{results.length}</strong> file{results.length === 1 ? '' : 's'}
                </>
              ) : (
                'No matches found'
              )}
            </span>
          </div>
        )}
      </div>

      {/* Results Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {!query.trim() ? (
          <div className={`p-8 text-center text-xs flex flex-col items-center justify-center h-48 ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}`}>
            <Search size={28} className="mb-2 opacity-30" />
            <span>Type above to search lines, functions, and code across your workspace</span>
          </div>
        ) : results.length === 0 ? (
          <div className={`p-8 text-center text-xs ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}`}>
            No matches found for <span className="font-mono font-bold">"{query}"</span>
          </div>
        ) : (
          results.map((fileRes) => {
            const isCollapsed = collapsedFiles[fileRes.fileId] ?? false;
            return (
              <div
                key={fileRes.fileId}
                className={`rounded-xl border overflow-hidden ${
                  isLight ? 'bg-white/80 border-[#2a2529]/10' : 'bg-[#231e22]/80 border-[#f3f0e7]/10'
                }`}
              >
                {/* File Header */}
                <div
                  onClick={() => toggleCollapse(fileRes.fileId)}
                  className={`flex items-center justify-between px-2.5 py-1.5 cursor-pointer select-none transition-colors ${
                    isLight ? 'hover:bg-[#2a2529]/5' : 'hover:bg-[#f3f0e7]/5'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className={isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}>
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                    <span className="shrink-0"><LanguageIcon fileName={fileRes.fileName} size={15} /></span>
                    <span className="text-xs font-semibold truncate font-mono">{fileRes.fileName}</span>
                    {fileRes.relativePath && (
                      <span className={`text-[10px] truncate ${isLight ? 'text-[#2a2529]/40' : 'text-[#f3f0e7]/40'}`}>
                        {fileRes.relativePath}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                      isLight ? 'bg-[#7C9B79]/15 text-[#3a5837]' : 'bg-[#7C9B79]/20 text-[#a3c4a0]'
                    }`}
                  >
                    {fileRes.matches.length}
                  </span>
                </div>

                {/* File Line Matches */}
                {!isCollapsed && (
                  <div className={`border-t font-mono text-[11px] divide-y ${
                    isLight ? 'border-[#2a2529]/5 divide-[#2a2529]/5' : 'border-[#f3f0e7]/5 divide-[#f3f0e7]/5'
                  }`}>
                    {fileRes.matches.map((item, idx) => {
                      const before = item.lineText.slice(0, item.matchStart);
                      const matchText = item.lineText.slice(item.matchStart, item.matchEnd);
                      const after = item.lineText.slice(item.matchEnd);

                      return (
                        <div
                          key={idx}
                          onClick={() => handleSelectMatch(fileRes.fileId, item.lineNum)}
                          className={`flex items-start px-3 py-1.5 cursor-pointer group transition-colors ${
                            isLight ? 'hover:bg-[#7C9B79]/10' : 'hover:bg-[#7C9B79]/15'
                          }`}
                        >
                          <span
                            className={`w-8 shrink-0 text-right pr-2 select-none text-[10px] pt-0.5 ${
                              isLight ? 'text-[#2a2529]/40 group-hover:text-[#7C9B79]' : 'text-[#f3f0e7]/40 group-hover:text-[#a3c4a0]'
                            }`}
                          >
                            {item.lineNum}
                          </span>
                          <span className="flex-1 truncate whitespace-pre text-left">
                            <span>{before.trimStart()}</span>
                            <mark
                              className={`px-0.5 rounded ${
                                isLight
                                  ? 'bg-[#7C9B79]/30 text-[#2a2529] font-bold'
                                  : 'bg-[#7C9B79]/40 text-[#f3f0e7] font-bold'
                              }`}
                            >
                              {matchText}
                            </mark>
                            <span>{after}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
