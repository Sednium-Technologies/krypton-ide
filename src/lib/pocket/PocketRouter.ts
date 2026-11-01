/**
 * PocketRouter: High-efficiency agent router powered by Laya System 1.
 * Intercepts user requests, routes fast queries in <50ms, and dispatches
 * deep engineering tasks to local GGUF models or remote cloud APIs.
 */

import { LayaSystem1, IntentRouteResult } from './LayaSystem1';
import { usePocketStore } from '../../store/usePocketStore';

export interface RouteRequest {
  prompt: string;
  sessionId: string;
  fallbackApiExecute: () => Promise<string>;
}

export interface RouteResponse {
  path: 'fast_path' | 'deep_reasoning';
  response: string;
  latencyMs: number;
}

export class PocketRouter {
  async routeAndExecute(req: RouteRequest): Promise<RouteResponse> {
    const t0 = performance.now();
    const route: IntentRouteResult = LayaSystem1.routeIntent(req.prompt);

    if (route.path === 'fast_path' && route.fastResponse) {
      const latencyMs = performance.now() - t0;
      return {
        path: 'fast_path',
        response: route.fastResponse,
        latencyMs,
      };
    }

    // Deep reasoning: Check engine mode
    const pocketStore = usePocketStore.getState();
    const activeModelId = pocketStore.selectedModelId;
    const model = pocketStore.availableModels.find(m => m.id === activeModelId);

    // If local LLM runner (llama.cpp JNI or ONNX Runtime) is bound in native host
    if (model && (model.type === 'gguf' || model.type === 'onnx') && (window as any)?.__KRYPTON_LOCAL_LLM__) {
      try {
        const localOutput = await (window as any).__KRYPTON_LOCAL_LLM__.generate({
          prompt: req.prompt,
          modelPath: model.path,
          threads: pocketStore.hardwareInfo?.optimalThreadCount || 4,
        });
        const latencyMs = performance.now() - t0;
        return {
          path: 'deep_reasoning',
          response: localOutput,
          latencyMs,
        };
      } catch (err) {
        console.warn('[PocketRouter] Local LLM execution failed, falling back to API:', err);
      }
    }

    // Default to configured cloud model
    const apiResult = await req.fallbackApiExecute();
    const latencyMs = performance.now() - t0;

    return {
      path: 'deep_reasoning',
      response: apiResult,
      latencyMs,
    };
  }
}

export const defaultPocketRouter = new PocketRouter();
