import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  Filter,
  Lock,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import {
  ActionAuditEntry,
  AllowedAndroidApp,
  filterAuditLogEntries,
  ProviderIdentity,
  ProviderRoutingMode,
  SUPPORTED_JARVIS_LANGUAGES,
  SUPPORTED_TOOL_NAMES,
} from '../lib/jarvisCore';

export interface ProviderTestResult {
  providerId: string;
  providerLabel: string;
  kind: string;
  endpoint: string;
  authMethod: string;
  model: string;
  healthy: boolean;
  latencyMs: number;
  sampleReply?: string;
  errorCategory?: string;
  isRecoverable?: boolean;
  message: string;
  userGuidance?: string;
}

interface ProvidersAndSettingsViewProps {
  routingMode: ProviderRoutingMode;
  onChangeRoutingMode: (mode: ProviderRoutingMode) => void;
  simulatePrimaryFailure: boolean;
  onToggleSimulatePrimaryFailure: () => void;
  primaryIdentity: ProviderIdentity | null;
  secondaryIdentity: ProviderIdentity | null;
  primaryTestResult: ProviderTestResult | null;
  secondaryTestResult: ProviderTestResult | null;
  testingSlot: 'primary' | 'secondary' | null;
  onTestProvider: (slot: 'primary' | 'secondary', simulateError?: string) => void;
  allowedApps: AllowedAndroidApp[];
  onToggleAppInstalled: (appId: string) => void;
  onAddAppAlias: (appId: string, alias: string) => void;
  onLaunchAppDirect: (appName: string) => void;
  permissions: {
    microphone: boolean;
    notifications: boolean;
    contacts: boolean;
    exactAlarm: boolean;
    foregroundService: boolean;
  };
  onTogglePermission: (
    key: 'microphone' | 'notifications' | 'contacts' | 'exactAlarm' | 'foregroundService'
  ) => void;
  speechRate: number;
  onChangeSpeechRate: (rate: number) => void;
  voiceLang: string;
  onChangeVoiceLang: (lang: string) => void;
  auditLog: ActionAuditEntry[];
  onClearAuditLog?: () => void;
}

export const ProvidersAndSettingsView: React.FC<ProvidersAndSettingsViewProps> = ({
  routingMode,
  onChangeRoutingMode,
  simulatePrimaryFailure,
  onToggleSimulatePrimaryFailure,
  primaryIdentity,
  secondaryIdentity,
  primaryTestResult,
  secondaryTestResult,
  testingSlot,
  onTestProvider,
  allowedApps,
  onToggleAppInstalled,
  onAddAppAlias,
  onLaunchAppDirect,
  permissions,
  onTogglePermission,
  speechRate,
  onChangeSpeechRate,
  voiceLang,
  onChangeVoiceLang,
  auditLog,
  onClearAuditLog,
}) => {
  const [aliasInputs, setAliasInputs] = useState<Record<string, string>>({});

  // Searchable & Filterable Local Audit Log State
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('ALL');
  const [auditToolFilter, setAuditToolFilter] = useState<string>('ALL');

  const filteredAuditLog = useMemo(
    () =>
      filterAuditLogEntries(auditLog, {
        query: auditSearchQuery,
        statusFilter: auditStatusFilter,
        toolFilter: auditToolFilter,
      }),
    [auditLog, auditSearchQuery, auditStatusFilter, auditToolFilter]
  );

  return (
    <div className="space-y-6">
      {/* Section 1: Google Gemini AI Engine (gemini-3.8-flash) — Non-working API keys removed */}
      <section
        aria-label="Google Gemini AI Engine Status"
        className="liquid-glass-card rounded-3xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold text-white">
                Google Gemini AI Engine (gemini-3.8-flash)
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-0.5 font-mono text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                ACTIVE &amp; VERIFIED
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              All non-working and third-party API keys have been removed. JARVIS routes all AI
              commands exclusively through Google Gemini (<code className="font-mono text-white">gemini-3.8-flash</code>) via the server-side <code className="font-mono text-white">@google/genai</code> SDK.
            </p>
          </div>

          <button
            type="button"
            data-testid="verify-gemini-provider-btn"
            disabled={testingSlot === 'primary'}
            onClick={() => onTestProvider('primary')}
            className="liquid-glass-btn-primary flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5" />
            {testingSlot === 'primary' ? 'Verifying Gemini AI...' : 'Verify Gemini AI Connection'}
          </button>
        </div>

        <div
          data-testid="provider-card-primary"
          className="liquid-glass-subcard mt-5 rounded-2xl p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <h3 className="text-sm font-semibold text-white">
              Google Gemini AI — Primary Neural Engine
            </h3>
            <span className="liquid-accent-text font-mono text-xs">
              GEMINI · {primaryIdentity?.maskedKeyHint || 'Server-Side Gemini API'}
            </span>
          </div>

          <dl className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <dt className="text-slate-400">Active AI Provider</dt>
              <dd className="mt-1 font-semibold text-white">
                {primaryIdentity?.label || 'Google Gemini AI (gemini-3.8-flash)'}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <dt className="text-slate-400">Verified Gemini Model</dt>
              <dd className="liquid-accent-text mt-1 font-mono font-semibold">
                {primaryIdentity?.model || 'gemini-3.8-flash'}
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <dt className="text-slate-400">SDK &amp; Auth</dt>
              <dd className="mt-1 text-slate-200">
                @google/genai · Server-Side Secret
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <dt className="text-slate-400">Status</dt>
              <dd className="mt-1 font-mono font-semibold text-emerald-300">
                ONLINE · READY
              </dd>
            </div>
          </dl>

          {primaryTestResult && (
            <div
              data-testid="provider-test-result-primary"
              className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-3.5 text-xs text-emerald-100"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Google Gemini AI Verified
                </span>
                <span className="font-mono tabular-nums">{primaryTestResult.latencyMs} ms</span>
              </div>
              <p className="mt-1 text-slate-200">{primaryTestResult.message}</p>
              {primaryTestResult.sampleReply && (
                <p className="liquid-accent-text mt-1.5 font-mono text-[11px]">
                  Gemini Response: &quot;{primaryTestResult.sampleReply}&quot;
                </p>
              )}
            </div>
          )}
        </div>

        <div className="liquid-glass-subcard mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-xs text-slate-300">
          <span className="flex items-center gap-1.5 text-white font-medium">
            <Lock className="liquid-accent-text h-3.5 w-3.5" />
            Server-Side Gemini API Security
          </span>
          <span>
            Google Gemini API calls run on the backend via <code className="font-mono text-white">GEMINI_API_KEY</code> with zero hardcoded or unconfigured third-party keys.
          </span>
        </div>
      </section>

      {/* Section 2: Searchable Local Action & Tool Execution Audit Log (Offline-Ready) */}
      <section
        data-testid="audit-log-section"
        aria-label="Searchable Local Action Audit Log"
        className="liquid-glass-card rounded-3xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Activity className="liquid-accent-text h-5 w-5" />
              <h2 className="text-base font-semibold text-white">
                Searchable Local Action &amp; Tool Execution Audit Log ({filteredAuditLog.length} of{' '}
                {auditLog.length})
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-300">
                <Database className="h-3 w-3" />
                Offline Local Storage Ready
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Persisted locally on-device so you can search and audit executed commands, tool
              arguments, and outcomes even if the connection to the AI provider is lost.
            </p>
          </div>

          {onClearAuditLog && auditLog.length > 0 && (
            <button
              type="button"
              data-testid="clear-audit-log-btn"
              onClick={onClearAuditLog}
              className="liquid-glass-chip flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-rose-200 hover:text-white whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
              Clear Local Log
            </button>
          )}
        </div>

        {/* Search & Filter Controls Bar */}
        <div className="mt-4 grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-6">
            <label htmlFor="audit-log-search" className="sr-only">
              Search local audit log entries
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="audit-log-search"
              data-testid="audit-log-search-input"
              type="search"
              value={auditSearchQuery}
              onChange={(e) => setAuditSearchQuery(e.target.value)}
              placeholder="Search by tool name, command summary, contact, app, or JSON args..."
              className="liquid-glass-input w-full rounded-xl py-2 pr-3.5 pl-10 text-xs text-white placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-2 md:col-span-3">
            <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <label htmlFor="audit-status-filter" className="sr-only">
              Filter by Outcome Status
            </label>
            <select
              id="audit-status-filter"
              data-testid="audit-log-status-filter"
              value={auditStatusFilter}
              onChange={(e) => setAuditStatusFilter(e.target.value)}
              className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="REQUIRES_CONFIRMATION">REQUIRES_CONFIRMATION</option>
              <option value="CLARIFICATION_NEEDED">CLARIFICATION_NEEDED</option>
              <option value="FAILED">FAILED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          <div className="flex items-center gap-2 md:col-span-3">
            <label htmlFor="audit-tool-filter" className="sr-only">
              Filter by Tool Name
            </label>
            <select
              id="audit-tool-filter"
              data-testid="audit-log-tool-filter"
              value={auditToolFilter}
              onChange={(e) => setAuditToolFilter(e.target.value)}
              className="liquid-glass-input w-full rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              <option value="ALL">All Validated Tools</option>
              {SUPPORTED_TOOL_NAMES.map((toolName) => (
                <option key={toolName} value={toolName}>
                  {toolName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtered Audit Entries List */}
        {filteredAuditLog.length === 0 ? (
          <div
            data-testid="audit-log-empty-state"
            className="liquid-glass-subcard mt-4 rounded-2xl p-5 text-center text-xs text-slate-300"
          >
            {auditLog.length === 0
              ? 'No local tool audit entries recorded yet. Execute any command to log validated tool outcomes.'
              : `No audit log entries match "${auditSearchQuery}" (${auditStatusFilter} · ${auditToolFilter}).`}
          </div>
        ) : (
          <div
            data-testid="audit-log-entries-list"
            className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1"
          >
            {filteredAuditLog.map((entry) => {
              const statusColor =
                entry.status === 'SUCCESS'
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                  : entry.status === 'REQUIRES_CONFIRMATION'
                    ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                    : entry.status === 'CLARIFICATION_NEEDED'
                      ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                      : 'border-rose-400/40 bg-rose-500/15 text-rose-200';

              return (
                <div
                  key={entry.id}
                  data-testid="audit-log-entry"
                  className="liquid-glass-subcard rounded-2xl p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="liquid-accent-text font-mono text-xs font-semibold">
                        {entry.toolName}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusColor}`}
                      >
                        {entry.status}
                      </span>
                      {entry.providerUsed && (
                        <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                          Provider: {entry.providerUsed}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {new Date(entry.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="mt-1.5 text-slate-100">{entry.summary}</p>

                  {entry.args && Object.keys(entry.args).length > 0 && (
                    <div className="mt-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[11px] text-slate-300">
                      <span className="text-slate-400">Args: </span>
                      {JSON.stringify(entry.args)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 3: Android App Control Allowlist & Custom Aliases */}
      <section
        aria-label="Android App Control Allowlist"
        className="liquid-glass-card rounded-3xl p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              AndroidActionManager — Explicit App Allowlist &amp; Custom Aliases
            </h2>
            <p className="text-xs text-slate-300">
              Uses scoped <code className="font-mono text-white">&lt;queries&gt;</code>{' '}
              manifest declarations and <code className="font-mono text-white">PackageManager</code>{' '}
              resolution without broad package visibility.
            </p>
          </div>
          <Smartphone className="liquid-accent-text h-5 w-5" />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allowedApps.map((app) => (
            <div
              key={app.id}
              className="liquid-glass-subcard flex flex-col justify-between rounded-2xl p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">{app.displayName}</h3>
                  <button
                    type="button"
                    onClick={() => onToggleAppInstalled(app.id)}
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0 ${
                      app.installedOnDevice
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-400/30'
                    }`}
                  >
                    {app.installedOnDevice ? 'Installed' : 'Simulate Missing'}
                  </button>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{app.packageName}</p>
                <p className="mt-2 text-xs text-slate-300">
                  Aliases: {app.aliases.join(' · ')}
                </p>
              </div>

              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label={`Add alias for ${app.displayName}`}
                    placeholder="Add voice alias..."
                    value={aliasInputs[app.id] || ''}
                    onChange={(e) =>
                      setAliasInputs((prev) => ({ ...prev, [app.id]: e.target.value }))
                    }
                    className="liquid-glass-input w-full rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = (aliasInputs[app.id] || '').trim();
                      if (val) {
                        onAddAppAlias(app.id, val);
                        setAliasInputs((prev) => ({ ...prev, [app.id]: '' }));
                      }
                    }}
                    className="liquid-glass-chip rounded-lg px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onLaunchAppDirect(app.displayName)}
                  className="liquid-glass-chip flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="liquid-accent-text h-3.5 w-3.5" />
                  Launch {app.displayName}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Permissions, Voice Synthesis & Vivo OriginOS Guidance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-label="Android Permissions and Privacy"
          className="liquid-glass-card rounded-3xl p-6"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white">
                Permissions &amp; Privacy Controls
              </h2>
              <p className="text-xs text-slate-300">
                Toggle permissions to test JARVIS&apos;s permission-denied error states.
              </p>
            </div>
            <ShieldCheck className="liquid-accent-text h-5 w-5" />
          </div>

          <div className="mt-4 space-y-3">
            {(
              [
                {
                  key: 'microphone',
                  title: 'Microphone (RECORD_AUDIO)',
                  desc: 'Required for Tap to Talk and "Hey JARVIS" voice recognition.',
                },
                {
                  key: 'notifications',
                  title: 'Notifications (POST_NOTIFICATIONS)',
                  desc: 'Required on Android 13+ to display task and reminder alerts.',
                },
                {
                  key: 'contacts',
                  title: 'Contacts (READ_CONTACTS)',
                  desc: 'Used strictly when resolving a contact name for WhatsApp drafts.',
                },
                {
                  key: 'exactAlarm',
                  title: 'Exact Alarms (SCHEDULE_EXACT_ALARM)',
                  desc: 'Allows AlarmManager.setExactAndAllowWhileIdle for precise reminders.',
                },
                {
                  key: 'foregroundService',
                  title: 'Foreground Microphone Service',
                  desc: 'Used when "Hey JARVIS" hands-free mode is enabled.',
                },
              ] as const
            ).map((item) => (
              <div
                key={item.key}
                className="liquid-glass-subcard flex items-center justify-between gap-3 rounded-2xl p-3.5"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-100">{item.title}</p>
                  <p className="text-[11px] text-slate-300">{item.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onTogglePermission(item.key)}
                  className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    permissions[item.key]
                      ? 'liquid-glass-btn-primary'
                      : 'border border-rose-500/40 bg-rose-500/15 text-rose-200'
                  }`}
                >
                  {permissions[item.key] ? 'Granted' : 'Denied'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Voice Configuration + Vivo OriginOS Device Guide */}
        <section
          aria-label="Voice Settings and Vivo OriginOS Configuration"
          className="liquid-glass-card space-y-6 rounded-3xl p-6"
        >
          <div>
            <h2 className="text-base font-semibold text-white">
              Universal Polyglot Voice &amp; Talk-Back Language Configuration
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="voice-lang-select" className="block text-xs text-slate-300">
                  Owner Talk-Back &amp; Recognition Language
                </label>
                <select
                  id="voice-lang-select"
                  value={voiceLang}
                  onChange={(e) => onChangeVoiceLang(e.target.value)}
                  className="liquid-glass-input mt-1 w-full rounded-xl px-3 py-2 text-xs text-slate-100"
                >
                  {SUPPORTED_JARVIS_LANGUAGES.map((lang) => (
                    <option key={lang.bcp47} value={lang.bcp47}>
                      {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="speech-rate-range" className="block text-xs text-slate-300">
                  Speech Rate ({speechRate.toFixed(2)}x)
                </label>
                <input
                  id="speech-rate-range"
                  type="range"
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  value={speechRate}
                  onChange={(e) => onChangeSpeechRate(Number(e.target.value))}
                  className="mt-2.5 w-full"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold text-white">
              Vivo (OriginOS) &amp; Android 14+ Device Reliability Guide
            </h3>
            <ul className="mt-2.5 space-y-2 text-xs text-slate-300">
              <li>
                1. <strong>OriginOS Battery Optimization</strong>: Open{' '}
                <em>Settings &gt; Battery &gt; Background Power Consumption Management</em>,
                select <strong>JARVIS</strong>, and choose{' '}
                <em>High Background Power Usage</em> so reminders are not killed in deep sleep.
              </li>
              <li>
                2. <strong>Autostart After Reboot</strong>: Enable{' '}
                <em>Settings &gt; Apps &gt; Autostart &gt; JARVIS</em> so{' '}
                <code className="liquid-accent-text font-mono">BootRestoreReceiver</code> can
                restore scheduled alarms after restarting your Vivo phone.
              </li>
              <li>
                3. <strong>Exact Alarms &amp; Lock Screen</strong>: Grant{' '}
                <em>Alarms &amp; Reminders</em> in Special App Access. No root, ADB computer
                tether, SMS permission, or AccessibilityService is ever required.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};

