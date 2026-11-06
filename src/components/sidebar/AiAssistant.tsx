import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Key, X, Sparkles, Loader2, Plus, MessageSquare, Trash2, ChevronDown, ChevronRight, BrainCircuit, FileCode, CheckCircle2, AlertCircle, Square, ClipboardList, Zap, Settings2, Paperclip, RotateCw, Check, Search, TerminalSquare } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useAiStore, Message, AttachedFile } from '../../store/useAiStore';
import { useProblemsStore } from '../../store/useProblemsStore';
import { useOutputStore } from '../../store/useOutputStore';
import { useDynamicModels } from '../../hooks/useDynamicModels';
import SYSTEM_INSTRUCTION from '../../config/prompts/oorty_lite.txt?raw';
import { OortyLiteIcon } from '../ui/OortyLiteIcon';
import { SlashCommandPicker } from '../ai/SlashCommandPicker';
import { AtMentionPicker } from '../ai/AtMentionPicker';
import { MentionChip, MentionTag } from '../ai/MentionChip';
import { AgentSettingsPanel } from '../settings/AgentSettingsPanel';
import { AI_PROVIDERS, getProviderById, DEFAULT_AI_PROVIDER, DEFAULT_AI_MODEL } from '../../config/aiProviders';
import { useMcpStore, getMcpPromptContext } from '../../store/useMcpStore';
import { useSkillsStore, getSkillsPromptContext } from '../../store/useSkillsStore';

function ThinkBlock({ content, duration }: { content: string; duration?: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-2 border border-[#f3f0e7]/10 rounded-xl overflow-hidden w-full max-w-full bg-[#231e22]">
      <button 
        onClick={() => setExpanded(!expanded)} 
        className="w-full bg-[#231e22] hover:bg-[#342f33] px-3 py-2 text-[11px] font-mono text-[#f3f0e7]/75 flex items-center transition-colors border-b border-transparent focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none" 
        style={{ borderBottomColor: expanded ? 'rgba(243,240,231,0.1)' : 'transparent' }}
      >
        {expanded ? <ChevronDown size={14} className="mr-2 text-[#f3f0e7]/70" /> : <ChevronRight size={14} className="mr-2 text-[#f3f0e7]/70" />}
        <BrainCircuit size={14} className="mr-2 text-[#f3f0e7]/80" />
        Thought for {duration ? `${(duration / 1000).toFixed(1)} seconds` : 'a few seconds'}
      </button>
      {expanded && <pre className="p-3 text-[11px] overflow-x-auto bg-[#1a1720] text-[#f3f0e7]/75 whitespace-pre-wrap font-sans leading-relaxed">{content.trim()}</pre>}
    </div>
  );
}

function PlanBlock({ content, onComment }: { content: string, onComment?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="my-2 border border-[#f3f0e7]/15 rounded-xl overflow-hidden w-full max-w-full bg-[#231e22]">
      <div className="flex bg-[#342f33] transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 hover:bg-[#3d373c] px-3 py-2 text-[11px] font-mono text-[#f3f0e7] flex items-center text-left">
          {expanded ? <ChevronDown size={14} className="mr-2 shrink-0 text-[#f3f0e7]/70" /> : <ChevronRight size={14} className="mr-2 shrink-0 text-[#f3f0e7]/70" />}
          <ClipboardList size={14} className="mr-2 shrink-0 text-[#f3f0e7]" />
          <span className="truncate font-semibold">Implementation Plan</span>
        </button>
        {onComment && (
          <button 
            onClick={onComment}
            className="px-3 py-2 hover:bg-[#3d373c] text-[10px] font-bold text-[#f3f0e7]/80 uppercase tracking-wider flex items-center transition-colors border-l border-[#f3f0e7]/10"
            title="Add a comment to this plan"
          >
            <MessageSquare size={12} className="mr-1.5" /> Comment
          </button>
        )}
      </div>
      {expanded && <pre className="p-3 text-[11px] overflow-x-auto bg-[#1a1720] text-[#f3f0e7]/90 whitespace-pre-wrap font-sans leading-relaxed">{content.trim()}</pre>}
    </div>
  );
}

function StatusBlock({ content }: { content: string }) {
  return (
    <div className="my-1 flex items-center space-x-2 px-3 py-1.5 bg-[#342f33] border border-[#f3f0e7]/10 rounded-xl">
      <Zap size={12} className="text-[#f3f0e7] shrink-0" />
      <span className="text-[11px] text-[#f3f0e7]/80 font-mono">{content.trim()}</span>
    </div>
  );
}

function ToolResultBlock({ msg }: { msg: Message }) {
  const isError = msg.content.toLowerCase().includes('error');

  // Dedicated terminal command execution display
  if (msg.name === 'run_terminal_command' || msg.name === 'execute_terminal_command') {
    let parsed: any = null;
    try {
      parsed = JSON.parse(msg.content);
    } catch {}

    const exitCode = parsed?.exitCode ?? (isError ? 1 : 0);
    const command = parsed?.command || 'command';
    const output = parsed?.stdout || parsed?.stderr || msg.content;

    return (
      <div className="my-2 border border-[#f3f0e7]/15 rounded-xl overflow-hidden w-full max-w-full bg-[#1e1b20]">
        <div className="px-3 py-2 flex items-center justify-between border-b border-[#f3f0e7]/10 bg-[#2a2529]">
          <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
            <TerminalSquare size={13} className="text-emerald-400 flex-shrink-0" />
            <span className="text-[11px] font-mono font-bold text-[#f3f0e7] truncate">${command}</span>
          </div>
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
            exitCode === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}>
            exit {exitCode}
          </span>
        </div>
        {output && (
          <pre className="p-2.5 text-[10px] font-mono text-[#f3f0e7]/80 overflow-x-auto max-h-48 whitespace-pre-wrap bg-[#151217]">
            {output}
          </pre>
        )}
      </div>
    );
  }

  const toolLabel = msg.name === 'read_file' ? 'Read File' 
    : msg.name === 'write_file' || msg.name === 'write_new_file' ? 'Write File'
    : msg.name === 'edit_lines' ? 'Edited Lines'
    : msg.name === 'insert_lines' ? 'Inserted Lines'
    : msg.name === 'patch_file' ? 'Patched File'
    : msg.name === 'create_directory' ? 'Created Directory'
    : msg.name === 'list_dir' ? 'List Directory'
    : msg.name === 'lsp_get_diagnostics' ? 'LSP Diagnostics'
    : msg.name === 'lsp_get_symbols' ? 'LSP Symbols'
    : msg.name === 'lsp_find_definition' ? 'LSP Definition'
    : msg.name === 'aif_recall' ? 'AIF Boot Recall'
    : msg.name === 'aif_scratch' ? 'AIF Volatile Scratch'
    : msg.name === 'aif_note' ? 'AIF Cognitive Commit'
    : msg.name === 'aif_query' ? 'AIF Memory Query'
    : msg.name?.startsWith('mcp_') ? `MCP: ${msg.name.replace(/^mcp_/, '')}`
    : 'Tool Result';
  return (
    <div className="my-2 border border-[#f3f0e7]/10 rounded-xl overflow-hidden w-full max-w-full bg-[#231e22]">
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#f3f0e7]/10">
        <div className="flex items-center space-x-2">
          {isError ? <AlertCircle size={12} className="text-red-400" /> : <CheckCircle2 size={12} className="text-emerald-400" />}
          <span className="text-[10px] font-mono text-[#f3f0e7]/75 uppercase tracking-wider">{toolLabel}</span>
        </div>
      </div>
      <pre className="p-2.5 text-[10px] font-mono text-[#f3f0e7]/75 overflow-x-auto max-h-32">
        {msg.content.slice(0, 500)}{msg.content.length > 500 ? '...' : ''}
      </pre>
    </div>
  );
}

const PROVIDERS = AI_PROVIDERS;

export function AiAssistant() {
  const { files, updateFileContent, saveFile, createFile, isAiFullscreen, setAiFullscreen } = useIdeStore();
  const aiStore = useAiStore();
  const activeProvider = aiStore.provider || DEFAULT_AI_PROVIDER;
  const currentProvider = getProviderById(activeProvider);
  const currentKey = aiStore.apiKey;
  const selectedModel = aiStore.model || currentProvider.defaultModel;
  const isAiLoading = aiStore.isLoading;

  const { 
    models: dynamicModels, 
    isLoading: isModelsLoading,
    isLive: isModelsLive,
    refresh: refreshModels
  } = useDynamicModels(activeProvider, currentKey, aiStore.baseUrl);
  
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showQuickModelPicker, setShowQuickModelPicker] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [customModelText, setCustomModelText] = useState(aiStore.model || currentProvider.defaultModel);

  useEffect(() => {
    setCustomModelText(aiStore.model || currentProvider.defaultModel);
  }, [aiStore.model, activeProvider, currentProvider.defaultModel]);
  const [mentionQuery, setMentionQuery] = useState({ active: false, text: '', startIdx: 0 });
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = aiStore.sessions.find(s => s.id === aiStore.activeSessionId) || aiStore.sessions[0];
  const aiMessages = activeSession?.messages || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as string;
        setAttachments(prev => [...prev, { name: file.name, type: file.type || 'application/octet-stream', data }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [aiMessages, aiStore.streamingText]);

  const startNewSession = () => {
    const id = aiStore.createNewSession();
    aiStore.setActiveSession(id);
    setShowSessionList(false);
    setInput('');
  };

  const [activeMentionTags, setActiveMentionTags] = useState<MentionTag[]>([]);
  const [showSlashPicker, setShowSlashPicker] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [atQuery, setAtQuery] = useState('');

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const cursor = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursor);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1] || '';

    if (lastWord.startsWith('/')) {
      setShowSlashPicker(true);
      setSlashQuery(lastWord.slice(1));
      setShowAtPicker(false);
    } else if (lastWord.startsWith('@')) {
      setShowAtPicker(true);
      setAtQuery(lastWord.slice(1));
      setShowSlashPicker(false);
    } else {
      setShowSlashPicker(false);
      setShowAtPicker(false);
    }
  };

  const handleSelectSkillTag = (skill: { id: string; name: string }) => {
    setActiveMentionTags(prev => [...prev, { type: 'skill', id: skill.id, name: skill.name }]);
    // Remove the typed /skill command from input
    setInput(prev => prev.replace(/\/[a-zA-Z0-9_\-]*$/, ''));
    setShowSlashPicker(false);
    inputRef.current?.focus();
  };

  const handleSelectFileTag = (file: { id: string; name: string }) => {
    setActiveMentionTags(prev => [...prev, { type: 'file', id: file.id, name: file.name }]);
    // Remove typed @file command from input
    setInput(prev => prev.replace(/@[a-zA-Z0-9_\-\.]*$/, ''));
    setShowAtPicker(false);
    inputRef.current?.focus();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    const fileId = e.dataTransfer.getData('fileId');
    const fileName = e.dataTransfer.getData('fileName');
    if (fileName) {
      setActiveMentionTags(prev => [...prev, { type: 'file', id: fileId || fileName, name: fileName }]);
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && attachments.length === 0) || (!aiStore.apiKey && aiStore.provider !== 'openrouter')) return;
    
    const rawMentions = (input.match(/@([a-zA-Z0-9_.-]+)/g) || []).map(m => m.slice(1).replace(/[.,?!:;]+$/, ''));
    const mentions = Array.from(new Set(rawMentions));
    let contextString = '';
    
    if (mentions.includes('problems')) {
      const problems = useProblemsStore.getState().problems;
      const logs = useOutputStore.getState().consoleLogs;
      
      const pText = problems.length > 0 
        ? 'Editor Problems:\n' + problems.map((p: any) => `[${p.severity.toUpperCase()}] ${p.fileName}:${p.startLine}:${p.startCol} — ${p.message}`).join('\n') 
        : 'No editor problems detected.';
        
      const cText = logs && logs.length > 0 
        ? 'Preview Web Console Logs:\n' + logs.map((l: any) => `[${l.type.toUpperCase()}] ${l.args}`).join('\n') 
        : 'No preview console logs.';
        
      contextString += `\n<problems_context>\n${pText}\n\n${cText}\n</problems_context>\n`;
    }

    // Active mention tags (skills & tagged files)
    const skillTags = activeMentionTags.filter(t => t.type === 'skill');
    if (skillTags.length > 0) {
      const loadedSkills = (window as any).__skills || [];
      skillTags.forEach(st => {
        contextString += `\n\n<active_skill name="${st.name}">\nActive Skill Instructions applied.\n</active_skill>\n`;
      });
    }

    const fileMentions = mentions.filter(m => m !== 'problems');
    const fileTagNames = activeMentionTags.filter(t => t.type === 'file').map(t => t.name);
    const combinedFileMentions = Array.from(new Set([...fileMentions, ...fileTagNames]));
    if (combinedFileMentions.length > 0) {
      const taggedFiles = Object.values(files).filter(f => f.type === 'file' && combinedFileMentions.includes(f.name));
      if (taggedFiles.length > 0) {
        contextString += '\n\n<tagged_files>\n' + taggedFiles.map(f => {
          const buildPath = (nodeId: string): string => {
            const node = files[nodeId];
            if (!node || !node.parentId || nodeId === 'root') return '';
            const parentPath = buildPath(node.parentId);
            return parentPath ? `${parentPath}/${node.name}` : node.name;
          };
          const fileId = Object.entries(files).find(([_, n]) => n === f)?.[0] || '';
          const fullPath = fileId ? buildPath(fileId) : f.name;
          return `<file path="${fullPath}">\n${f.content || ''}\n</file>`;
        }).join('\n\n') + '\n</tagged_files>';
      }
    }

    const buildPathForNode = (nodeId: string): string => {
      const node = files[nodeId];
      if (!node || !node.parentId || nodeId === 'root') return '';
      const parentPath = buildPathForNode(node.parentId);
      return parentPath ? `${parentPath}/${node.name}` : node.name;
    };
    const fileTreeItems = Object.entries(files)
      .filter(([id, f]) => f.type === 'file' && id !== 'root')
      .map(([id]) => `  - ${buildPathForNode(id)}`)
      .join('\n');

    const activeFile = useIdeStore.getState().activeFileId;
    let activeFileContext = '';
    if (activeFile && files[activeFile]) {
      const af = files[activeFile];
      const afPath = buildPathForNode(activeFile);
      activeFileContext = `\n<active_file path="${afPath}" language="${af.language || 'text'}" />\n`;
    }

    const projectName = files['root']?.name || 'Untitled Project';
    const projectContext = `\n<project_context>\nProject Name: ${projectName}\nWorking Directory: ${projectName}/\nAll file paths are relative to the project root ("${projectName}/").\nWhen using read_file or edit tools, use paths relative to the project root (e.g., "src/App.tsx").\n</project_context>\n`;

    const mcpServers = useMcpStore.getState().servers;
    const mcpContext = getMcpPromptContext(mcpServers);
    const skills = useSkillsStore.getState().skills;
    const skillsContext = getSkillsPromptContext(skills);

    const systemContext = [
      SYSTEM_INSTRUCTION,
      mcpContext ? `\n\n${mcpContext}\n` : '',
      skillsContext ? `\n\n${skillsContext}\n` : '',
      projectContext,
      `\n<project_file_tree>\n${fileTreeItems}\n</project_file_tree>\n`,
      activeFileContext,
      contextString
    ].filter(Boolean).join('');

    const currentInput = input;
    const currentAttachments = [...attachments];
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setAttachments([]);
    setMentionQuery({ active: false, text: '', startIdx: 0 });

    const prov = getProviderById(aiStore.provider || DEFAULT_AI_PROVIDER);
    // Preserve a user-configured base URL, but still switch to the new
    // provider's default when the stored value is another known default.
    const knownDefaultUrls = AI_PROVIDERS.map(p => p.baseUrl).filter(Boolean);
    if (!aiStore.baseUrl || knownDefaultUrls.includes(aiStore.baseUrl)) {
      aiStore.setBaseUrl(prov.baseUrl || '');
    }

    let sessionId = activeSession?.id;
    if (!sessionId) {
      sessionId = aiStore.createNewSession();
    }

    await aiStore.sendMessage(sessionId, currentInput, systemContext, currentAttachments);
  };

  const applyCode = (filename: string, content: string) => {
    const buildPath = (nodeId: string): string => {
      const node = files[nodeId];
      if (!node || !node.parentId || nodeId === 'root') return '';
      const parentPath = buildPath(node.parentId);
      return parentPath ? `${parentPath}/${node.name}` : node.name;
    };

    const fileEntry = Object.entries(files).find(([id, f]) => {
      if (f.type !== 'file') return false;
      return f.name === filename || buildPath(id) === filename;
    });

    if (fileEntry) { 
      updateFileContent(fileEntry[0], content); 
      saveFile(fileEntry[0]); 
    } else { 
      const id = createFile(filename.split('/').pop() || filename, 'root', 'file', content); 
      saveFile(id); 
    }
  };

  const getModifiedFiles = (msg: Message) => {
    const filesModified = new Set<string>();
    
    const regex = /<edit(?: file="([^"]*)")?>/g;
    let match;
    while ((match = regex.exec(msg.content)) !== null) {
      if (match[1]) filesModified.add(match[1].split('/').pop() || match[1]);
    }

    if (msg.tool_calls) {
      msg.tool_calls.forEach(call => {
        const name = call.function?.name;
        if (name && ['edit_lines', 'insert_lines', 'patch_file', 'write_new_file'].includes(name)) {
          try {
            const args = JSON.parse(call.function.arguments);
            if (args.path) filesModified.add(args.path.split('/').pop() || args.path);
          } catch { }
        }
      });
    }
    
    return Array.from(filesModified);
  };

  const renderMessageContent = (content: string, msg: Message) => {
    if (msg.role === 'tool') return <ToolResultBlock msg={msg} />;

    if (msg.tool_calls && msg.tool_calls.length > 0 && (!content || content.trim() === '')) {
      return (
        <div className="flex items-center gap-2 text-xs text-[#f3f0e7]/60 italic py-1">
          <Loader2 size={12} className="animate-spin text-[#f3f0e7]" />
          <span>Using {msg.tool_calls.map(tc => tc.function?.name || tc.name || 'tool').join(', ')}...</span>
        </div>
      );
    }

    if (!content || content.trim() === '') return null;
    
    const hasTags = content.includes('<ans>') || content.includes('<edit ') || content.includes('<plan>') || content.includes('<status>');
    
    if (!hasTags) {
      const rendered = content.replace(/```([a-z]*)\n([\s\S]*?)```/g, (_m, _lang, code) => code);
      return <span key="fallback" className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed break-words block">{rendered}</span>;
    }

    const rawParts = content.split(/(<ans>[\s\S]*?(?:<\/ans>|$)|<edit(?: file="[^"]*")?>[\s\S]*?(?:<\/edit>|$)|<plan>[\s\S]*?(?:<\/plan>|$)|<status>[\s\S]*?(?:<\/status>|$))/g);
    
    const parts: string[] = [];
    rawParts.forEach(p => {
      if (!p) return;
      const isTag = p.startsWith('<ans>') || p.startsWith('<edit ') || p.startsWith('<plan>') || p.startsWith('<status>');
      const last = parts[parts.length - 1];
      const lastIsTag = last && (last.startsWith('<ans>') || last.startsWith('<edit ') || last.startsWith('<plan>') || last.startsWith('<status>'));

      if (isTag || !last || lastIsTag) {
        parts.push(p);
      } else {
        parts[parts.length - 1] += p;
      }
    });

    return parts.map((part, i) => {
      if (!part || (part.trim() === '' && !part.startsWith('<ans>'))) return null;

      if (part.startsWith('<ans>')) {
        const ansContent = part.replace(/^<ans>/, '').replace(/<\/ans>$/, '');
        const rendered = ansContent.replace(/```([a-z]*)\n([\s\S]*?)```/g, (_m, _lang, code) => code);
        return <span key={i} className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed break-words block mb-2">{rendered}</span>;
      }

      if (part.startsWith('<plan>')) {
        const planContent = part.replace(/^<plan>/, '').replace(/<\/plan>$/, '');
        return <PlanBlock key={i} content={planContent} onComment={() => {
          setInput(prev => prev + (prev.trim() ? '\n' : '') + 'Regarding your implementation plan: \n\n');
          setTimeout(() => inputRef.current?.focus(), 10);
        }} />;
      }

      if (part.startsWith('<status>')) {
        const statusContent = part.replace(/^<status>/, '').replace(/<\/status>$/, '');
        return <StatusBlock key={i} content={statusContent} />;
      }

      if (part.startsWith('<edit')) {
        const match = part.match(/<edit(?: file="([^"]*)")?>([\s\S]*?)(?:<\/edit>|$)/);
        if (match) {
          const filename = match[1] || 'untitled', code = match[2].trim();
          const isClosed = part.includes('</edit>');
          return (
            <div key={i} className="my-2 border border-[#f3f0e7]/10 rounded-xl overflow-hidden w-full max-w-full">
              <div className="bg-[#231e22] px-3 py-1.5 text-xs font-mono text-[#f3f0e7]/80 flex justify-between items-center truncate border-b border-[#f3f0e7]/10">
                <div className="flex items-center space-x-2 min-w-0"><FileCode size={14} className="text-[#f3f0e7]/70" /><span className="truncate">{filename}</span></div>
                {isClosed && (
                  <button onClick={() => applyCode(filename, code)} className="bg-[#f3f0e7] hover:bg-white text-[#2a2529] px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase transition-colors shrink-0">Apply</button>
                )}
              </div>
              <pre className="p-3 text-[11px] overflow-x-auto bg-[#1a1720] text-[#f3f0e7]/80 whitespace-pre-wrap">{code}</pre>
            </div>
          );
        }
      }

      const duration = msg.completedAt ? msg.completedAt - msg.timestamp : undefined;
      return <ThinkBlock key={i} content={part} duration={duration} />;
    });
  };

  // Settings panel
  if (showSettings) {
    return (
      <div className="flex h-full flex-col bg-[#2a2529] text-[#f3f0e7]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f3f0e7]/10 shrink-0 bg-[#231e22]">
          <div className="flex items-center space-x-2">
            <Bot size={18} className="text-[#f3f0e7]" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#f3f0e7]">Model Configurations</h3>
          </div>
          <button onClick={() => setShowSettings(false)} className="p-1.5 text-[#f3f0e7]/60 hover:text-[#f3f0e7] rounded-lg hover:bg-[#f3f0e7]/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <h4 className="text-[10px] text-[#f3f0e7]/50 font-black uppercase tracking-[0.2em] mb-3 block">Saved Models</h4>
            <div className="space-y-2">
              {aiStore.savedModels.map(model => (
                <div key={model.id} className="flex items-center justify-between bg-[#342f33] px-3.5 py-2.5 rounded-xl border border-[#f3f0e7]/10">
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => aiStore.setActiveSavedModel(model.id)}
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${aiStore.activeModelId === model.id ? 'border-[#f3f0e7] bg-[#f3f0e7]/20' : 'border-[#f3f0e7]/40'}`}
                    >
                      {aiStore.activeModelId === model.id && <div className="w-1.5 h-1.5 rounded-full bg-[#f3f0e7]" />}
                    </button>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-[#f3f0e7]">{model.name}</span>
                      <span className="text-[9px] text-[#f3f0e7]/50 font-mono mt-0.5">{model.provider} / {model.model}</span>
                    </div>
                  </div>
                  <button onClick={() => aiStore.removeSavedModel(model.id)} className="text-[#f3f0e7]/40 hover:text-red-400 p-1.5 transition-colors rounded-lg hover:bg-[#f3f0e7]/5">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {aiStore.savedModels.length === 0 && (
                <div className="text-[11px] text-[#f3f0e7]/50 italic p-4 text-center border border-dashed border-[#f3f0e7]/15 rounded-xl">
                  No saved models yet. Create one below to continue.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#f3f0e7]/10 pt-6 space-y-6">
            <h4 className="text-[10px] text-[#f3f0e7]/80 font-black uppercase tracking-[0.2em] mb-3 block">Add New Configuration</h4>
            <div>
              <label className="text-[10px] text-[#f3f0e7]/50 font-black uppercase tracking-[0.2em] mb-3 block">Infrastructure Provider</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(provider => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      aiStore.setProvider(provider.id);
                      aiStore.setModel(provider.defaultModel);
                      aiStore.setBaseUrl(provider.baseUrl);
                    }}
                  className={`px-3 py-2.5 rounded-xl text-xs text-center border transition-all duration-200 ${
                    activeProvider === provider.id
                      ? 'bg-[#f3f0e7]/15 text-[#f3f0e7] border-[#f3f0e7]/40 font-bold'
                      : 'bg-[#342f33] text-[#f3f0e7]/60 border-[#f3f0e7]/10 hover:border-[#f3f0e7]/30'
                  }`}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {(currentProvider?.allowCustomBaseUrl || activeProvider === 'custom' || activeProvider === 'ollama') && (
              <div>
                <label className="text-[10px] text-[#f3f0e7]/50 font-black uppercase tracking-[0.2em] mb-2 block">
                  API Base URL {activeProvider === 'custom' && '(OpenAI Compatible)'}
                </label>
                <input
                  type="text"
                  value={aiStore.baseUrl !== undefined ? aiStore.baseUrl : (currentProvider.baseUrl || '')}
                  onChange={(e) => aiStore.setBaseUrl(e.target.value)}
                  placeholder={currentProvider.baseUrl || 'http://localhost:8080/v1'}
                  className="w-full bg-[#231e22] border border-[#f3f0e7]/15 rounded-xl px-4 py-3 text-sm text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40 focus:outline-none transition-all font-mono"
                />
                <p className="text-[10px] text-[#f3f0e7]/40 mt-1">
                  {activeProvider === 'custom' 
                    ? 'Target URL of any OpenAI-compatible server (e.g. vLLM, LM Studio, Ollama /v1)' 
                    : activeProvider === 'ollama'
                    ? 'Ollama endpoint (e.g. http://localhost:11434)'
                    : 'Override default API host endpoint'}
                </p>
              </div>
            )}

            <div>
              <label className="text-[10px] text-[#f3f0e7]/50 font-black uppercase tracking-[0.2em] mb-2 block">
                Secret Key {(!currentProvider.requiresKey || activeProvider === 'custom' || activeProvider === 'ollama') ? '(Optional)' : ''}
              </label>
              <input
                type="text"
                value={currentKey}
                onChange={(e) => aiStore.setApiKey(e.target.value)}
                placeholder={currentProvider.placeholder}
                className="w-full bg-[#231e22] border border-[#f3f0e7]/15 rounded-xl px-4 py-3 text-sm text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40 focus:outline-none transition-all font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <label className="text-[10px] text-[#f3f0e7]/50 font-black uppercase tracking-[0.2em] block">Deployment Model</label>
                  {isModelsLive && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Live ({dynamicModels.length})
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => refreshModels()}
                  disabled={isModelsLoading}
                  className="flex items-center space-x-1 text-[10px] text-[#f3f0e7]/60 hover:text-[#f3f0e7] disabled:opacity-40 transition-colors"
                  title="Refresh models list"
                >
                  <RotateCw size={11} className={isModelsLoading ? 'animate-spin' : ''} />
                  <span>{isModelsLoading ? 'Syncing...' : 'Sync Models'}</span>
                </button>
              </div>

              {dynamicModels.length > 0 && (
                <div className="mb-2">
                  <select
                    value={dynamicModels.some(m => m.id === customModelText) ? customModelText : '__custom__'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && val !== '__custom__') {
                        setCustomModelText(val);
                        aiStore.setModel(val);
                      }
                    }}
                    className="w-full bg-[#231e22] border border-[#f3f0e7]/15 rounded-xl px-3 py-2.5 text-xs text-[#f3f0e7] focus:border-[#f3f0e7]/40 focus:outline-none transition-all font-mono"
                  >
                    <option value="" disabled>Select from endpoint models ({dynamicModels.length})...</option>
                    {dynamicModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                    {!dynamicModels.some(m => m.id === customModelText) && customModelText && (
                      <option value="__custom__">
                        Custom Model: {customModelText}
                      </option>
                    )}
                  </select>
                </div>
              )}

              <input
                type="text"
                value={customModelText}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomModelText(val);
                  aiStore.setModel(val);
                }}
                className="w-full bg-[#231e22] border border-[#f3f0e7]/15 rounded-xl px-4 py-3 text-sm text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40 focus:outline-none transition-all font-mono"
                placeholder="Or type any custom model ID..."
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 flex-shrink-0 border-t border-[#f3f0e7]/10 bg-[#231e22]">
          <button 
            onClick={() => {
              const canSave = currentKey || !currentProvider.requiresKey || activeProvider === 'openrouter' || activeProvider === 'ollama' || activeProvider === 'custom';
              if (canSave) {
                aiStore.addSavedModel({
                  id: Date.now().toString(36),
                  name: `${currentProvider.name} - ${selectedModel}`,
                  provider: activeProvider,
                  model: selectedModel,
                  apiKey: currentKey,
                  baseUrl: aiStore.baseUrl || currentProvider.baseUrl
                });
                setShowSettings(false);
              }
            }}
            disabled={currentProvider.requiresKey && !currentKey && activeProvider !== 'openrouter' && activeProvider !== 'ollama' && activeProvider !== 'custom'}
            className="w-full bg-[#f3f0e7] text-[#2a2529] hover:bg-white disabled:opacity-40 py-3.5 rounded-2xl text-sm font-bold transition-all shadow-lg active:scale-[0.98]"
          >
            Save Model Configuration
          </button>
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="flex h-full flex-col relative w-full overflow-hidden bg-[#2a2529] text-[#f3f0e7]">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f3f0e7]/10 flex-shrink-0 bg-[#231e22] z-30">
        <div 
          onClick={() => setShowQuickModelPicker(!showQuickModelPicker)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowQuickModelPicker(!showQuickModelPicker);
            }
          }}
          className="flex items-center space-x-2.5 cursor-pointer hover:opacity-85 transition-opacity select-none focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded-xl p-1"
          role="button"
          tabIndex={0}
          aria-label="Switch AI model"
          title="Click to quickly switch models"
        >
          <div className="w-7 h-7 rounded-xl bg-[#342f33] border border-[#f3f0e7]/15 flex items-center justify-center relative overflow-hidden">
            <OortyLiteIcon size={16} />
            {isModelsLive && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[#231e22]" />
            )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-[#f3f0e7] leading-none">Oorty Lite</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f3f0e7]/10 text-[#f3f0e7]/80 font-mono leading-none">
                {currentProvider.name}
              </span>
              <ChevronDown size={11} className="text-[#f3f0e7]/70" />
            </div>
            <span className="text-[9px] text-[#f3f0e7]/70 font-mono truncate max-w-[150px] mt-0.5">
              {currentProvider.requiresKey && !currentKey ? 'No API key set' : (aiStore.model || currentProvider.defaultModel)}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button 
            onClick={() => setShowSessionList(!showSessionList)} 
            className="p-2 text-[#f3f0e7]/75 hover:text-[#f3f0e7] rounded-xl hover:bg-[#f3f0e7]/10 transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            title="View conversations"
            aria-label="View conversations list"
          >
            <MessageSquare size={16} />
          </button>
          <div className="relative">
            <button 
              onClick={() => setShowModelDropdown(!showModelDropdown)} 
              className="p-2 text-[#f3f0e7]/75 hover:text-[#f3f0e7] rounded-xl hover:bg-[#f3f0e7]/10 transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              title="Saved models and API settings"
              aria-label="Saved models and settings"
              aria-haspopup="true"
              aria-expanded={showModelDropdown}
            >
              <Key size={16} />
            </button>
            {showModelDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModelDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#342f33] border border-[#f3f0e7]/15 rounded-2xl shadow-2xl z-50 p-2 animate-scale-in">
                  <div className="text-[10px] text-[#f3f0e7]/70 font-black uppercase tracking-[0.2em] mb-2 px-2 mt-1">Saved Models</div>
                  <div className="flex flex-col mb-1 max-h-[300px] overflow-y-auto">
                    {aiStore.savedModels.map(m => (
                      <button 
                        key={m.id} 
                        onClick={() => { aiStore.setActiveSavedModel(m.id); setShowModelDropdown(false); }} 
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex flex-col transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                          aiStore.activeModelId === m.id ? 'bg-[#f3f0e7]/15 text-[#f3f0e7] font-bold' : 'text-[#f3f0e7]/70 hover:bg-[#f3f0e7]/5'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{m.name}</span>
                          {aiStore.activeModelId === m.id && <CheckCircle2 size={12} className="text-[#f3f0e7] shrink-0" />}
                        </div>
                        <span className="text-[9px] opacity-60 truncate font-mono mt-0.5">{m.provider} - {m.model}</span>
                      </button>
                    ))}
                    {aiStore.savedModels.length === 0 && (
                      <div className="px-3 py-4 text-center text-[10px] text-[#f3f0e7]/70">
                        No saved configurations.
                      </div>
                    )}
                  </div>
                  <div className="p-1 border-t border-[#f3f0e7]/10 mt-1">
                    <button 
                      onClick={() => { setShowModelDropdown(false); setShowSettings(true); }} 
                      className="w-full py-2 bg-[#f3f0e7]/10 hover:bg-[#f3f0e7]/20 rounded-xl text-xs font-semibold text-[#f3f0e7] transition-colors flex items-center justify-center space-x-2 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                      aria-label="Configure AI models"
                    >
                       <Settings2 size={14} />
                       <span>Configure Models</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick Model Picker popover */}
      {showQuickModelPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowQuickModelPicker(false)} />
          <div className="absolute left-3 top-14 w-80 max-w-[calc(100vw-24px)] bg-[#342f33] border border-[#f3f0e7]/15 rounded-2xl shadow-2xl z-50 p-3 flex flex-col max-h-[460px] animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-[#f3f0e7]/10">
              <div className="flex items-center space-x-2">
                <Sparkles size={14} className="text-[#f3f0e7]" />
                <span className="text-xs font-bold text-[#f3f0e7]">Quick Model Switch</span>
                {isModelsLive && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => refreshModels()}
                  disabled={isModelsLoading}
                  className="p-1 rounded-lg hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/75 hover:text-[#f3f0e7] disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                  title="Sync models from API"
                  aria-label="Sync models from API"
                >
                  <RotateCw size={13} className={isModelsLoading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setShowQuickModelPicker(false)}
                  className="p-1 rounded-lg hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/75 hover:text-[#f3f0e7] transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                  aria-label="Close model picker"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Search filter */}
            <div className="relative my-2">
              <Search size={13} className="absolute left-2.5 top-2.5 text-[#f3f0e7]/70" />
              <input
                type="text"
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
                placeholder={`Filter ${dynamicModels.length} models...`}
                aria-label="Filter models"
                className="w-full bg-[#231e22] border border-[#f3f0e7]/15 rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#f3f0e7] placeholder-[#f3f0e7]/50 focus:outline-none focus:border-[#f3f0e7]/35 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 font-mono"
                autoFocus
              />
            </div>

            {/* API key missing warning banner */}
            {currentProvider.requiresKey && !currentKey && (
              <div className="p-2.5 mb-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between">
                <span className="text-[11px] font-medium leading-tight">API key needed for {currentProvider.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickModelPicker(false);
                    setShowSettings(true);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-amber-400 text-[#2a2529] text-[10px] font-bold hover:bg-amber-300 transition-colors shrink-0 ml-2 cursor-pointer"
                >
                  Configure
                </button>
              </div>
            )}

            {/* Model item list */}
            <div className="flex-1 overflow-y-auto space-y-1 py-1 pr-1 custom-scrollbar min-h-[140px] max-h-[260px]">
              {dynamicModels
                .filter(m => !modelSearchQuery.trim() || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()) || (m.name && m.name.toLowerCase().includes(modelSearchQuery.toLowerCase())))
                .map(m => {
                  const hasValidKey = !currentProvider.requiresKey || !!currentKey;
                  const isSelected = hasValidKey && (aiStore.model ? aiStore.model === m.id : currentProvider.defaultModel === m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        aiStore.setModel(m.id);
                        setShowQuickModelPicker(false);
                        setModelSearchQuery('');
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                        isSelected
                          ? 'bg-[#f3f0e7]/15 text-[#f3f0e7] font-bold border border-[#f3f0e7]/20'
                          : 'text-[#f3f0e7]/80 hover:bg-[#f3f0e7]/5 border border-transparent'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate text-xs">{m.name || m.id}</span>
                        {m.name && m.name !== m.id && (
                          <span className="truncate text-[9px] text-[#f3f0e7]/70 font-mono">{m.id}</span>
                        )}
                      </div>
                      {isSelected && <Check size={13} className="text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              {dynamicModels.filter(m => !modelSearchQuery.trim() || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())).length === 0 && (
                <div className="text-center py-4 text-[11px] text-[#f3f0e7]/70">
                  No matching models found.
                </div>
              )}
              {modelSearchQuery.trim() && !dynamicModels.some(m => m.id.toLowerCase() === modelSearchQuery.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => {
                    const customName = modelSearchQuery.trim();
                    setCustomModelText(customName);
                    aiStore.setModel(customName);
                    setShowQuickModelPicker(false);
                    setModelSearchQuery('');
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between transition-colors bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 mt-1"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-xs text-white">Use Custom Model</span>
                    <span className="truncate text-[10px] font-mono text-emerald-300">{modelSearchQuery.trim()}</span>
                  </div>
                  <Check size={13} className="text-emerald-400 shrink-0" />
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[#f3f0e7]/10 flex items-center justify-between text-[10px] text-[#f3f0e7]/70">
              <span className="font-mono">
                {dynamicModels.length} models {isModelsLive ? 'synced' : 'loaded'}
              </span>
              <button
                onClick={() => {
                  setShowQuickModelPicker(false);
                  setShowSettings(true);
                }}
                className="text-[#f3f0e7]/90 hover:text-white flex items-center space-x-1 font-semibold focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded p-0.5"
                aria-label="Configure models in settings"
              >
                <Settings2 size={11} />
                <span>Configure</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Session list overlay */}
      {showSessionList && (
        <div className="absolute inset-x-0 top-[52px] bottom-0 bg-[#2a2529] z-[45] flex flex-col border-r border-[#f3f0e7]/10 animate-slide-in-right">
          <div className="p-4 border-b border-[#f3f0e7]/10 flex items-center justify-between">
            <span className="text-[10px] font-black text-[#f3f0e7]/70 uppercase tracking-[0.2em]">Conversations</span>
            <button 
              onClick={startNewSession} 
              className="p-2 bg-[#f3f0e7] text-[#2a2529] rounded-xl hover:bg-white transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none shadow-md"
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {aiStore.sessions.map(session => (
              <div key={session.id} className="flex items-center group">
                <button
                  onClick={() => {
                    aiStore.setActiveSession(session.id);
                    setShowSessionList(false);
                  }}
                  className={`flex-1 text-left px-3.5 py-3 rounded-xl text-xs transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${
                    aiStore.activeSessionId === session.id
                      ? 'bg-[#342f33] text-[#f3f0e7] font-semibold border border-[#f3f0e7]/15'
                      : 'text-[#f3f0e7]/75 hover:bg-[#f3f0e7]/5'
                  }`}
                >
                  <div className="truncate">
                    {session.messages[session.messages.length - 1]?.content.slice(0, 30) || 'New Conversation'}
                  </div>
                  <div className="text-[9px] opacity-60 mt-1">{new Date(session.id).toLocaleString()}</div>
                </button>
                <button 
                  onClick={() => aiStore.deleteSession(session.id)}
                  className="p-2 text-[#f3f0e7]/70 hover:text-red-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:outline-none rounded-lg"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth pb-24">
        {aiMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-6">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-[#f3f0e7]/10 blur-xl rounded-full animate-pulse-glow" />
              <div className="relative w-16 h-16 rounded-2xl bg-[#342f33] border border-[#f3f0e7]/15 flex items-center justify-center shadow-xl overflow-hidden p-3">
                <OortyLiteIcon size={36} />
              </div>
            </div>
            <h3 className="text-base font-bold text-[#f3f0e7] mb-1">Oorty Lite</h3>
            <p className="text-xs text-[#f3f0e7]/60 leading-relaxed max-w-[240px]">
              Tag files with <span className="text-[#f3f0e7] font-mono font-semibold">@</span> · Ask anything · Build faster
            </p>

            {!aiStore.apiKey && aiStore.provider !== 'openrouter' && (
              <button
                onClick={() => setShowSettings(true)}
                className="mt-4 flex items-center space-x-2 bg-[#f3f0e7] text-[#2a2529] hover:bg-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              >
                <Key size={14} />
                <span>Add API Key to Begin</span>
              </button>
            )}

            <div className="mt-8 flex flex-col gap-2 w-full max-w-[280px]">
              {['@App.tsx fix the layout', 'Optimize @index.css', 'Create a new utility file'].map(suggestion => (
                <button 
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-left px-3.5 py-2.5 text-[11px] font-medium text-[#f3f0e7]/75 bg-[#342f33] rounded-xl hover:bg-[#3d373c] hover:text-[#f3f0e7] transition-all border border-[#f3f0e7]/10 truncate focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {aiMessages.filter(m => {
          if (m.role === 'system') return false;
          if (m.role === 'assistant' && (!m.content || m.content.trim() === '') && (!m.tool_calls || m.tool_calls.length === 0)) return false;
          return true;
        }).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full animate-fade-in`}>
            <div className={`max-w-[100%] rounded-2xl px-4 py-3 ${
              msg.role === 'user' 
                ? 'bg-[#f3f0e7] text-[#2a2529] rounded-br-sm shadow-md font-medium' 
                : msg.role === 'tool'
                  ? 'bg-transparent w-full px-0 py-0'
                  : 'bg-[#342f33] text-[#f3f0e7] border border-[#f3f0e7]/10 rounded-bl-sm w-full shadow-md'
            }`}>
              {msg.role !== 'user' ? (
                <>
                  {renderMessageContent(msg.content, msg)}
                  {msg.role === 'assistant' && (() => {
                    const modified = getModifiedFiles(msg);
                    if (modified.length === 0) return null;
                    return (
                      <div className="mt-3 pt-2.5 border-t border-[#f3f0e7]/10 flex flex-wrap items-center gap-1.5 animate-fade-in">
                        <span className="text-[10px] font-bold text-[#f3f0e7]/75 uppercase tracking-widest shrink-0">
                          Modified ({modified.length})
                        </span>
                        {modified.map((file, idx) => (
                          <div key={idx} className="flex items-center space-x-1.5 px-2 py-0.5 bg-[#231e22] border border-[#f3f0e7]/10 rounded-md shadow-sm">
                            <FileCode size={12} className="text-[#f3f0e7]/70" />
                            <span className="text-[10px] font-mono text-[#f3f0e7]/80">{file}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex flex-col space-y-2">
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-1">
                      {msg.attachments.map((att: any, idx: number) => (
                        att.type.startsWith('image/') ? (
                          <img key={idx} src={att.data} alt={att.name} className="w-48 max-w-full rounded-xl object-contain border border-[#2a2529]/20" />
                        ) : (
                          <div key={idx} className="flex items-center space-x-2 bg-[#2a2529]/10 px-3 py-1.5 rounded-xl border border-[#2a2529]/20">
                            <span className="text-[11px] font-mono text-[#2a2529]">{att.name}</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed break-words">{msg.content}</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isAiLoading && (
          <div className="flex justify-start w-full animate-fade-in pb-4">
            {aiStore.streamingText ? (
              <div className="max-w-[100%] rounded-2xl px-4 py-3 bg-[#342f33] border border-[#f3f0e7]/15 shadow-md w-full border-l-2 border-l-[#f3f0e7]/50">
                {renderMessageContent(aiStore.streamingText, { 
                  role: 'assistant', 
                  content: aiStore.streamingText,
                  timestamp: Date.now() 
                } as any)}
                <span className="inline-block w-1.5 h-4 bg-[#f3f0e7] ml-0.5 animate-pulse align-middle" />
              </div>
            ) : (
              <div className="bg-[#342f33] border border-[#f3f0e7]/10 rounded-2xl px-4 py-3 flex items-center space-x-2.5 shadow-md">
                <style>{`
                  @keyframes aiSoundWave {
                    0%, 100% { height: 6px; }
                    50% { height: 18px; }
                  }
                `}</style>
                <div className="flex items-center space-x-1 h-5">
                  <div className="w-1 bg-[#f3f0e7] rounded-full animate-[aiSoundWave_1s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
                  <div className="w-1 bg-[#f3f0e7] rounded-full animate-[aiSoundWave_1s_ease-in-out_infinite]" style={{ animationDelay: '200ms' }} />
                  <div className="w-1 bg-[#f3f0e7] rounded-full animate-[aiSoundWave_1s_ease-in-out_infinite]" style={{ animationDelay: '400ms' }} />
                </div>
                <span className="text-xs font-semibold text-[#f3f0e7]/70 uppercase tracking-widest ml-1">Thinking...</span>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Slash Command Picker (/ skill) */}
      {showSlashPicker && (
        <div className="relative px-3">
          <SlashCommandPicker
            query={slashQuery}
            onSelectSkill={handleSelectSkillTag}
            onClose={() => setShowSlashPicker(false)}
          />
        </div>
      )}

      {/* At Mention Picker (@ file) */}
      {showAtPicker && (
        <div className="relative px-3">
          <AtMentionPicker
            query={atQuery}
            onSelectFile={handleSelectFileTag}
            onClose={() => setShowAtPicker(false)}
          />
        </div>
      )}

      {/* Input Section */}
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDropFile}
        className="p-3 border-t border-[#f3f0e7]/10 flex-shrink-0 bg-[#231e22] z-40 relative pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          multiple 
          accept="image/*,text/*,application/json,application/javascript,text/typescript" 
          className="hidden" 
        />
        
        {/* Active Mention Chips & File Attachments */}
        {(activeMentionTags.length > 0 || attachments.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {activeMentionTags.map((tag, i) => (
              <MentionChip
                key={`${tag.type}-${tag.name}-${i}`}
                tag={tag}
                onRemove={() => setActiveMentionTags(prev => prev.filter((_, idx) => idx !== i))}
              />
            ))}
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center space-x-1.5 bg-[#342f33] border border-[#f3f0e7]/15 rounded-xl px-2.5 py-1 shadow-md">
                {att.type.startsWith('image/') ? (
                  <img src={att.data} alt={att.name} className="w-4 h-4 object-cover rounded-[2px]" />
                ) : (
                  <Paperclip size={12} className="text-[#f3f0e7]/70" />
                )}
                <span className="text-[10px] text-[#f3f0e7]/80 truncate max-w-[120px] font-medium">{att.name}</span>
                <button 
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} 
                  className="text-[#f3f0e7]/70 hover:text-red-400 ml-1 transition-colors p-0.5 rounded-md focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                  aria-label={`Remove attachment ${att.name}`}
                  title={`Remove attachment ${att.name}`}
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end space-x-2 bg-[#342f33] border border-[#f3f0e7]/15 rounded-2xl px-2 py-1.5 focus-within:border-[#f3f0e7]/40 transition-all shadow-inner">
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="p-2 text-[#f3f0e7]/70 hover:text-[#f3f0e7] rounded-xl transition-all flex-shrink-0 active:scale-95 mb-0.5 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            aria-label="Attach files"
            title="Attach files"
          >
            <Plus size={20} />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              handleInput(e);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (!isAiLoading) {
                  e.preventDefault();
                  sendMessage();
                }
              }
            }}
            placeholder="Build something incredible..."
            aria-label="AI prompt input"
            className="flex-1 min-w-0 bg-transparent py-2.5 text-sm text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:outline-none resize-none max-h-32 leading-relaxed"
          />
          <div className="flex items-center pr-1 pb-1 space-x-1">
            {isAiLoading ? (
              <button
                onClick={() => aiStore.abortChat()}
                className="p-2 bg-[#f3f0e7]/20 border border-[#f3f0e7]/30 text-[#f3f0e7] hover:bg-[#f3f0e7]/30 rounded-xl transition-all flex-shrink-0 active:scale-90 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                aria-label="Stop generation"
                title="Stop generation"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim() || (!currentKey && aiStore.provider !== 'openrouter')}
                className="p-2 bg-[#f3f0e7] text-[#2a2529] hover:bg-white disabled:opacity-20 rounded-xl transition-all flex-shrink-0 active:scale-90 shadow-md focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                aria-label="Send message"
                title="Send message"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
