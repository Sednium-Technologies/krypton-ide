import React, { useState, useEffect } from 'react';
import { GitCommit, GitPullRequest, GitMerge, Check, RefreshCw, Loader, Github, CloudUpload, CloudDownload, Plus, Link, Unlink, ExternalLink, Search, Lock, Globe, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useIdeStore } from '../../store/useIdeStore';
import { useAuthStore, type GitHubUser } from '../../store/useAuthStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { getGitStatus, commitChanges } from '../../lib/gitService';
import { listRepos, createRepo, pushProject, pullRepo, type GitHubRepo, type PushResult } from '../../lib/githubService';
import { startDeviceFlow, type DeviceFlowSession } from '../../lib/githubOAuth';
import { ConfirmationSheet } from '../ui/ConfirmationSheet';
import { toast } from '../../store/useToastStore';

type GitTab = 'changes' | 'github';

export function GitPanel() {
  const { files } = useIdeStore();
  const { githubToken, githubUser, githubRepoLink, setGithubRepoLink } = useAuthStore();
  const [activeTab, setActiveTab] = useState<GitTab>('changes');

  return (
    <div className="flex h-full flex-col text-sm text-[#f3f0e7] bg-[#2a2529]">
      {/* Tab bar */}
      <div className="flex border-b border-[#f3f0e7]/10 px-2 text-xs bg-[#231e22]" role="tablist" aria-label="Git panels">
        <button
          role="tab"
          aria-selected={activeTab === 'changes'}
          className={`flex-1 py-2 text-center uppercase tracking-wider font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${activeTab === 'changes' ? 'text-[#f3f0e7] border-b-2 border-[#f3f0e7]' : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7]'}`}
          onClick={() => setActiveTab('changes')}
        >
          Changes
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'github'}
          className={`flex-1 py-2 text-center uppercase tracking-wider font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${activeTab === 'github' ? 'text-[#f3f0e7] border-b-2 border-[#f3f0e7]' : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7]'}`}
          onClick={() => setActiveTab('github')}
        >
          GitHub
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#2a2529]">
        {activeTab === 'changes' && <ChangesTab />}
        {activeTab === 'github' && <GitHubTab />}
      </div>
    </div>
  );
}

// ─── Changes Tab (local git) ────────────────────────────────

function ChangesTab() {
  const { files } = useIdeStore();
  const [commitMessage, setCommitMessage] = useState('');
  const [changedFiles, setChangedFiles] = useState<{ filepath: string; status: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const refreshStatus = async () => {
    setIsLoading(true);
    try {
      const status = await getGitStatus();
      setChangedFiles(status);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshStatus();
    }, 10);
    return () => clearTimeout(timer);
  }, [files]);

  const handleCommit = async () => {
    if (!commitMessage.trim() || changedFiles.length === 0) return;
    setIsCommitting(true);
    try {
      await commitChanges(commitMessage);
      setCommitMessage('');
      await refreshStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <textarea
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        placeholder="Message (Press Ctrl+Enter to commit)"
        aria-label="Commit message"
        className="w-full resize-none rounded-2xl border border-[#f3f0e7]/15 bg-[#342f33] p-3 text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:border-[#f3f0e7]/40 focus:outline-none text-sm leading-relaxed"
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) handleCommit();
        }}
      />
      <button
        onClick={handleCommit}
        className="w-full flex items-center justify-center space-x-2 bg-[#f3f0e7] text-[#2a2529] hover:bg-white py-3 rounded-2xl disabled:opacity-40 transition-colors font-bold text-xs shadow-md focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
        disabled={changedFiles.length === 0 || !commitMessage.trim() || isCommitting}
      >
        {isCommitting ? <Loader size={16} className="animate-spin text-[#2a2529]" /> : <Check size={16} />}
        <span>{isCommitting ? 'Committing...' : 'Commit'}</span>
      </button>

      <div className="flex items-center justify-between">
        <span className="font-bold text-[#f3f0e7] uppercase text-[11px] tracking-wider">Changes</span>
        <div className="flex items-center space-x-2">
          {isLoading && <Loader size={12} className="animate-spin text-[#f3f0e7]" />}
          <span className="bg-[#342f33] text-xs px-2 py-0.5 rounded-full font-bold text-[#f3f0e7]">{changedFiles.length}</span>
        </div>
      </div>

      {changedFiles.length === 0 ? (
        <div className="text-center text-[#f3f0e7]/70 mt-4">
          <GitCommit size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">No changes to commit.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {changedFiles.map(file => (
            <div key={file.filepath} className="flex items-center justify-between group hover:bg-[#342f33] px-3 py-2 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[#f3f0e7]/10">
              <span className="truncate text-xs text-[#f3f0e7]">{file.filepath}</span>
              <span className={`text-xs font-mono font-bold ${file.status === 'added' ? 'text-emerald-400' : file.status === 'deleted' ? 'text-red-400' : 'text-[#f3f0e7]'}`}>
                {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
              </span>
            </div>
          ))}
        </div>
      )}

      <button 
        onClick={refreshStatus} 
        aria-label="Refresh git status"
        className="w-full flex items-center justify-center space-x-2 bg-[#342f33] hover:bg-[#3d373c] py-2.5 rounded-xl text-xs text-[#f3f0e7] font-semibold border border-[#f3f0e7]/10 transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
      >
        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        <span>Refresh</span>
      </button>
    </div>
  );
}

// ─── GitHub Tab ─────────────────────────────────────────────

function GitHubTab() {
  const { githubToken, githubUser, githubRepoLink, setGithubToken, setGithubRepoLink, clearGithub } = useAuthStore();
  const [error, setError] = useState('');
  
  // Device flow state
  const [deviceFlowSession, setDeviceFlowSession] = useState<DeviceFlowSession | null>(null);
  const [deviceFlowStatus, setDeviceFlowStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [codeCopied, setCodeCopied] = useState(false);

  // Repo operations state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [showRepoList, setShowRepoList] = useState(false);

  // Push/Pull state
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Create repo state
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  // ── Sync githubRepoLink with current project's githubRepo ──
  const currentProjectId = useProjectsStore(s => s.currentProjectId);
  const currentProject = useProjectsStore(s => s.currentProjectId ? s.projects[s.currentProjectId] : null);
  
  useEffect(() => {
    if (currentProject?.githubRepo) {
      const [owner, repo] = currentProject.githubRepo.split('/');
      if (owner && repo) {
        // Only update if different to avoid infinite loops
        const current = githubRepoLink;
        if (!current || current.owner !== owner || current.repo !== repo) {
          setGithubRepoLink({ owner, repo });
        }
      }
    } else if (githubRepoLink && currentProjectId) {
      // Project has no repo linked, but global link exists — clear it
      setGithubRepoLink(null);
    }
  }, [currentProjectId, currentProject?.githubRepo]);

  const handleGithubDeviceFlow = async () => {
    setDeviceFlowStatus('waiting');
    setError('');
    try {
      const session = await startDeviceFlow();
      setDeviceFlowSession(session);
      
      const result = await session.waitForToken();
      
      if (result.status === 'complete') {
        const success = await setGithubToken(result.token);
        if (success) {
          setDeviceFlowStatus('success');
          setTimeout(() => {
            setDeviceFlowStatus('idle');
            setDeviceFlowSession(null);
          }, 2000);
        } else {
          setDeviceFlowStatus('error');
          setError('Failed to validate GitHub token.');
        }
      } else if (result.status === 'expired') {
        setDeviceFlowStatus('error');
        setError('Login code expired. Please try again.');
        setDeviceFlowSession(null);
      } else {
        setDeviceFlowStatus('idle');
        setDeviceFlowSession(null);
      }
    } catch (err: any) {
      setDeviceFlowStatus('error');
      setError(err.message || 'Failed to authenticate');
      setDeviceFlowSession(null);
    }
  };

  const copyDeviceCode = () => {
    if (deviceFlowSession) {
      navigator.clipboard.writeText(deviceFlowSession.userCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const loadRepos = async () => {
    setLoadingRepos(true);
    try {
      const r = await listRepos();
      setRepos(r);
    } catch (e: any) {
      setStatusMessage({ text: `Failed to load repos: ${e.message}`, type: 'error' });
    }
    setLoadingRepos(false);
  };

  const handleLinkRepo = (repo: GitHubRepo) => {
    const [owner, name] = repo.full_name.split('/');
    setGithubRepoLink({ owner, repo: name });
    // Also persist to project store
    if (currentProjectId) {
      useProjectsStore.getState().setProjectGitHubRepo(currentProjectId, repo.full_name);
    }
    setShowRepoList(false);
    setStatusMessage({ text: `Linked to ${repo.full_name}`, type: 'info' });
  };

  const handleConfirmUnlink = () => {
    const repoPath = githubRepoLink ? `${githubRepoLink.owner}/${githubRepoLink.repo}` : '';
    setGithubRepoLink(null);
    // Also clear from project store
    if (currentProjectId) {
      useProjectsStore.getState().setProjectGitHubRepo(currentProjectId, '');
    }
    setStatusMessage(null);
    setPushResult(null);
    setShowUnlinkConfirm(false);
    if (repoPath) {
      toast.info(`Unlinked repository ${repoPath}`);
    }
  };

  const handlePush = async () => {
    if (!githubRepoLink) return;
    setIsPushing(true);
    setStatusMessage(null);
    setPushResult(null);
    try {
      const result = await pushProject(githubRepoLink.owner, githubRepoLink.repo);
      setPushResult(result);
      if (result.commitSha) {
        setStatusMessage({ text: `Pushed: ${result.created} new, ${result.updated} updated, ${result.deleted} deleted`, type: 'success' });
      } else {
        setStatusMessage({ text: 'Everything is up to date!', type: 'success' });
      }
    } catch (e: any) {
      setStatusMessage({ text: `Push failed: ${e.message}`, type: 'error' });
    }
    setIsPushing(false);
  };

  const handlePull = async () => {
    if (!githubRepoLink) return;
    setIsPulling(true);
    setStatusMessage(null);
    try {
      const count = await pullRepo(githubRepoLink.owner, githubRepoLink.repo);
      setStatusMessage({ text: `Pulled ${count} files from ${githubRepoLink.owner}/${githubRepoLink.repo}`, type: 'success' });
    } catch (e: any) {
      setStatusMessage({ text: `Pull failed: ${e.message}`, type: 'error' });
    }
    setIsPulling(false);
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setIsCreating(true);
    setStatusMessage(null);
    try {
      const repo = await createRepo(newRepoName.trim(), newRepoDesc, newRepoPrivate);
      const user = useAuthStore.getState().githubUser;
      setGithubRepoLink({ owner: user!.login, repo: repo.name });
      // Persist to project store
      if (currentProjectId) {
        useProjectsStore.getState().setProjectGitHubRepo(currentProjectId, repo.full_name);
      }
      setShowCreateRepo(false);
      setNewRepoName('');
      setNewRepoDesc('');
      setStatusMessage({ text: `Created & linked to ${repo.full_name}`, type: 'success' });
      // Auto-push after create — use 3s delay to ensure GitHub has initialized the repo
      setTimeout(handlePush, 3000);
    } catch (e: any) {
      setStatusMessage({ text: e.message, type: 'error' });
    }
    setIsCreating(false);
  };

  // ── Not connected ──
  if (!githubToken || !githubUser) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-center py-6">
          <Github size={40} className="mx-auto mb-3 text-[#f3f0e7]/70" />
          <h3 className="text-[#f3f0e7] font-semibold mb-1">Connect GitHub</h3>
          <p className="text-[#f3f0e7]/75 text-xs leading-relaxed mb-4">
            Link your account to push and pull repositories directly from Kryptonide.
          </p>
        </div>

        {deviceFlowStatus === 'idle' || deviceFlowStatus === 'error' ? (
          <div className="space-y-3">
            <button
              onClick={handleGithubDeviceFlow}
              className="w-full flex items-center justify-center space-x-2 bg-[#238636] hover:bg-[#2ea043] text-white py-2.5 rounded-xl transition-colors font-medium text-sm shadow-md focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:outline-none"
            >
              <Github size={16} />
              <span>Login with GitHub</span>
            </button>
            {error && <p className="text-red-400 text-xs text-center border border-red-500/20 bg-red-500/10 p-2 rounded-xl">{error}</p>}
          </div>
        ) : deviceFlowStatus === 'waiting' && deviceFlowSession ? (
          <div className="bg-[#231e22] p-4 rounded-2xl border border-teal-500/30 text-center space-y-4 shadow-lg">
            <Loader size={24} className="animate-spin text-teal-400 mx-auto" />
            <div>
              <p className="text-[#f3f0e7] text-sm font-medium mb-1">Waiting for Authorization</p>
              <p className="text-[#f3f0e7]/75 text-xs">Enter this code on GitHub to securely authorize Kryptonide.</p>
            </div>
            
            <div className="bg-[#1b171a] p-3 rounded-xl border border-[#f3f0e7]/15 flex items-center justify-between">
              <span className="text-[#f3f0e7] font-mono text-lg tracking-widest font-bold">{deviceFlowSession.userCode}</span>
              <button
                onClick={copyDeviceCode}
                className="text-xs bg-[#342f33] hover:bg-[#3d373c] text-[#f3f0e7] px-3 py-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
              >
                {codeCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            
            <a
              href={deviceFlowSession.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center space-x-2 text-sm bg-[#f3f0e7] text-[#2a2529] px-4 py-2 rounded-xl font-bold hover:bg-white transition-colors w-full focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            >
              <span>Open GitHub</span>
              <ExternalLink size={14} />
            </a>
            
            <button
              onClick={() => {
                deviceFlowSession.cancel();
                setDeviceFlowStatus('idle');
                setDeviceFlowSession(null);
              }}
              className="text-[#f3f0e7]/70 hover:text-white text-xs underline mt-2 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none rounded"
            >
              Cancel Login
            </button>
          </div>
        ) : deviceFlowStatus === 'success' ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-center space-y-2">
            <Check size={28} className="text-emerald-400 mx-auto" />
            <p className="text-emerald-400 font-medium text-sm">Successfully Connected!</p>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Connected ──
  const filteredRepos = repos.filter(r =>
    r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <div className="p-4 space-y-4">
      {/* User profile */}
      <div className="flex items-center space-x-3 bg-[#231e22] p-3 rounded-2xl border border-[#f3f0e7]/15">
        <img src={githubUser.avatar_url} alt="avatar" className="w-10 h-10 rounded-full border border-[#f3f0e7]/20" />
        <div className="flex-1 min-w-0">
          <p className="text-[#f3f0e7] font-semibold text-sm truncate">{githubUser.name || githubUser.login}</p>
          <p className="text-[#f3f0e7]/70 text-xs truncate">@{githubUser.login}</p>
        </div>
        <button
          onClick={clearGithub}
          className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2.5 py-1.5 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:outline-none"
        >
          Disconnect
        </button>
      </div>

      {/* Linked repo */}
      {githubRepoLink ? (
        <div className="bg-[#231e22] p-3 rounded-2xl border border-[#f3f0e7]/15 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <Link size={12} className="text-emerald-400 flex-shrink-0" />
              <span className="text-[#f3f0e7] text-xs font-mono truncate">{githubRepoLink.owner}/{githubRepoLink.repo}</span>
            </div>
            <button
              onClick={() => setShowUnlinkConfirm(true)}
              className="text-[#f3f0e7]/70 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-red-400/50 focus-visible:outline-none"
              aria-label="Unlink repository"
              title="Unlink repository"
            >
              <Unlink size={12} />
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handlePush}
              disabled={isPushing}
              className="flex-1 flex items-center justify-center space-x-1.5 bg-[#238636] hover:bg-[#2ea043] text-white py-2.5 rounded-xl disabled:opacity-50 transition-colors text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:outline-none"
            >
              {isPushing ? <Loader size={12} className="animate-spin" /> : <CloudUpload size={12} />}
              <span>{isPushing ? 'Pushing...' : 'Push'}</span>
            </button>
            <button
              onClick={handlePull}
              disabled={isPulling}
              className="flex-1 flex items-center justify-center space-x-1.5 bg-[#342f33] hover:bg-[#3d373c] text-white py-2.5 rounded-xl disabled:opacity-50 transition-colors text-xs font-semibold focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            >
              {isPulling ? <Loader size={12} className="animate-spin" /> : <CloudDownload size={12} />}
              <span>{isPulling ? 'Pulling...' : 'Pull'}</span>
            </button>
          </div>

          <a
            href={`https://github.com/${githubRepoLink.owner}/${githubRepoLink.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-1.5 text-xs text-blue-300 hover:text-blue-200 focus-visible:ring-2 focus-visible:ring-blue-300/50 focus-visible:outline-none rounded"
          >
            <ExternalLink size={11} />
            <span>View on GitHub</span>
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex space-x-2">
            <button
              onClick={() => { setShowRepoList(true); loadRepos(); }}
              className="flex-1 flex items-center justify-center space-x-1.5 bg-[#342f33] hover:bg-[#3d373c] py-2.5 rounded-xl text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            >
              <Link size={12} />
              <span>Link Existing Repo</span>
            </button>
            <button
              onClick={() => setShowCreateRepo(true)}
              className="flex-1 flex items-center justify-center space-x-1.5 bg-[#238636] hover:bg-[#2ea043] text-white py-2.5 rounded-xl text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:outline-none"
            >
              <Plus size={12} />
              <span>Publish New</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Repo Dialog */}
      {showCreateRepo && (
        <div className="bg-[#231e22] p-4 rounded-2xl border border-teal-500/30 space-y-3">
          <h4 className="text-[#f3f0e7] font-semibold text-xs uppercase tracking-wider">Create & Publish Repository</h4>
          <input
            value={newRepoName}
            onChange={e => setNewRepoName(e.target.value.replace(/\s+/g, '-'))}
            placeholder="repository-name"
            aria-label="Repository name"
            className="w-full rounded-xl border border-[#f3f0e7]/15 bg-[#342f33] p-2.5 text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:border-[#f3f0e7]/40 focus:outline-none text-sm font-mono focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50"
          />
          <input
            value={newRepoDesc}
            onChange={e => setNewRepoDesc(e.target.value)}
            placeholder="Description (optional)"
            aria-label="Repository description"
            className="w-full rounded-xl border border-[#f3f0e7]/15 bg-[#342f33] p-2.5 text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:border-[#f3f0e7]/40 focus:outline-none text-sm focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50"
          />
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setNewRepoPrivate(false)}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs border transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${!newRepoPrivate ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-semibold' : 'border-[#f3f0e7]/15 text-[#f3f0e7]/70 hover:text-white'}`}
            >
              <Globe size={12} />
              <span>Public</span>
            </button>
            <button
              onClick={() => setNewRepoPrivate(true)}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl text-xs border transition-colors focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none ${newRepoPrivate ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 font-semibold' : 'border-[#f3f0e7]/15 text-[#f3f0e7]/70 hover:text-white'}`}
            >
              <Lock size={12} />
              <span>Private</span>
            </button>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowCreateRepo(false)}
              className="flex-1 py-2.5 rounded-xl bg-[#342f33] hover:bg-[#3d373c] text-xs font-semibold text-[#f3f0e7] focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateRepo}
              disabled={isCreating || !newRepoName.trim()}
              className="flex-1 flex items-center justify-center space-x-1.5 bg-[#238636] hover:bg-[#2ea043] text-white py-2.5 rounded-xl disabled:opacity-50 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:outline-none"
            >
              {isCreating ? <Loader size={12} className="animate-spin" /> : <CloudUpload size={12} />}
              <span>{isCreating ? 'Creating...' : 'Create & Push'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Repo list */}
      {showRepoList && (
        <div className="bg-[#231e22] rounded-2xl border border-[#f3f0e7]/15 overflow-hidden">
          <div className="p-2 border-b border-[#f3f0e7]/10">
            <div className="flex items-center space-x-2 bg-[#342f33] rounded-xl px-2.5">
              <Search size={12} className="text-[#f3f0e7]/70 flex-shrink-0" />
              <input
                value={repoSearch}
                onChange={e => setRepoSearch(e.target.value)}
                placeholder="Search repos..."
                aria-label="Search repositories"
                className="flex-1 bg-transparent py-2 text-[#f3f0e7] placeholder-[#f3f0e7]/40 focus:outline-none text-xs"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loadingRepos ? (
              <div className="flex items-center justify-center py-6">
                <Loader size={18} className="animate-spin text-[#f3f0e7]/70" />
              </div>
            ) : filteredRepos.length === 0 ? (
              <p className="text-center text-[#f3f0e7]/70 text-xs py-4">No repos found</p>
            ) : (
              filteredRepos.map(r => (
                <button
                  key={r.full_name}
                  onClick={() => handleLinkRepo(r)}
                  className="w-full flex items-center space-x-2 px-3 py-2.5 hover:bg-[#342f33] text-left border-b border-[#f3f0e7]/10 last:border-0 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
                >
                  {r.private ? <Lock size={11} className="text-amber-400 flex-shrink-0" /> : <Globe size={11} className="text-emerald-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[#f3f0e7] text-xs font-medium truncate">{r.name}</p>
                    {r.description && <p className="text-[#f3f0e7]/70 text-[10px] truncate">{r.description}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => { setShowRepoList(false); setRepoSearch(''); }}
            className="w-full p-2.5 text-xs text-[#f3f0e7]/70 hover:text-white hover:bg-[#342f33] border-t border-[#f3f0e7]/10 focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none"
          >
            Close
          </button>
        </div>
      )}

      {/* Status message */}
      {statusMessage && (
        <div className={`text-xs p-2.5 rounded-lg flex items-center gap-2 ${
          statusMessage.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : statusMessage.type === 'error'
            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
        }`}>
          {statusMessage.type === 'success' && <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />}
          {statusMessage.type === 'error' && <AlertCircle size={13} className="shrink-0 text-rose-400" />}
          {statusMessage.type === 'info' && <Info size={13} className="shrink-0 text-cyan-400" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Confirmation Sheet for Unlinking Repository */}
      <ConfirmationSheet
        isOpen={showUnlinkConfirm}
        title="Unlink Repository"
        description={`Are you sure you want to unlink ${githubRepoLink?.owner}/${githubRepoLink?.repo} from this project? Local files will remain intact.`}
        confirmLabel="Unlink"
        isDestructive
        onConfirm={handleConfirmUnlink}
        onClose={() => setShowUnlinkConfirm(false)}
      />
    </div>
  );
}
