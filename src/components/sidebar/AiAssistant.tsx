import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Key, X, Sparkles, Loader2, Plus, MessageSquare, Trash2, ChevronDown, ChevronRight, BrainCircuit, FileCode, CheckCircle2, AlertCircle, Square, ClipboardList, Zap, Settings2, Paperclip, RotateCw, Check, Search, TerminalSquare, Globe, FolderCode, Mic, Copy, Edit3, RotateCcw } from 'lucide-react';
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
import { getModelWeightProgress } from '../../lib/kryptonCoreBridge';

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
  const { files, updateFileContent, saveFile, createFile, isAiFullscreen, setAiFullscreen, theme } = useIdeStore();
  const isLight = theme === 'light';
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
  const isEditingCustomModel = useRef(false);

  useEffect(() => {
    if (!isEditingCustomModel.current) {
      setCustomModelText(aiStore.model || currentProvider.defaultModel);
    }
  }, [activeProvider, currentProvider.defaultModel]);

  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const modelComboboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelComboboxRef.current && !modelComboboxRef.current.contains(event.target as Node)) {
        setShowModelSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const matchingModels = customModelText.trim()
    ? dynamicModels.filter(m => 
        m.id.toLowerCase().includes(customModelText.toLowerCase()) || 
        (m.name && m.name.toLowerCase().includes(customModelText.toLowerCase()))
      )
    : dynamicModels;

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [configContextWindow, setConfigContextWindow] = useState(aiStore.contextWindow || 128000);
  const [configMaxOutputTokens, setConfigMaxOutputTokens] = useState(aiStore.maxOutputTokens || 8192);
  const [configReasoningEffort, setConfigReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high'>(aiStore.reasoningEffort || 'none');
  const [configThinkingBudget, setConfigThinkingBudget] = useState(aiStore.thinkingBudget || 0);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleVoiceInput = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Voice dictation is not supported in this browser environment.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript || '';
        if (transcript) {
          setInput(prev => prev ? `${prev} ${transcript}` : transcript);
        }
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  const [weightLoadingState, setWeightLoadingState] = useState<{
    isLoading: boolean;
    percentage: number;
    loadedBytes: number;
    totalBytes: number;
    phase: string;
    modelName: string;
  }>({
    isLoading: false,
    percentage: 0,
    loadedBytes: 0,
    totalBytes: 256 * 1024 * 1024,
    phase: '',
    modelName: '',
  });

  const triggerWeightLoadingProgress = (modelPath: string, name: string) => {
    setWeightLoadingState({
      isLoading: true,
      percentage: 10,
      loadedBytes: 25 * 1024 * 1024,
      totalBytes: 256 * 1024 * 1024,
      phase: 'Scanning GGUF header & tensors...',
      modelName: name,
    });
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const current = getModelWeightProgress(modelPath);
      const pct = Math.min(100, Math.max(step * 25, current.percentage));
      setWeightLoadingState({
        isLoading: pct < 100,
        percentage: pct,
        loadedBytes: Math.round((pct / 100) * 256 * 1024 * 1024),
        totalBytes: 256 * 1024 * 1024,
        phase: pct >= 100 ? 'Weights initialized in NPU/RAM' : (pct > 60 ? 'Mapping tensor weights to RAM...' : (current.phase || current.status || 'Allocating model weights...')),
        modelName: name,
      });
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setWeightLoadingState(prev => ({ ...prev, isLoading: false }));
        }, 1200);
      }
    }, 200);
  };
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

  const retryLastMessage = (targetIdx?: number) => {
    const msgs = activeSession?.messages || aiMessages;
    let userMsg: Message | undefined;
    let cutIdx = -1;
    if (typeof targetIdx === 'number' && targetIdx >= 0) {
      userMsg = msgs.slice(0, targetIdx).reverse().find(m => m.role === 'user');
      cutIdx = targetIdx;
    } else {
      userMsg = [...msgs].reverse().find(m => m.role === 'user');
      cutIdx = msgs.map(m => m.role).lastIndexOf('assistant');
    }
    if (!userMsg) return;
    setInput(userMsg.content);
    if (inputRef.current) inputRef.current.focus();
    if (activeSession && cutIdx >= 0) {
      aiStore.updateSession(activeSession.id, {
        messages: msgs.slice(0, cutIdx)
      });
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
      <div className={`flex h-full flex-col ${isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
          isLight ? 'bg-[#eae5d8] border-[#2a2529]/15 text-[#2a2529]' : 'bg-[#231e22] border-[#f3f0e7]/10 text-[#f3f0e7]'
        }`}>
          <div className="flex items-center space-x-2">
            <Bot size={18} className={isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'} />
            <h3 className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Model Configurations</h3>
          </div>
          <button onClick={() => setShowSettings(false)} className={`p-1.5 rounded-lg transition-colors ${
            isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/5'
          }`}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>Saved Models</h4>
            <div className="space-y-2">
              {aiStore.savedModels.map(model => (
                <div key={model.id} className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border ${
                  isLight ? 'bg-white border-[#2a2529]/12 text-[#2a2529]' : 'bg-[#342f33] border-[#f3f0e7]/10 text-[#f3f0e7]'
                }`}>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => aiStore.setActiveSavedModel(model.id)}
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        aiStore.activeModelId === model.id 
                          ? (isLight ? 'border-[#2a2529] bg-[#2a2529]/20' : 'border-[#f3f0e7] bg-[#f3f0e7]/20') 
                          : (isLight ? 'border-[#2a2529]/40' : 'border-[#f3f0e7]/40')
                      }`}
                    >
                      {aiStore.activeModelId === model.id && <div className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-[#2a2529]' : 'bg-[#f3f0e7]'}`} />}
                    </button>
                    <div className="flex flex-col text-left">
                      <span className={`text-xs font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{model.name}</span>
                      <span className={`text-[9px] font-mono mt-0.5 ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>{model.provider} / {model.model}</span>
                    </div>
                  </div>
                  <button onClick={() => aiStore.removeSavedModel(model.id)} className={`p-1.5 transition-colors rounded-lg ${
                    isLight ? 'text-[#2a2529]/50 hover:text-red-600 hover:bg-[#2a2529]/5' : 'text-[#f3f0e7]/40 hover:text-red-400 hover:bg-[#f3f0e7]/5'
                  }`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {aiStore.savedModels.length === 0 && (
                <div className={`text-[11px] italic p-4 text-center border border-dashed rounded-xl ${
                  isLight ? 'text-[#2a2529]/50 border-[#2a2529]/15' : 'text-[#f3f0e7]/50 border-[#f3f0e7]/15'
                }`}>
                  No saved models yet. Create one below to continue.
                </div>
              )}
            </div>
          </div>

          <div className={`border-t pt-6 space-y-6 ${isLight ? 'border-[#2a2529]/15' : 'border-[#f3f0e7]/10'}`}>
            <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 block ${isLight ? 'text-[#2a2529]/80' : 'text-[#f3f0e7]/80'}`}>Add New Configuration</h4>
            <div>
              <label className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>Infrastructure Provider</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(provider => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      aiStore.setProvider(provider.id);
                      aiStore.setModel('');
                      aiStore.setBaseUrl(provider.baseUrl);
                      setCustomModelText('');
                      isEditingCustomModel.current = false;
                    }}
                    className={`px-3 py-2.5 rounded-xl text-xs text-center border transition-all duration-200 ${
                      activeProvider === provider.id
                        ? (isLight ? 'bg-[#2a2529] text-white border-[#2a2529] font-bold shadow-sm' : 'bg-[#f3f0e7]/15 text-[#f3f0e7] border-[#f3f0e7]/40 font-bold')
                        : (isLight ? 'bg-white text-[#2a2529]/75 border-[#2a2529]/15 hover:border-[#2a2529]/35' : 'bg-[#342f33] text-[#f3f0e7]/60 border-[#f3f0e7]/10 hover:border-[#f3f0e7]/30')
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
                  <label className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>
                    API Base URL {activeProvider === 'custom' && '(OpenAI Compatible)'}
                  </label>
                  <input
                    type="text"
                    value={aiStore.baseUrl !== undefined ? aiStore.baseUrl : (currentProvider.baseUrl || '')}
                    onChange={(e) => aiStore.setBaseUrl(e.target.value)}
                    placeholder={currentProvider.baseUrl || 'http://localhost:8080/v1'}
                    className={`w-full rounded-xl px-4 py-3 text-sm font-mono border transition-all focus:outline-none ${
                      isLight 
                        ? 'bg-white border-[#2a2529]/20 text-[#2a2529] placeholder-[#2a2529]/35 focus:border-[#2a2529]/50' 
                        : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40'
                    }`}
                  />
                  <p className={`text-[10px] mt-1 ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/40'}`}>
                    {activeProvider === 'custom' 
                      ? 'Target URL of any OpenAI-compatible server (e.g. vLLM, LM Studio, Ollama /v1)' 
                      : activeProvider === 'ollama'
                      ? 'Ollama endpoint (e.g. http://localhost:11434)'
                      : 'Override default API host endpoint'}
                  </p>
                </div>
              )}

              <div>
                <label className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>
                  Secret Key {(!currentProvider.requiresKey || activeProvider === 'openrouter' || activeProvider === 'custom' || activeProvider === 'ollama') ? '(Optional)' : ''}
                </label>
                <input
                  type="text"
                  value={currentKey}
                  onChange={(e) => aiStore.setApiKey(e.target.value)}
                  placeholder={currentProvider.placeholder}
                  className={`w-full rounded-xl px-4 py-3 text-sm font-mono border transition-all focus:outline-none ${
                    isLight 
                      ? 'bg-white border-[#2a2529]/20 text-[#2a2529] placeholder-[#2a2529]/35 focus:border-[#2a2529]/50' 
                      : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <label className={`text-[10px] font-black uppercase tracking-[0.2em] block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>Deployment Model</label>
                    {isModelsLive && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Live ({dynamicModels.length})
                      </span>
                    )}
                    {isModelsLoading && (
                      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20">
                        <RotateCw size={10} className="animate-spin" />
                        <span>Auto-syncing...</span>
                      </span>
                    )}
                  </div>
                  {dynamicModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowModelSuggestions(prev => !prev)}
                      className={`text-[10px] font-mono transition-colors ${
                        isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529]' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7]'
                      }`}
                    >
                      {showModelSuggestions ? 'Hide list' : 'Browse all'}
                    </button>
                  )}
                </div>

                {/* Combobox with matching suggestions popup (Oorty style) */}
                <div className="relative" ref={modelComboboxRef}>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={customModelText}
                      onChange={(e) => {
                        isEditingCustomModel.current = true;
                        const val = e.target.value;
                        setCustomModelText(val);
                        aiStore.setModel(val);
                        setShowModelSuggestions(true);
                      }}
                      onFocus={() => setShowModelSuggestions(true)}
                      onBlur={() => {
                        isEditingCustomModel.current = false;
                      }}
                      className={`w-full rounded-xl pl-4 pr-10 py-3 text-sm font-mono border transition-all focus:outline-none ${
                        isLight 
                          ? 'bg-white border-[#2a2529]/20 text-[#2a2529] placeholder-[#2a2529]/35 focus:border-[#2a2529]/50' 
                          : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40'
                      }`}
                      placeholder={dynamicModels.length > 0 ? "Type or select a model..." : "Enter custom model ID (auto-syncing live models)..."}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowModelSuggestions(prev => !prev)}
                      className="absolute right-2.5 p-1 text-[#f3f0e7]/50 hover:text-[#f3f0e7] rounded-lg transition-colors"
                      tabIndex={-1}
                    >
                      <ChevronDown size={14} className={`transition-transform duration-200 ${showModelSuggestions ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Matching Suggestions Panel */}
                  {showModelSuggestions && (
                    <div className={`absolute top-full left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-2xl border shadow-2xl z-50 p-1.5 backdrop-blur-xl ${
                      isLight 
                        ? 'bg-[#f4f0e6]/95 border-[#2a2529]/15 shadow-black/15' 
                        : 'bg-[#231e22]/95 border-[#f3f0e7]/15 shadow-black/60'
                    }`}>
                      {matchingModels.length > 0 ? (
                        <div className="space-y-0.5">
                          {matchingModels.map(model => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setCustomModelText(model.id);
                                aiStore.setModel(model.id);
                                setShowModelSuggestions(false);
                                isEditingCustomModel.current = false;
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-all flex items-center justify-between group cursor-pointer ${
                                customModelText === model.id
                                  ? (isLight ? 'bg-[#2a2529] text-white font-bold' : 'bg-[#342f33] text-white font-bold border border-[#f3f0e7]/20')
                                  : (isLight ? 'text-[#2a2529]/80 hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/80 hover:bg-[#342f33]/60')
                              }`}
                            >
                              <div className="truncate pr-2">
                                <div className="truncate font-semibold">{model.name || model.id}</div>
                                {model.id !== model.name && (
                                  <div className="text-[10px] opacity-60 truncate">{model.id}</div>
                                )}
                              </div>
                              <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-sans">
                                live
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-3 text-center text-xs opacity-60 font-mono">
                          {isModelsLoading ? 'Auto-syncing endpoint models...' : 'No endpoint models match your search. You can still use this as a custom model.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Model Parameters: Context, Output, Reasoning */}
              <div className={`pt-3 border-t space-y-3 ${isLight ? 'border-[#2a2529]/15' : 'border-[#f3f0e7]/10'}`}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>
                      Context Window
                    </label>
                    <select
                      value={configContextWindow}
                      onChange={(e) => setConfigContextWindow(Number(e.target.value))}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-mono border focus:outline-none ${
                        isLight 
                          ? 'bg-white border-[#2a2529]/20 text-[#2a2529] focus:border-[#2a2529]/50' 
                          : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                      }`}
                    >
                      <option value={4096}>4K (4,096)</option>
                      <option value={8192}>8K (8,192)</option>
                      <option value={16384}>16K (16,384)</option>
                      <option value={32768}>32K (32,768)</option>
                      <option value={65536}>64K (65,536)</option>
                      <option value={131072}>128K (131,072)</option>
                      <option value={200000}>200K (200,000)</option>
                      <option value={1048576}>1M (1,048,576)</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>
                      Max Output
                    </label>
                    <select
                      value={configMaxOutputTokens}
                      onChange={(e) => setConfigMaxOutputTokens(Number(e.target.value))}
                      className={`w-full rounded-xl px-3 py-2 text-xs font-mono border focus:outline-none ${
                        isLight 
                          ? 'bg-white border-[#2a2529]/20 text-[#2a2529] focus:border-[#2a2529]/50' 
                          : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                      }`}
                    >
                      <option value={2048}>2K (2,048)</option>
                      <option value={4096}>4K (4,096)</option>
                      <option value={8192}>8K (8,192)</option>
                      <option value={16384}>16K (16,384)</option>
                      <option value={32768}>32K (32,768)</option>
                      <option value={65536}>64K (65,536)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 block ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>
                    Reasoning / Thinking Level
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {(['none', 'low', 'medium', 'high'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setConfigReasoningEffort(lvl)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border transition-all ${
                          configReasoningEffort === lvl
                            ? (isLight ? 'bg-[#2a2529] text-white border-[#2a2529]' : 'bg-[#f3f0e7] text-[#2a2529] border-[#f3f0e7]')
                            : (isLight ? 'bg-white text-[#2a2529]/75 border-[#2a2529]/15 hover:border-[#2a2529]/30' : 'bg-[#231e22] text-[#f3f0e7]/70 border-[#f3f0e7]/15 hover:border-[#f3f0e7]/30')
                        }`}
                      >
                        {lvl === 'none' ? 'Off' : lvl}
                      </button>
                    ))}
                  </div>
                  {configReasoningEffort !== 'none' && (
                    <input
                      type="number"
                      min={0}
                      step={512}
                      value={configThinkingBudget || ''}
                      onChange={(e) => setConfigThinkingBudget(Number(e.target.value) || 0)}
                      placeholder="Custom thinking budget tokens (0 for default)"
                      className={`w-full rounded-xl px-3 py-2 text-xs font-mono border focus:outline-none ${
                        isLight 
                          ? 'bg-white border-[#2a2529]/20 text-[#2a2529] placeholder-[#2a2529]/35 focus:border-[#2a2529]/50' 
                          : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] placeholder-[#f3f0e7]/30 focus:border-[#f3f0e7]/40'
                      }`}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`px-5 py-4 flex-shrink-0 border-t ${
          isLight ? 'bg-[#eae5d8] border-[#2a2529]/15' : 'bg-[#231e22] border-[#f3f0e7]/10'
        }`}>
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
                  baseUrl: aiStore.baseUrl || currentProvider.baseUrl,
                  contextWindow: configContextWindow,
                  maxOutputTokens: configMaxOutputTokens,
                  reasoningEffort: configReasoningEffort,
                  thinkingBudget: configThinkingBudget,
                });
                aiStore.setContextWindow(configContextWindow);
                aiStore.setMaxOutputTokens(configMaxOutputTokens);
                aiStore.setReasoningEffort(configReasoningEffort);
                aiStore.setThinkingBudget(configThinkingBudget);
                setShowSettings(false);
              }
            }}
            disabled={currentProvider.requiresKey && !currentKey && activeProvider !== 'openrouter' && activeProvider !== 'ollama' && activeProvider !== 'custom'}
            className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all shadow-lg active:scale-[0.98] disabled:opacity-40 ${
              isLight ? 'bg-[#2a2529] text-white hover:bg-black' : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white'
            }`}
          >
            Save Model Configuration
          </button>
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className={`flex h-full flex-col relative w-full overflow-hidden ${isLight ? 'bg-[#f4f0e6] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
      {/* Chat header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 z-30 ${
        isLight ? 'bg-[#eae5d8] border-[#2a2529]/15 text-[#2a2529]' : 'bg-[#231e22] border-[#f3f0e7]/10 text-[#f3f0e7]'
      }`}>
        <div 
          onClick={() => setShowQuickModelPicker(!showQuickModelPicker)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowQuickModelPicker(!showQuickModelPicker);
            }
          }}
          className={`flex items-center space-x-2.5 cursor-pointer hover:opacity-85 transition-opacity select-none focus-visible:ring-2 focus-visible:outline-none rounded-xl p-1 ${
            isLight ? 'focus-visible:ring-[#2a2529]/50' : 'focus-visible:ring-[#f3f0e7]/50'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Switch AI model"
          title="Click to quickly switch models"
        >
          <div className={`w-7 h-7 rounded-xl border flex items-center justify-center relative overflow-hidden ${
            isLight ? 'bg-white border-[#2a2529]/15' : 'bg-[#342f33] border-[#f3f0e7]/15'
          }`}>
            <OortyLiteIcon size={16} />
            {isModelsLive && (
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border ${
                isLight ? 'border-white' : 'border-[#231e22]'
              }`} />
            )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <span className={`text-xs font-bold leading-none ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Oorty Lite</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono leading-none ${
                isLight ? 'bg-[#2a2529]/10 text-[#2a2529]/80' : 'bg-[#f3f0e7]/10 text-[#f3f0e7]/80'
              }`}>
                {currentProvider.name}
              </span>
              <ChevronDown size={11} className={isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'} />
            </div>
            <span className={`text-[9px] font-mono truncate max-w-[150px] mt-0.5 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
              {currentProvider.requiresKey && !currentKey ? 'No API key set' : (aiStore.model || currentProvider.defaultModel)}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button 
            onClick={() => setShowSessionList(!showSessionList)} 
            className={`p-2 rounded-xl transition-all focus-visible:ring-2 focus-visible:outline-none ${
              isLight ? 'text-[#2a2529]/75 hover:text-[#2a2529] hover:bg-[#2a2529]/10 focus-visible:ring-[#2a2529]/50' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 focus-visible:ring-[#f3f0e7]/50'
            }`}
            title="View conversations"
            aria-label="View conversations list"
          >
            <MessageSquare size={16} />
          </button>
          <button 
            onClick={() => setShowSettings(true)} 
            className={`p-2 rounded-xl transition-all focus-visible:ring-2 focus-visible:outline-none cursor-pointer ${
              isLight ? 'text-[#2a2529]/75 hover:text-[#2a2529] hover:bg-[#2a2529]/10 focus-visible:ring-[#2a2529]/50' : 'text-[#f3f0e7]/75 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10 focus-visible:ring-[#f3f0e7]/50'
            }`}
            title="Configure API key and models"
            aria-label="Configure API key and models"
          >
            <Key size={16} />
          </button>
        </div>
      </div>

      {/* Quick Model Picker popover */}
      {showQuickModelPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowQuickModelPicker(false)} />
          <div className={`absolute left-3 top-14 w-80 max-w-[calc(100vw-24px)] rounded-2xl shadow-2xl z-50 p-3 flex flex-col max-h-[460px] animate-scale-in border ${
            isLight ? 'bg-[#f4f0e6] border-[#2a2529]/20 text-[#2a2529]' : 'bg-[#342f33] border-[#f3f0e7]/15 text-[#f3f0e7]'
          }`}>
            <div className={`flex items-center justify-between pb-2 border-b ${
              isLight ? 'border-[#2a2529]/10' : 'border-[#f3f0e7]/10'
            }`}>
              <div className="flex items-center space-x-2">
                <Sparkles size={14} className={isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'} />
                <span className={`text-xs font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Quick Model Switch</span>
                {isModelsLive && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Live
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => refreshModels()}
                  disabled={isModelsLoading}
                  className={`p-1 rounded-lg disabled:opacity-40 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                    isLight ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/75 hover:text-[#2a2529] focus-visible:ring-[#2a2529]/50' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/75 hover:text-[#f3f0e7] focus-visible:ring-[#f3f0e7]/50'
                  }`}
                  title="Sync models from API"
                  aria-label="Sync models from API"
                >
                  <RotateCw size={13} className={isModelsLoading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setShowQuickModelPicker(false)}
                  className={`p-1 rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                    isLight ? 'hover:bg-[#2a2529]/10 text-[#2a2529]/75 hover:text-[#2a2529] focus-visible:ring-[#2a2529]/50' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/75 hover:text-[#f3f0e7] focus-visible:ring-[#f3f0e7]/50'
                  }`}
                  aria-label="Close model picker"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Search filter */}
            <div className="relative my-2">
              <Search size={13} className={`absolute left-2.5 top-2.5 ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/70'}`} />
              <input
                type="text"
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
                placeholder={`Filter ${dynamicModels.length} models...`}
                aria-label="Filter models"
                className={`w-full rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono border focus:outline-none ${
                  isLight 
                    ? 'bg-white border-[#2a2529]/20 text-[#2a2529] placeholder-[#2a2529]/40 focus:border-[#2a2529]/50' 
                    : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] placeholder-[#f3f0e7]/50 focus:border-[#f3f0e7]/35'
                }`}
                autoFocus
              />
            </div>

            {/* API key missing warning banner */}
            {currentProvider.requiresKey && !currentKey && (
              <div className="p-2.5 mb-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth pb-28">
        {aiMessages.length === 0 && (
          <div className="flex flex-col items-center justify-start text-center pt-8 pb-6 px-4 w-full">
            <div className="relative mb-4 mt-2">
              <div className="absolute inset-0 bg-[#f3f0e7]/10 blur-xl rounded-full animate-pulse-glow" />
              <div className={`relative w-16 h-16 rounded-2xl ${isLight ? 'bg-white border-[#2a2529]/15' : 'bg-[#342f33] border-[#f3f0e7]/15'} flex items-center justify-center shadow-xl p-2.5`}>
                <OortyLiteIcon size={38} />
              </div>
            </div>
            <h3 className={`text-base font-bold mb-1 ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Oorty Lite</h3>
            <p className={`text-xs leading-relaxed max-w-[240px] ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/60'}`}>
              Tag files with <span className={`font-mono font-semibold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>@</span> · Ask anything · Build faster
            </p>

            {!aiStore.apiKey && aiStore.provider !== 'openrouter' && (
              <button
                onClick={() => setShowSettings(true)}
                className={`mt-4 flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 focus-visible:ring-2 focus-visible:outline-none ${
                  isLight
                    ? 'bg-[#2a2529] text-white hover:bg-black focus-visible:ring-[#2a2529]/50'
                    : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white focus-visible:ring-[#f3f0e7]/50'
                }`}
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
                  className={`text-left px-3.5 py-2.5 text-[11px] font-medium rounded-xl transition-all border truncate focus-visible:ring-2 focus-visible:outline-none ${
                    isLight
                      ? 'text-[#2a2529]/80 bg-white hover:bg-[#eae6db] hover:text-[#2a2529] border-[#2a2529]/10 focus-visible:ring-[#2a2529]/30'
                      : 'text-[#f3f0e7]/75 bg-[#342f33] hover:bg-[#3d373c] hover:text-[#f3f0e7] border-[#f3f0e7]/10 focus-visible:ring-[#f3f0e7]/50'
                  }`}
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
            {msg.role === 'user' ? (
              <div className="group relative max-w-[85%] flex flex-col items-end">
                <div className={`rounded-3xl px-4 py-2.5 font-medium shadow-sm transition-all ${
                  isLight
                    ? 'bg-[#2a2529] text-[#f4f0e6]'
                    : 'bg-[#f3f0e7] text-[#2a2529]'
                }`}>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((att: any, idx: number) => (
                        att.type.startsWith('image/') ? (
                          <img key={idx} src={att.data} alt={att.name} className="w-48 max-w-full rounded-2xl object-contain border border-white/20" />
                        ) : (
                          <div key={idx} className="flex items-center space-x-2 bg-black/10 px-3 py-1.5 rounded-xl border border-white/10">
                            <span className="text-[11px] font-mono">{att.name}</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed break-words">{msg.content}</div>
                </div>
                <div className="flex items-center space-x-1.5 mt-1 mr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setInput(msg.content);
                      inputRef.current?.focus();
                    }}
                    className={`p-1 px-1.5 rounded-lg text-[10px] flex items-center space-x-1 transition-colors ${
                      isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                    }`}
                    title="Edit prompt"
                    aria-label="Edit prompt"
                  >
                    <Edit3 size={11} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleCopyText(msg.content, `user-${i}`)}
                    className={`p-1 px-1.5 rounded-lg text-[10px] flex items-center space-x-1 transition-colors ${
                      isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                    }`}
                    title="Copy prompt"
                    aria-label="Copy prompt"
                  >
                    {copiedId === `user-${i}` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    <span>{copiedId === `user-${i}` ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="group relative w-full px-1 py-1">
                <div className={`w-full bg-transparent border-none shadow-none text-[13.5px] leading-relaxed ${
                  isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
                }`}>
                  {renderMessageContent(msg.content, msg)}
                  {msg.role === 'assistant' && (() => {
                    const modified = getModifiedFiles(msg);
                    if (modified.length === 0) return null;
                    return (
                      <div className="mt-3 pt-2.5 border-t border-[#f3f0e7]/10 flex flex-wrap items-center gap-1.5 animate-fade-in">
                        <span className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${isLight ? 'text-[#2a2529]/75' : 'text-[#f3f0e7]/75'}`}>
                          Modified ({modified.length})
                        </span>
                        {modified.map((file, idx) => (
                          <div key={idx} className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-md shadow-sm border ${
                            isLight ? 'bg-white border-[#2a2529]/15 text-[#2a2529]' : 'bg-[#231e22] border-[#f3f0e7]/10 text-[#f3f0e7]'
                          }`}>
                            <FileCode size={12} className={isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'} />
                            <span className="text-[10px] font-mono">{file}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center space-x-2 mt-2 pt-1 border-t border-transparent group-hover:border-[#f3f0e7]/10 transition-all">
                    <button
                      onClick={() => handleCopyText(msg.content, `asst-${i}`)}
                      className={`p-1 px-1.5 rounded-lg text-[10px] flex items-center space-x-1 transition-colors ${
                        isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                      }`}
                      title="Copy response"
                      aria-label="Copy response"
                    >
                      {copiedId === `asst-${i}` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      <span>{copiedId === `asst-${i}` ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => retryLastMessage(i)}
                      className={`p-1 px-1.5 rounded-lg text-[10px] flex items-center space-x-1 transition-colors ${
                        isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                      }`}
                      title="Revert & edit previous prompt"
                      aria-label="Revert & edit prompt"
                    >
                      <RotateCcw size={11} />
                      <span>Revert & Edit</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {isAiLoading && (
          <div className="flex justify-start w-full animate-fade-in pb-4 px-1">
            {aiStore.streamingText ? (
              <div className={`w-full bg-transparent border-none text-[13.5px] leading-relaxed ${
                isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'
              }`}>
                {renderMessageContent(aiStore.streamingText, { 
                  role: 'assistant', 
                  content: aiStore.streamingText,
                  timestamp: Date.now() 
                } as any)}
                <span className={`inline-block w-1.5 h-4 ml-0.5 animate-pulse align-middle ${
                  isLight ? 'bg-[#2a2529]' : 'bg-[#f3f0e7]'
                }`} />
              </div>
            ) : (
              <div className={`border rounded-2xl px-4 py-3 flex items-center space-x-2.5 shadow-md ${
                isLight ? 'bg-white border-[#2a2529]/10 text-[#2a2529]' : 'bg-[#342f33] border-[#f3f0e7]/10 text-[#f3f0e7]'
              }`}>
                <style>{`
                  @keyframes aiSoundWave {
                    0%, 100% { height: 6px; }
                    50% { height: 18px; }
                  }
                `}</style>
                <div className="flex items-center space-x-1 h-5">
                  <div className={`w-1 rounded-full animate-[aiSoundWave_1s_ease-in-out_infinite] ${isLight ? 'bg-[#2a2529]' : 'bg-[#f3f0e7]'}`} style={{ animationDelay: '0ms' }} />
                  <div className={`w-1 rounded-full animate-[aiSoundWave_1s_ease-in-out_infinite] ${isLight ? 'bg-[#2a2529]' : 'bg-[#f3f0e7]'}`} style={{ animationDelay: '200ms' }} />
                  <div className={`w-1 rounded-full animate-[aiSoundWave_1s_ease-in-out_infinite] ${isLight ? 'bg-[#2a2529]' : 'bg-[#f3f0e7]'}`} style={{ animationDelay: '400ms' }} />
                </div>
                <span className={`text-xs font-semibold uppercase tracking-widest ml-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>Thinking...</span>
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

      {/* Real-time Model Weight Loading & Allocation Progress Banner */}
      {weightLoadingState.isLoading && (
        <div className="mx-3 my-2 p-3 rounded-2xl bg-gradient-to-r from-purple-500/15 via-indigo-500/15 to-teal-500/15 border border-[#f3f0e7]/20 shadow-xl backdrop-blur-md flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-2">
              <BrainCircuit size={15} className="text-teal-400 animate-pulse" />
              <span className={`text-xs font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>
                Allocating Model Weights: {weightLoadingState.modelName}
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-teal-400">
              {weightLoadingState.percentage}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-black/30 overflow-hidden mb-1.5">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-indigo-400 transition-all duration-200 rounded-full"
              style={{ width: `${weightLoadingState.percentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] opacity-70 font-mono">
            <span>{weightLoadingState.phase}</span>
            <span>{(weightLoadingState.loadedBytes / (1024 * 1024)).toFixed(1)} MB / {(weightLoadingState.totalBytes / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
        </div>
      )}

      {/* Input Section — Locked to bottom edge of viewport */}
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDropFile}
        className={`p-3 border-t flex-shrink-0 z-40 sticky bottom-0 w-full pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md ${
          isLight ? 'bg-[#f7f5ee]/95 border-[#2a2529]/10 text-[#2a2529]' : 'bg-[#231e22]/95 border-[#f3f0e7]/10 text-[#f3f0e7]'
        }`}
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
        {/* Oorty Modern Pill Capsule Container (Image 10) */}
        <div className={`relative rounded-[28px] p-3 shadow-xl border transition-all duration-200 ${
          isLight
            ? 'bg-[#eae6db] border-[#2a2529]/15 focus-within:border-[#2a2529]/40 focus-within:shadow-2xl'
            : 'bg-[#252125] border-[#f3f0e7]/15 focus-within:border-[#f3f0e7]/35 focus-within:shadow-2xl'
        }`}>
          {/* Top text area */}
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
            placeholder="Type your message here..."
            aria-label="AI prompt input"
            className={`w-full bg-transparent px-2 pt-0.5 pb-2 text-[14px] leading-relaxed resize-none outline-none font-sans max-h-32 ${
              isLight
                ? 'text-[#2a2529] placeholder-[#2a2529]/45'
                : 'text-[#f3f0e7] placeholder-[#f3f0e7]/40'
            }`}
          />

          {/* Bottom Capsule Bar: Toolbar on Left, Animated Action Button on Right */}
          <div className="flex items-center justify-between px-1 pt-1 border-t border-transparent">
            {/* Left Toolbar */}
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'text-[#2a2529]/65 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/65 hover:text-[#f3f0e7] hover:bg-white/10'
                }`}
                title="Attach files"
                aria-label="Attach files"
              >
                <Paperclip size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  alert('Web grounding & live documentation retrieval context is active.');
                }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'text-[#2a2529]/65 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/65 hover:text-[#f3f0e7] hover:bg-white/10'
                }`}
                title="Web context grounding"
                aria-label="Web context grounding"
              >
                <Globe size={16} />
              </button>

              {/* Vertical Divider with subtle purple/theme tint */}
              <div className={`w-[1px] h-4 mx-0.5 ${isLight ? 'bg-[#2a2529]/20' : 'bg-purple-400/30'}`} />

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'text-[#2a2529]/65 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/65 hover:text-[#f3f0e7] hover:bg-white/10'
                }`}
                title="Model configurations"
                aria-label="Model configurations"
              >
                <Settings2 size={16} />
              </button>

              {/* Vertical Divider */}
              <div className={`w-[1px] h-4 mx-0.5 ${isLight ? 'bg-[#2a2529]/20' : 'bg-purple-400/30'}`} />

              <button
                type="button"
                onClick={() => {
                  setInput(prev => prev ? (prev.endsWith(' ') ? `${prev}@` : `${prev} @`) : '@');
                  inputRef.current?.focus();
                }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'text-[#2a2529]/65 hover:text-[#2a2529] hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/65 hover:text-[#f3f0e7] hover:bg-white/10'
                }`}
                title="Tag file context (@)"
                aria-label="Tag file context"
              >
                <FolderCode size={16} />
              </button>
            </div>

            {/* Right Action Button: Mic smoothly animating into Send or Stop */}
            <div className="flex items-center">
              {isAiLoading ? (
                <button
                  type="button"
                  onClick={() => aiStore.abortChat()}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform ${
                    isLight ? 'bg-[#2a2529] text-white hover:bg-black' : 'bg-white text-black hover:bg-gray-100'
                  }`}
                  aria-label="Stop generation"
                  title="Stop generation"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (input.trim()) {
                      sendMessage();
                    } else {
                      toggleVoiceInput();
                    }
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md active:scale-90 transition-all duration-300 ${
                    isLight
                      ? 'bg-[#2a2529] text-white hover:bg-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                  aria-label={input.trim() ? "Send message" : "Voice dictation"}
                  title={input.trim() ? "Send message" : "Voice dictation"}
                >
                  <div className="relative w-4 h-4 flex items-center justify-center">
                    <Send
                      size={14}
                      className={`absolute transition-all duration-300 ease-out ${
                        input.trim()
                          ? 'opacity-100 scale-100 rotate-0 pointer-events-auto'
                          : 'opacity-0 scale-50 -rotate-45 pointer-events-none'
                      }`}
                    />
                    <Mic
                      size={15}
                      className={`absolute transition-all duration-300 ease-out ${
                        input.trim()
                          ? 'opacity-0 scale-50 rotate-45 pointer-events-none'
                          : `opacity-100 scale-100 rotate-0 pointer-events-auto ${isListening ? 'text-red-500 animate-pulse' : ''}`
                      }`}
                    />
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
