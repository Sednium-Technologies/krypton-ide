import React from 'react';
import { useExtensionHostStore } from '../../store/useExtensionHostStore';
import { useIdeStore } from '../../store/useIdeStore';
import { Sliders, Package, Check } from 'lucide-react';

export function ExtensionSettingsPanel() {
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const isHc = theme === 'hc-black';

  const cardBg = isLight ? 'bg-white/80' : isHc ? 'bg-[#121212]' : 'bg-[#342f33]';
  const cardBorder = isLight ? 'border-[#2a2529]/10' : isHc ? 'border-white/30' : 'border-[#f3f0e7]/10';
  const textPrimary = isLight ? 'text-[#2a2529]' : 'text-[#f3f0e7]';
  const textMuted = isLight ? 'text-[#2a2529]/75' : 'text-[#f3f0e7]/75';

  const configurations = useExtensionHostStore((state) => state.getContributedConfigurations());
  const getConfiguration = useExtensionHostStore((state) => state.getConfiguration);
  const updateConfiguration = useExtensionHostStore((state) => state.updateConfiguration);

  if (configurations.length === 0) {
    return (
      <div className={`p-6 rounded-2xl border text-center ${cardBg} ${cardBorder}`}>
        <Package size={28} className={`mx-auto mb-2 opacity-50 ${textMuted}`} />
        <h4 className={`text-sm font-semibold mb-1 ${textPrimary}`}>No Extension Settings</h4>
        <p className={`text-xs ${textMuted}`}>
          Installed extensions with configurable settings in their package manifests will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {configurations.map((config) => (
        <div key={config.extensionId} className={`p-4 rounded-2xl border ${cardBg} ${cardBorder} space-y-4`}>
          <div className="flex items-center space-x-2 border-b pb-3 border-inherit">
            <Sliders size={16} className="text-[#7C9B79]" />
            <h4 className={`text-sm font-semibold ${textPrimary}`}>{config.title}</h4>
            <span className={`text-[10px] font-mono opacity-60 ml-auto ${textMuted}`}>{config.extensionId}</span>
          </div>

          <div className="space-y-4">
            {Object.entries(config.properties || {}).map(([key, prop]: [string, any]) => {
              const currentValue = getConfiguration(key, prop.default);
              const propType = prop.type || 'string';

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-medium font-mono ${textPrimary}`}>
                      {key}
                    </label>
                    {propType === 'boolean' && (
                      <button
                        type="button"
                        onClick={() => updateConfiguration(key, !currentValue)}
                        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                          currentValue ? 'bg-[#7C9B79]' : isLight ? 'bg-[#2a2529]/20' : 'bg-white/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            currentValue ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  {prop.description && (
                    <p className={`text-[11px] ${textMuted}`}>{prop.description}</p>
                  )}

                  {propType === 'string' && (
                    <input
                      type="text"
                      value={currentValue ?? ''}
                      onChange={(e) => updateConfiguration(key, e.target.value)}
                      placeholder={prop.default ? String(prop.default) : ''}
                      className={`w-full text-xs px-3 py-1.5 rounded-lg border outline-none font-mono ${
                        isLight
                          ? 'bg-white/60 border-[#2a2529]/15 text-[#2a2529] focus:border-[#7C9B79]'
                          : 'bg-[#231e22]/60 border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#7C9B79]'
                      }`}
                    />
                  )}

                  {propType === 'number' && (
                    <input
                      type="number"
                      value={currentValue ?? 0}
                      onChange={(e) => updateConfiguration(key, Number(e.target.value))}
                      className={`w-full text-xs px-3 py-1.5 rounded-lg border outline-none font-mono ${
                        isLight
                          ? 'bg-white/60 border-[#2a2529]/15 text-[#2a2529] focus:border-[#7C9B79]'
                          : 'bg-[#231e22]/60 border-[#f3f0e7]/15 text-[#f3f0e7] focus:border-[#7C9B79]'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
