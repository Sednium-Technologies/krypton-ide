import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, ChevronDown, FileText, Replace, CaseSensitive, Regex, X } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';

export function SearchPanel() {
  const { files, openFile, updateFileContent } = useIdeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const resultList: { fileId: string; matches: { line: number; content: string }[] }[] = [];

    Object.values(files).forEach(file => {
      if (file.type === 'file' && file.content) {
        const lines = file.content.split('\n');
        const matches: { line: number; content: string }[] = [];
        
        lines.forEach((line, index) => {
          let found = false;
          if (useRegex) {
            try {
              const regex = new RegExp(searchQuery, caseSensitive ? 'g' : 'gi');
              found = regex.test(line);
            } catch { found = false; }
          } else {
            found = caseSensitive 
              ? line.includes(searchQuery) 
              : line.toLowerCase().includes(searchQuery.toLowerCase());
          }
          
          if (found) {
            matches.push({ line: index + 1, content: line.trim() });
          }
        });

        if (matches.length > 0) {
          resultList.push({ fileId: file.id, matches });
        }
      }
    });

    return resultList;
  }, [searchQuery, files, caseSensitive, useRegex]);

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedResults(newExpanded);
  };

  const handleReplaceInFile = (fileId: string) => {
    const file = files[fileId];
    if (!file?.content) return;
    
    let newContent: string;
    if (useRegex) {
      try {
        const regex = new RegExp(searchQuery, caseSensitive ? 'g' : 'gi');
        newContent = file.content.replace(regex, replaceQuery);
      } catch { return; }
    } else {
      if (caseSensitive) {
        newContent = file.content.split(searchQuery).join(replaceQuery);
      } else {
        const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        newContent = file.content.replace(regex, replaceQuery);
      }
    }
    
    updateFileContent(fileId, newContent);
  };

  const handleReplaceAll = () => {
    results.forEach(result => handleReplaceInFile(result.fileId));
  };

  return (
    <div className="flex h-full flex-col p-3 bg-[#2a2529] text-[#f3f0e7]">
      <div className="mb-3 space-y-2">
        {/* Search Input */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search in files"
            className="w-full rounded-2xl border border-[#f3f0e7]/15 bg-[#342f33] py-2.5 pl-3 pr-20 text-xs text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:border-[#f3f0e7]/40 focus:outline-none transition-all"
          />
          <div className="absolute right-2 flex items-center space-x-1">
            <button 
              onClick={() => setCaseSensitive(!caseSensitive)}
              aria-label="Match case"
              aria-pressed={caseSensitive}
              className={`p-1.5 rounded-xl text-xs transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${caseSensitive ? 'bg-[#f3f0e7]/20 text-[#f3f0e7] font-bold border border-[#f3f0e7]/30' : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7]'}`} 
              title="Case Sensitive"
            >
              <CaseSensitive size={14} />
            </button>
            <button 
              onClick={() => setUseRegex(!useRegex)}
              aria-label="Use regular expression"
              aria-pressed={useRegex}
              className={`p-1.5 rounded-xl text-xs transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${useRegex ? 'bg-[#f3f0e7]/20 text-[#f3f0e7] font-bold border border-[#f3f0e7]/30' : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7]'}`} 
              title="Use Regex"
            >
              <Regex size={14} />
            </button>
            <button 
              onClick={() => setShowReplace(!showReplace)}
              aria-label="Toggle replace mode"
              aria-expanded={showReplace}
              className={`p-1.5 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${showReplace ? 'text-[#f3f0e7] bg-[#f3f0e7]/10' : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7]'}`}
              title="Toggle Replace"
            >
              <Replace size={14} />
            </button>
          </div>
        </div>

        {/* Replace Input */}
        {showReplace && (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              placeholder="Replace"
              aria-label="Replace with"
              className="flex-1 rounded-2xl border border-[#f3f0e7]/15 bg-[#342f33] py-2.5 pl-3 pr-2 text-xs text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:border-[#f3f0e7]/40 focus:outline-none transition-all"
            />
            <button 
              onClick={handleReplaceAll}
              disabled={!searchQuery.trim() || results.length === 0}
              className="px-3 py-2 bg-[#f3f0e7] text-[#2a2529] hover:bg-white disabled:opacity-40 text-xs rounded-xl font-bold whitespace-nowrap shadow-md focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              aria-label="Replace all occurrences"
              title="Replace all occurrences"
            >
              All
            </button>
          </div>
        )}

        {/* Match count */}
        {searchQuery && (
          <div className="text-xs text-[#f3f0e7]/75 px-1 font-medium">
            {totalMatches} result{totalMatches !== 1 ? 's' : ''} in {results.length} file{results.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {searchQuery && results.length === 0 && (
          <div className="px-4 py-6 text-sm text-[#f3f0e7]/70 text-center">No results found</div>
        )}
        
        {results.map(result => {
          const file = files[result.fileId];
          if (!file) return null;
          const isExpanded = expandedResults.has(result.fileId);
          
          return (
            <div key={result.fileId} className="mb-0.5">
              <div 
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpand(result.fileId);
                  }
                }}
                className="flex cursor-pointer items-center px-2 py-1.5 text-[13px] text-[#f3f0e7]/90 hover:bg-[#342f33] active:bg-[#3d373c] rounded-xl mx-1 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                onClick={() => toggleExpand(result.fileId)}
              >
                {isExpanded ? <ChevronDown size={14} className="mr-1 flex-shrink-0 text-[#f3f0e7]/70" /> : <ChevronRight size={14} className="mr-1 flex-shrink-0 text-[#f3f0e7]/70" />}
                <FileText size={14} className="mr-1.5 text-[#f3f0e7]/70 flex-shrink-0" />
                <span className="truncate flex-1 font-medium">{file.name}</span>
                <span className="ml-2 rounded-full bg-[#342f33] border border-[#f3f0e7]/10 px-1.5 py-0.5 text-[10px] text-[#f3f0e7]/80 flex-shrink-0 font-mono">{result.matches.length}</span>
                {showReplace && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleReplaceInFile(result.fileId); }}
                    className="ml-1 p-1 text-[#f3f0e7]/70 hover:text-white hover:bg-white/10 rounded-lg focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                    aria-label={`Replace all in ${file.name}`}
                    title={`Replace all in ${file.name}`}
                  >
                    <Replace size={12} />
                  </button>
                )}
              </div>
              
              {isExpanded && (
                <div className="pl-6">
                  {result.matches.map((match, i) => (
                    <div 
                      key={i}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openFile(result.fileId);
                        }
                      }}
                      className="flex cursor-pointer items-center py-1 pr-2 text-xs text-[#f3f0e7]/80 hover:bg-[#342f33] hover:text-[#f3f0e7] rounded-lg mx-1 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                      onClick={() => openFile(result.fileId)}
                    >
                      <span className="w-8 flex-shrink-0 text-right text-[#f3f0e7]/60 mr-2 font-mono">{match.line}</span>
                      <span className="truncate font-mono text-[12px]">{match.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
