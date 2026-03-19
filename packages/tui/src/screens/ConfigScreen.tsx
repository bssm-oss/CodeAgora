import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadConfigFrom } from '@codeagora/core/config/loader.js';
import { t } from '@codeagora/shared/i18n/index.js';
import { validateConfig } from '@codeagora/core/types/config.js';
import type { Config } from '@codeagora/core/types/config.js';
import { TabBar } from '../components/TabBar.js';
import { Toast } from '../components/Toast.js';
import { HelpOverlay } from '../components/HelpOverlay.js';
import type { KeyBinding } from '../components/HelpOverlay.js';
import { colors, icons } from '../theme.js';
import { getActiveProviderCount } from '../utils/provider-status.js';
import { ReviewersTab } from './config/ReviewersTab.js';
import { SupportersTab } from './config/SupportersTab.js';
import { ModeratorTab } from './config/ModeratorTab.js';
import { PresetsTab } from './config/PresetsTab.js';
import { EnvSetup } from './config/EnvSetup.js';

// ============================================================================
// Types
// ============================================================================

type TabName = 'reviewers' | 'supporters' | 'moderator' | 'presets' | 'env';

const TABS: Array<{ id: TabName; label: string }> = [
  { id: 'reviewers', label: t('config.tabs.reviewers') },
  { id: 'supporters', label: t('config.tabs.supporters') },
  { id: 'moderator', label: t('config.tabs.moderator') },
  { id: 'presets', label: t('config.tabs.presets') },
  { id: 'env', label: t('config.tabs.apiKeys') },
];

const HELP_BINDINGS: KeyBinding[] = [
  { key: '\u2191\u2193 / j/k', description: t('config.help.navigate') },
  { key: 'Space', description: t('config.help.toggle') },
  { key: 'e', description: t('config.help.edit') },
  { key: 'a', description: t('config.help.add') },
  { key: 'd', description: t('config.help.delete') },
  { key: 'Tab', description: t('config.help.tabs') },
  { key: '1-5', description: t('config.help.tabNum') },
  { key: 'Ctrl+e', description: t('config.help.editor') },
  { key: '?', description: t('config.help.help') },
  { key: 'q', description: t('config.help.quit') },
];

interface ConfigState {
  config: Config | null;
  error: string | null;
  loading: boolean;
}

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ConfigScreen(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabName>('reviewers');
  const [state, setState] = useState<ConfigState>({ config: null, error: null, loading: true });
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', visible: false });
  const [showHelp, setShowHelp] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadConfigFrom(process.cwd()).then(cfg => {
      setState({ config: cfg, error: null, loading: false });
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ config: null, error: msg, loading: false });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type, visible: true });
    toastTimerRef.current = setTimeout(() => setToast(s => ({ ...s, visible: false })), 2500);
  }, []);

  const handleConfigChange = useCallback((newConfig: Config): void => {
    try {
      validateConfig(newConfig);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg, 'error');
      return;
    }

    setState(s => ({ ...s, config: newConfig }));

    const configPath = path.join(process.cwd(), '.ca', 'config.json');
    try {
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
      showToast(t('config.saved'), 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg, 'error');
    }
  }, [showToast]);

  function openInEditor(): void {
    const configPath = path.join(process.cwd(), '.ca', 'config.json');
    const rawEditor = process.env['EDITOR'] || process.env['VISUAL'] || 'vi';
    const editor = /^[a-zA-Z0-9/._-]+$/.test(rawEditor) ? rawEditor : 'vi';
    showToast(t('config.editor.opening'), 'info');
    try {
      spawnSync(editor, [configPath], { stdio: 'inherit' });
      // Reload config after editor closes
      loadConfigFrom(process.cwd()).then(cfg => {
        setState({ config: cfg, error: null, loading: false });
        showToast(t('config.editor.reloaded'), 'success');
      }).catch(() => {
        showToast(t('config.editor.failed'), 'error');
      });
    } catch {
      showToast(t('config.editor.failed'), 'error');
    }
  }

  const tabIds = TABS.map(t => t.id);
  const tabIndex = tabIds.indexOf(activeTab);

  useInput((input, key) => {
    // Help overlay toggle
    if (input === '?') {
      setShowHelp(s => !s);
      return;
    }

    // Don't process other keys while help is shown
    if (showHelp) return;

    // Tab navigation
    if (key.shift && key.tab) {
      const prev = (tabIndex - 1 + TABS.length) % TABS.length;
      setActiveTab(tabIds[prev]!);
    } else if (key.tab) {
      const next = (tabIndex + 1) % TABS.length;
      setActiveTab(tabIds[next]!);
    }

    // Number key tab switching (1-5)
    const num = parseInt(input, 10);
    if (num >= 1 && num <= TABS.length) {
      setActiveTab(tabIds[num - 1]!);
    }

    // Ctrl+e → open in $EDITOR
    if (key.ctrl && input === 'e') {
      openInEditor();
    }
  });

  // ---- Loading state ----
  if (state.loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.primary}>Configuration</Text>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  // ---- No config: show Presets tab to let user pick a starting preset ----
  if (state.error || !state.config) {
    return (
      <Box flexDirection="column">
        <TabBar tabs={TABS} activeTab="presets" />
        <Box flexDirection="column" padding={1}>
          <Text color={colors.warning}>{t('config.noConfig')}</Text>
          <Box marginTop={1}>
            <PresetsTab
              config={null}
              isActive={true}
              onConfigChange={(newConfig) => {
                // Preset applied — save to disk and reload
                const configDir = path.join(process.cwd(), '.ca');
                if (!fs.existsSync(configDir)) {
                  fs.mkdirSync(configDir, { recursive: true });
                }
                const configPath = path.join(configDir, 'config.json');
                fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
                setState({ config: newConfig, error: null, loading: false });
                setActiveTab('reviewers');
                showToast(t('config.saved'), 'success');
              }}
            />
          </Box>
        </Box>
        <Toast message={toast.message} type={toast.type} visible={toast.visible} />
      </Box>
    );
  }

  const { config } = state;

  return (
    <Box flexDirection="column">
      {/* Tab bar */}
      <TabBar tabs={TABS} activeTab={activeTab} />

      {/* Tab content */}
      <Box flexGrow={1}>
        {activeTab === 'reviewers' && (
          <ReviewersTab
            config={config}
            isActive={activeTab === 'reviewers'}
            onConfigChange={handleConfigChange}
          />
        )}
        {activeTab === 'supporters' && (
          <SupportersTab
            config={config}
            isActive={activeTab === 'supporters'}
            onConfigChange={handleConfigChange}
          />
        )}
        {activeTab === 'moderator' && (
          <ModeratorTab
            config={config}
            isActive={activeTab === 'moderator'}
            onConfigChange={handleConfigChange}
          />
        )}
        {activeTab === 'presets' && (
          <PresetsTab
            config={config}
            isActive={activeTab === 'presets'}
            onConfigChange={handleConfigChange}
          />
        )}
        {activeTab === 'env' && (
          <EnvSetup onDone={() => setActiveTab('reviewers')} />
        )}
      </Box>

      {/* Footer: hints + provider status + toast */}
      <Box justifyContent="space-between">
        <Text dimColor>
          {'  \u2191\u2193 navigate  space toggle  e edit  a add  c clone  d delete  ? help  q back'}
        </Text>
        <Text dimColor>
          {(() => {
            const { active, total } = getActiveProviderCount();
            const color = active === 0 ? colors.error : active < 3 ? colors.warning : colors.success;
            return <Text color={color}>{icons.bullet} {active}/{total} providers</Text>;
          })()}
        </Text>
      </Box>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />

      {/* Help overlay */}
      {showHelp ? (
        <HelpOverlay
          bindings={HELP_BINDINGS}
          visible={showHelp}
          title={t('config.help.title')}
        />
      ) : null}
    </Box>
  );
}
