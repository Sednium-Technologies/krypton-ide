import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useProjectsStore } from '../../store/useProjectsStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleBackToProjects = () => {
    useProjectsStore.getState().closeProject();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#2a2529] text-[#f3f0e7] flex flex-col items-center justify-center p-6 z-[9999] select-none">
          <div className="max-w-md w-full bg-[#342f33] border border-[#f3f0e7]/10 rounded-2xl p-6 shadow-2xl space-y-5 text-center animate-fade-in">
            <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle size={28} />
            </div>

            <div>
              <h2 className="text-xl font-bold text-[#f3f0e7]">Workspace Error</h2>
              <p className="text-xs text-[#f3f0e7]/60 mt-1">
                An unexpected error occurred in the workspace. The IDE caught the exception to prevent a system crash.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-[#231e22] p-3 rounded-xl text-left border border-[#f3f0e7]/5 max-h-48 overflow-y-auto">
                <p className="text-xs font-mono text-rose-300 break-words">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] font-mono text-white/50 mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-[#f3f0e7] text-[#2a2529] font-bold rounded-xl hover:bg-white active:scale-95 transition-all text-xs"
              >
                <RefreshCw size={14} />
                <span>Reload Workspace</span>
              </button>
              <button
                onClick={this.handleBackToProjects}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-[#f3f0e7]/10 text-[#f3f0e7] font-semibold rounded-xl hover:bg-[#f3f0e7]/20 active:scale-95 transition-all text-xs border border-[#f3f0e7]/10"
              >
                <Home size={14} />
                <span>Projects Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
