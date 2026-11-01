import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Server, Cpu, FileText, Plus, Trash2, Check, RefreshCw, FolderOpen, AlertCircle, Upload, ArrowUpRight, Activity, ExternalLink, Shield, HardDrive, Zap } from 'lucide-react';
import { useSkillsStore, Skill } from '../../store/useSkillsStore';
import { useMcpStore, MCP_PRESETS, type McpServer } from '../../store/useMcpStore';
import { useAiStore } from '../../store/useAiStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useIdeStore } from '../../store/useIdeStore';
import { usePocketStore } from '../../store/usePocketStore';
import { readSystemPrompt } from '../../lib/fileSystemStorage';
import DEFAULT_OORTY_LITE_PROMPT from '../../config/prompts/oorty_lite.txt?raw';

export function AgentSettingsPanel() {
  const [activeTab, setActiveTab] = useState<'pocket' | 'skills' | 'mcp' | 'models'>('pocket');
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';

  // Skills state
  const { skills, loadSkills, toggleSkill, addSkill, importSkill, deleteSkill } = useSkillsStore();
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillBody, setNewSkillBody] = useState('');
  const [skillToast, setSkillToast] = useState<string | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  // MCP state
  const { servers, loadMcpServers, addServer, addPreset, removeServer, toggleServer } = useMcpStore();
  const [showAddMcpModal, setShowAddMcpModal] = useState(false);
  const [mcpName, setMcpName] = useState('');
  const [mcpType, setMcpType] = useState<'http' | 'sse'>('http');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpAuthToken, setMcpAuthToken] = useState('');
  const [mcpToast, setMcpToast] = useState<string | null>(null);

  // Saved models state
  const { savedModels, removeSavedModel, setActiveSavedModel, activeModelId } = useAiStore();

  // Pocket Server state
  const { availableModels, selectedModelId, selectModel, discoverLocalModels, hardwareInfo, downloadModel, toggleModelMemory, downloadingModelId } = usePocketStore();

  const [isScanningModels, setIsScanningModels] = useState(false);

  useEffect(() => {
    loadSkills();
    loadMcpServers();
    discoverLocalModels();
  }, [loadSkills, loadMcpServers, discoverLocalModels]);

  const handleSaveSkill = async () => {
    if (!newSkillName.trim()) return;
    await addSkill(newSkillName, newSkillDesc, newSkillBody);
    setNewSkillName('');
    setNewSkillDesc('');
    setNewSkillBody('');
    setShowAddSkillModal(false);
    setSkillToast('Skill created');
    setTimeout(() => setSkillToast(null), 2000);
  };

  const handleImportSkillFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        try {
          const imported = await importSkill(file.name, text);
          setSkillToast(`Imported skill: ${imported.name}`);
          setTimeout(() => setSkillToast(null), 2500);
        } catch (err) {
          console.error('Failed to import skill:', err);
          alert('Failed to parse and import skill .md file');
        }
      }
    };
    reader.readAsText(file);
    if (skillFileInputRef.current) skillFileInputRef.current.value = '';
  };

  const handleSaveMcp = async () => {
    if (!mcpName.trim() || !mcpUrl.trim()) return;
    await addServer({
      name: mcpName,
      type: mcpType,
      url: mcpUrl,
      authToken: mcpAuthToken.trim() || undefined,
      isEnabled: true,
      toolsCount: 0,
    });
    setMcpName('');
    setMcpUrl('');
    setMcpAuthToken('');
    setShowAddMcpModal(false);
    setMcpToast('MCP server added');
    setTimeout(() => setMcpToast(null), 2000);
  };

  return (
    <div className={`flex flex-col h-full ${isLight ? 'bg-[#f3f0e7] text-[#2a2529]' : 'bg-[#2a2529] text-[#f3f0e7]'}`}>
      {/* Header Tabs */}
      <div className={`flex items-center space-x-1 p-2 border-b overflow-x-auto scrollbar-hide flex-shrink-0 ${
        isLight ? 'bg-[#e8e4d9] border-[#2a2529]/10' : 'bg-[#231e22] border-[#f3f0e7]/10'
      }`}>
        <button
          onClick={() => setActiveTab('pocket')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'pocket'
              ? (isLight ? 'bg-[#2a2529] text-white shadow-sm' : 'bg-[#f3f0e7] text-[#2a2529] shadow-sm')
              : (isLight ? 'text-[#2a2529]/70 hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:bg-[#f3f0e7]/10')
          }`}
        >
          <Zap size={14} />
          <span>Pocket Server</span>
        </button>

        <button
          onClick={() => setActiveTab('skills')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'skills'
              ? (isLight ? 'bg-[#2a2529] text-white shadow-sm' : 'bg-[#f3f0e7] text-[#2a2529] shadow-sm')
              : (isLight ? 'text-[#2a2529]/70 hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:bg-[#f3f0e7]/10')
          }`}
        >
          <Sparkles size={14} />
          <span>Skills ({skills.filter(s => s.enabled).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('mcp')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'mcp'
              ? (isLight ? 'bg-[#2a2529] text-white shadow-sm' : 'bg-[#f3f0e7] text-[#2a2529] shadow-sm')
              : (isLight ? 'text-[#2a2529]/70 hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:bg-[#f3f0e7]/10')
          }`}
        >
          <Server size={14} />
          <span>MCP Servers ({servers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'models'
              ? (isLight ? 'bg-[#2a2529] text-white shadow-sm' : 'bg-[#f3f0e7] text-[#2a2529] shadow-sm')
              : (isLight ? 'text-[#2a2529]/70 hover:bg-[#2a2529]/10' : 'text-[#f3f0e7]/60 hover:bg-[#f3f0e7]/10')
          }`}
        >
          <Cpu size={14} />
          <span>API Models</span>
        </button>
      </div>

      {/* Real Oorty Upstream Link Card */}
      <div className={`mx-4 mt-3 p-3.5 rounded-2xl border ${isLight ? 'bg-white border-[#2a2529]/10' : 'bg-[#231e22] border-[#f3f0e7]/10'} shadow-sm flex items-center justify-between`}>
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-[#7C9B79]/20 text-[#7C9B79] flex items-center justify-center overflow-hidden p-1">
            <img src="/oorty_icon.png" alt="Oorty" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold">Oorty Lite Engine</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${isLight ? 'bg-[#7C9B79]/15 text-[#7C9B79] border-[#7C9B79]/30' : 'bg-[#7C9B79]/20 text-[#7C9B79] border-[#7C9B79]/30'}`}>
                Upstream v3.14
              </span>
            </div>
            <p className={`text-[11px] mt-0.5 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
              Distilled from real Oorty for hardware-accelerated development.
            </p>
          </div>
        </div>
        <a
          href="https://github.com/Sednium-Technologies/OORTY"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            isLight
              ? 'bg-[#2a2529] text-[#f4f0e6] border-[#2a2529] hover:bg-[#2a2529]/90'
              : 'bg-[#f3f0e7] text-[#2a2529] border-[#f3f0e7] hover:bg-[#f3f0e7]/90'
          }`}
        >
          <span>GitHub</span>
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Toast notifications */}
      {(skillToast || mcpToast) && (
        <div className={`mx-4 mt-2 p-2.5 rounded-xl text-xs flex items-center space-x-2 animate-fade-in border ${
          isLight ? 'bg-[#7C9B79]/15 border-[#7C9B79]/30 text-[#7C9B79]' : 'bg-[#7C9B79]/20 border-[#7C9B79]/30 text-[#7C9B79]'
        }`}>
          <Check size={14} />
          <span>{skillToast || mcpToast}</span>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* ── SKILLS TAB ── */}
        {activeTab === 'skills' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-sm font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Agent Skills</h3>
                <p className={`text-xs ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>
                  Folder-based instructions &amp; YAML frontmatter markdown skills. Invoke using <code className={isLight ? 'text-teal-700 font-bold' : 'text-teal-300'}>/</code> in AI chat.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  ref={skillFileInputRef}
                  type="file"
                  accept=".md"
                  className="hidden"
                  onChange={handleImportSkillFile}
                />
                <button
                  onClick={() => skillFileInputRef.current?.click()}
                  className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                    isLight
                      ? 'bg-white hover:bg-[#f5f1e8] text-[#2a2529] border-[#2a2529]/12 shadow-sm'
                      : 'bg-[#342f33] hover:bg-[#453d43] text-[#f3f0e7] border-[#f3f0e7]/10'
                  }`}
                  title="Import .md skill"
                >
                  <Upload size={13} />
                  <span>Import .md</span>
                </button>
                <button
                  onClick={() => loadSkills()}
                  className={`p-1.5 rounded-xl border transition-colors ${
                    isLight
                      ? 'bg-white hover:bg-[#f5f1e8] text-[#2a2529] border-[#2a2529]/12 shadow-sm'
                      : 'bg-[#342f33] hover:bg-[#453d43] text-[#f3f0e7] border-[#f3f0e7]/10'
                  }`}
                  title="Refresh Skills"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => setShowAddSkillModal(true)}
                  className={`flex items-center space-x-1 px-3 py-1.5 font-bold text-xs rounded-xl transition-all shadow ${
                    isLight
                      ? 'bg-[#2a2529] text-white hover:bg-[#3d373c]'
                      : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white'
                  }`}
                >
                  <Plus size={14} />
                  <span>Add Skill</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className={`flex items-start justify-between p-3.5 border rounded-2xl transition-all ${
                    isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#32303a]/80 border-[#f3f0e7]/10'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-teal-500/20 text-teal-300 rounded-xl mt-0.5">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>/{skill.name}</span>
                        {skill.isBuiltIn ? (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            isLight ? 'bg-[#2a2529]/10 text-[#2a2529]/70' : 'bg-[#f3f0e7]/10 text-[#f3f0e7]/70'
                          }`}>
                            Built-in
                          </span>
                        ) : (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            isLight ? 'bg-teal-600/15 text-teal-700' : 'bg-teal-500/20 text-teal-300'
                          }`}>
                            Custom .md
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>{skill.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleSkill(skill.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        skill.enabled ? 'bg-teal-500' : (isLight ? 'bg-[#d8d3c5]' : 'bg-[#342f33]')
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          skill.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>

                    {!skill.isBuiltIn && (
                      <button
                        onClick={() => deleteSkill(skill.id)}
                        className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors"
                        title="Delete skill"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MCP TAB ── */}
        {activeTab === 'mcp' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-sm font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Model Context Protocol (MCP)</h3>
                <p className={`text-xs ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>
                  Connect external tool servers &amp; runtime environments over HTTP/SSE.
                </p>
              </div>
              <button
                onClick={() => setShowAddMcpModal(true)}
                className={`flex items-center space-x-1 px-3 py-2 font-bold text-xs rounded-xl transition-all shadow ${
                  isLight ? 'bg-[#2a2529] text-white hover:bg-[#3d373c]' : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white'
                }`}
              >
                <Plus size={14} />
                <span>Add Server</span>
              </button>
            </div>

            {/* Quick Presets Bar */}
            <div className={`p-3 border rounded-2xl space-y-2 ${isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#231e22] border-[#f3f0e7]/10'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-[#2a2529]/50' : 'text-[#f3f0e7]/50'}`}>Quick Presets</span>
              <div className="flex flex-wrap gap-1.5">
                {MCP_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.name}
                    onClick={() => addPreset(idx)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border flex items-center space-x-1 transition-all ${
                      isLight
                        ? 'bg-[#f2eee3] hover:bg-[#e6e1d4] text-[#2a2529] border-[#2a2529]/10'
                        : 'bg-[#342f33] hover:bg-[#3d373c] text-[#f3f0e7]/80 hover:text-[#f3f0e7] border-[#f3f0e7]/10'
                    }`}
                  >
                    <Plus size={11} />
                    <span>{preset.name.replace(' Server', '')}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={`flex items-center space-x-2 rounded-xl p-3 text-xs border ${
              isLight ? 'bg-blue-50 text-blue-900 border-blue-200' : 'bg-blue-500/10 border-blue-500/20 text-blue-200'
            }`}>
              <AlertCircle size={16} className={`flex-shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
              <span>Enabled MCP servers are connected directly into Oorty Lite's unified tool registry to grant live external tool capabilities.</span>
            </div>

            {servers.length === 0 ? (
              <div className={`p-8 text-center border border-dashed rounded-2xl ${
                isLight ? 'text-[#2a2529]/40 border-[#2a2529]/20' : 'text-[#f3f0e7]/40 border-[#f3f0e7]/15'
              }`}>
                <Server size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">No MCP servers configured.</p>
                <p className="text-[11px] mt-1">Tap a preset above or "Add Server" to configure an HTTP or SSE endpoint.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {servers.map((srv) => (
                  <div
                    key={srv.id}
                    className={`flex items-center justify-between p-3.5 border rounded-2xl ${
                      isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#32303a]/80 border-[#f3f0e7]/10'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1 mr-3">
                      <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl flex-shrink-0">
                        <Server size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-bold truncate ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{srv.name}</span>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 flex-shrink-0">
                            {srv.type}
                          </span>
                          {srv.toolsCount > 0 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex-shrink-0">
                              {srv.toolsCount} tools
                            </span>
                          )}
                        </div>
                        <span className={`text-[11px] font-mono block mt-0.5 truncate ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>
                          {srv.url}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button
                        onClick={() => toggleServer(srv.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          srv.isEnabled ? 'bg-blue-500' : (isLight ? 'bg-[#d8d3c5]' : 'bg-[#342f33]')
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${srv.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <button onClick={() => removeServer(srv.id)} className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── POCKET SERVER TAB ── */}
        {activeTab === 'pocket' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-sm font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Pocket Server Engine</h3>
                <p className={`text-xs ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>
                  Local System 1 intent routing (sub-50ms) and GGUF inference before cloud fallback.
                </p>
              </div>
              <button
                disabled={isScanningModels}
                onClick={async () => {
                  setIsScanningModels(true);
                  await discoverLocalModels();
                  setTimeout(() => setIsScanningModels(false), 500);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  isLight ? 'bg-white border-[#2a2529]/15 hover:bg-[#2a2529]/5' : 'bg-[#342f33] border-[#f3f0e7]/15 hover:bg-[#453d43]'
                }`}
              >
                <RefreshCw size={12} className={isScanningModels ? 'animate-spin' : ''} />
                <span>{isScanningModels ? 'Scanning...' : 'Scan Storage'}</span>
              </button>
            </div>

            {/* Hardware Topology Status Card */}
            <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-white border-[#2a2529]/10' : 'bg-[#231e22] border-[#f3f0e7]/15'} space-y-2`}>
              <div className="flex items-center space-x-2 text-xs font-bold">
                <Cpu size={15} className="text-amber-400" />
                <span>Hardware Acceleration Engine</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className={`p-2 rounded-xl border ${isLight ? 'bg-[#f7f5ee] border-[#2a2529]/10' : 'bg-black/20 border-[#f3f0e7]/10'}`}>
                  <span className="opacity-60 block">CPU Big-Cores:</span>
                  <span className="font-bold text-amber-300">
                    {hardwareInfo?.bigCores ? hardwareInfo.bigCores.join(', ') : 'Pinning Enabled'}
                  </span>
                </div>
                <div className={`p-2 rounded-xl border ${isLight ? 'bg-[#f7f5ee] border-[#2a2529]/10' : 'bg-black/20 border-[#f3f0e7]/10'}`}>
                  <span className="opacity-60 block">GPU Acceleration:</span>
                  <span className="font-bold text-emerald-300">
                    {hardwareInfo?.gpuVendor || 'Adreno / Mali Detected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Model List */}
            <div className="space-y-3">
              {availableModels.map((m) => {
                const isActive = selectedModelId === m.id;
                const isDownloading = downloadingModelId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`p-4 border rounded-2xl transition-all ${
                      isActive
                        ? (isLight ? 'bg-white border-[#7C9B79] shadow-md' : 'bg-[#322c31] border-[#7C9B79]')
                        : (isLight ? 'bg-white border-[#2a2529]/10' : 'bg-[#282327] border-[#f3f0e7]/10')
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1.5 flex-1 pr-3">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className={`text-xs font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{m.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#7C9B79]/20 text-[#7C9B79] font-mono font-bold">
                            {m.quantization || m.type.toUpperCase()}
                          </span>
                          {m.size && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${isLight ? 'bg-[#2a2529]/5 text-[#2a2529]/70' : 'bg-white/5 text-[#f3f0e7]/60'}`}>
                              {m.size}
                            </span>
                          )}
                          {m.isLoadedInMemory && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#7C9B79] text-white font-mono font-bold animate-pulse">
                              RAM Active
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] leading-relaxed ${isLight ? 'text-[#2a2529]/75' : 'text-[#f3f0e7]/70'}`}>
                          {m.description}
                        </p>
                        {m.downloadProgress !== undefined && m.downloadProgress > 0 && m.downloadProgress < 100 && (
                          <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden mt-1.5">
                            <div
                              className="bg-[#7C9B79] h-full transition-all duration-200 rounded-full"
                              style={{ width: `${m.downloadProgress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end space-y-2 flex-shrink-0">
                        {/* Download or Select Action */}
                        {!m.isDownloaded && !m.path ? (
                          <button
                            disabled={isDownloading}
                            onClick={() => downloadModel(m.id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#7C9B79] text-white hover:bg-[#6b8768] active:scale-95 transition-all shadow-sm flex items-center space-x-1"
                          >
                            {isDownloading ? (
                              <>
                                <RefreshCw size={12} className="animate-spin" />
                                <span>{m.downloadProgress || 0}%</span>
                              </>
                            ) : (
                              <>
                                <Upload size={12} className="rotate-180" />
                                <span>Download</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2">
                            {/* Memory Toggle (Load to RAM) */}
                            <label className="flex items-center space-x-1.5 cursor-pointer" title="Load weights into RAM">
                              <span className={`text-[10px] font-semibold ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/70'}`}>
                                {m.isLoadedInMemory ? 'In RAM' : 'Off'}
                              </span>
                              <input
                                type="checkbox"
                                checked={!!m.isLoadedInMemory}
                                onChange={(e) => toggleModelMemory(m.id, e.target.checked)}
                                className="sr-only"
                              />
                              <div
                                onClick={() => toggleModelMemory(m.id, !m.isLoadedInMemory)}
                                className={`w-8 h-4.5 rounded-full transition-colors flex items-center p-0.5 ${
                                  m.isLoadedInMemory ? 'bg-[#7C9B79]' : (isLight ? 'bg-gray-300' : 'bg-gray-700')
                                }`}
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                    m.isLoadedInMemory ? 'translate-x-3.5' : 'translate-x-0'
                                  }`}
                                />
                              </div>
                            </label>

                            <button
                              onClick={() => selectModel(m.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                isActive
                                  ? (isLight ? 'bg-[#2a2529] text-white shadow-sm' : 'bg-[#f3f0e7] text-[#2a2529] shadow-sm')
                                  : (isLight ? 'bg-[#f2eee3] text-[#2a2529]/80 hover:bg-[#e6e1d4]' : 'bg-[#342f33] text-[#f3f0e7]/70 hover:text-[#f3f0e7]')
                              }`}
                            >
                              {isActive ? 'Active' : 'Select'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MODELS TAB ── */}
        {activeTab === 'models' && (
          <div className="space-y-4">
            <h3 className={`text-sm font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Saved Cloud AI Models</h3>
            <p className={`text-xs ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>
              Secondary fallback providers used when complex deep reasoning exceeds local context.
            </p>
            <div className="space-y-2.5">
              {savedModels.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between p-3.5 border rounded-2xl ${
                    isLight ? 'bg-white border-[#2a2529]/10 shadow-sm' : 'bg-[#32303a]/80 border-[#f3f0e7]/10'
                  }`}
                >
                  <div>
                    <span className={`text-xs font-bold block ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>{m.name}</span>
                    <span className={`text-[11px] font-mono ${isLight ? 'text-[#2a2529]/60' : 'text-[#f3f0e7]/50'}`}>{m.provider} · {m.model}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setActiveSavedModel(m.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        activeModelId === m.id
                          ? (isLight ? 'bg-[#2a2529] text-white shadow-sm' : 'bg-[#f3f0e7] text-[#2a2529] shadow-sm')
                          : (isLight ? 'bg-[#f2eee3] text-[#2a2529]/80 hover:bg-[#e6e1d4]' : 'bg-[#342f33] text-[#f3f0e7]/70 hover:text-[#f3f0e7]')
                      }`}
                    >
                      {activeModelId === m.id ? 'Active' : 'Select'}
                    </button>
                    <button onClick={() => removeSavedModel(m.id)} className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


      </div>

      {/* Add Skill Modal */}
      {showAddSkillModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className={`border rounded-3xl p-5 w-full max-w-md space-y-4 shadow-2xl ${
            isLight ? 'bg-white border-[#2a2529]/15 text-[#2a2529]' : 'bg-[#2a2529] border-[#f3f0e7]/20 text-[#f3f0e7]'
          }`}>
            <h3 className={`text-sm font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Create New Agent Skill</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>Skill Name</label>
                <input
                  type="text"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="e.g., Code Explainer"
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isLight ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] focus:border-[#2a2529]/40' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                  }`}
                />
              </div>
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>Description</label>
                <input
                  type="text"
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  placeholder="Brief description of what this skill does"
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isLight ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] focus:border-[#2a2529]/40' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                  }`}
                />
              </div>
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>Instructions / Prompt</label>
                <textarea
                  value={newSkillBody}
                  onChange={(e) => setNewSkillBody(e.target.value)}
                  placeholder="You are an expert... When asked to..."
                  className={`w-full h-28 border rounded-xl p-3 text-xs font-mono resize-none focus:outline-none ${
                    isLight ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] focus:border-[#2a2529]/40' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                  }`}
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowAddSkillModal(false)}
                className={`px-4 py-2 rounded-xl text-xs ${isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529]' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7]'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSkill}
                className={`px-4 py-2 font-bold text-xs rounded-xl transition-all shadow ${
                  isLight ? 'bg-[#2a2529] text-white hover:bg-[#3d373c]' : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white'
                }`}
              >
                Save Skill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add MCP Modal */}
      {showAddMcpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className={`border rounded-3xl p-5 w-full max-w-md space-y-4 shadow-2xl ${
            isLight ? 'bg-white border-[#2a2529]/15 text-[#2a2529]' : 'bg-[#2a2529] border-[#f3f0e7]/20 text-[#f3f0e7]'
          }`}>
            <h3 className={`text-sm font-bold ${isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]'}`}>Add MCP Server</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>Server Name</label>
                <input
                  type="text"
                  value={mcpName}
                  onChange={(e) => setMcpName(e.target.value)}
                  placeholder="e.g., GitHub MCP Server"
                  className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                    isLight ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] focus:border-[#2a2529]/40' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>Protocol</label>
                  <select
                    value={mcpType}
                    onChange={(e) => setMcpType(e.target.value as any)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none ${
                      isLight ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] focus:border-[#2a2529]/40' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                    }`}
                  >
                    <option value="http">HTTP POST</option>
                    <option value="sse">SSE (Server-Sent Events)</option>
                  </select>
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>Auth Token (Optional)</label>
                  <input
                    type="password"
                    value={mcpAuthToken}
                    onChange={(e) => setMcpAuthToken(e.target.value)}
                    placeholder="Bearer token"
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none ${
                      isLight ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] focus:border-[#2a2529]/40' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                    }`}
                  />
                </div>
              </div>
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-[#2a2529]/70' : 'text-[#f3f0e7]/60'}`}>Server URL</label>
                <input
                  type="text"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  placeholder="https://api.github.com/mcp"
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none ${
                    isLight ? 'bg-[#f7f5ee] border-[#2a2529]/15 text-[#2a2529] focus:border-[#2a2529]/40' : 'bg-[#231e22] border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#f3f0e7]/40'
                  }`}
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowAddMcpModal(false)}
                className={`px-4 py-2 rounded-xl text-xs ${isLight ? 'text-[#2a2529]/60 hover:text-[#2a2529]' : 'text-[#f3f0e7]/60 hover:text-[#f3f0e7]'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMcp}
                className={`px-4 py-2 font-bold text-xs rounded-xl transition-all shadow ${
                  isLight ? 'bg-[#2a2529] text-white hover:bg-[#3d373c]' : 'bg-[#f3f0e7] text-[#2a2529] hover:bg-white'
                }`}
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
