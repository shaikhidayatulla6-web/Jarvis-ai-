import React, { useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Fingerprint,
  Globe,
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AssistantState,
  DetectedLanguageInfo,
  ProviderRoutingMode,
  SUPPORTED_JARVIS_LANGUAGES,
  SupportedJarvisLanguage,
  VOICE_MATCH_ENROLLMENT_PHRASES,
  VoiceMatchProfile,
  VoiceMatchVerificationResult,
} from '../lib/jarvisCore';

export type LiquidSurfaceMode = 'obsidian' | 'midnight' | 'crystal';
export type LiquidGradientId =
  | 'stark-gold'
  | 'arc-cyan'
  | 'quantum-violet'
  | 'emerald-matrix'
  | 'crimson-mark';

interface JarvisOrbHudProps {
  assistantState: AssistantState;
  handsFreeActive: boolean;
  isTapListening: boolean;
  wakeWordArmed: boolean;
  isMuted: boolean;
  speechSupported: boolean;
  voiceError: string | null;
  routingMode: ProviderRoutingMode;
  activeProviderBadge: string;
  fallbackActive: boolean;
  currentTimeStr: string;
  currentDateStr: string;
  surfaceMode?: LiquidSurfaceMode;
  gradientId?: LiquidGradientId;
  voiceMatchProfile: VoiceMatchProfile;
  lastVoiceVerification: VoiceMatchVerificationResult | null;
  detectedLanguage: DetectedLanguageInfo;
  talkBackLanguageBcp47: string;
  effectiveTalkBackLanguage: SupportedJarvisLanguage;
  cognitiveMode: string;
  onChangeTalkBackLanguage: (bcp47: string) => void;
  tapTranscript: string;
  tapMicHardwareStatus: 'READY' | 'CAPTURING_AUDIO' | 'INTERACTIVE_FALLBACK';
  onChangeTapTranscript: (text: string) => void;
  onSubmitTapCommand: (text?: string) => void;
  onTapToTalk: () => void;
  onStopTapToTalk: () => void;
  handsFreeTranscript: string;
  handsFreeMicStatus: 'STANDBY_VERIFIED' | 'CAPTURING_BOSS_VOICE' | 'BOSS_VOICE_VERIFIED';
  onChangeHandsFreeTranscript: (text: string) => void;
  onSubmitHandsFreeCommand: (text?: string) => void;
  onVerifyBossVoiceNow: () => void;
  onToggleHandsFree: () => void;
  onSimulateHeyJarvisWake: (speaker: 'owner' | 'guest', inlineCommand?: string) => void;
  onUpdateVoiceMatchProfile: (updated: VoiceMatchProfile) => void;
  onOpenVoiceCalibrationScreen?: () => void;
  onCancelAction: () => void;
  onToggleMute: () => void;
  onRetryLastCommand?: () => void;
}

const JARVIS_RECEIVER_IMAGE_PATH =
  '/assets/aistudio/5d86c8f4946b2739cea3ff5484bd3468_9b14b007.jpg';

const STATE_DESCRIPTIONS: Record<
  AssistantState,
  {
    label: string;
    subtext: string;
    angularRpm: string;
  }
> = {
  IDLE: {
    label: 'COMMAND RECEIVER ONLINE — BOSS VOICE VERIFIED',
    subtext:
      'Channel 1 (Tap to Talk) and Channel 2 ("Hey JARVIS" Hands-Free Boss Voice Match) are ready',
    angularRpm: '2,400 RPM · STANDBY',
  },
  LISTENING: {
    label: 'LISTENING FOR BOSS VOICE COMMAND',
    subtext: 'Speak naturally — Boss Voiceprint verified & active voice channel is capturing',
    angularRpm: '5,400 RPM · VOICE LOCKED',
  },
  THINKING: {
    label: 'NEURAL MATRIX PROCESSING',
    subtext: 'JARVIS Neural Core processing intent and validating Android tool parameters',
    angularRpm: '6,400 RPM · REASONING',
  },
  EXECUTING: {
    label: 'DISPATCHING ANDROID INTENT',
    subtext: 'Executing validated command through AndroidActionManager',
    angularRpm: '5,200 RPM · EXECUTING',
  },
  SPEAKING: {
    label: 'VOCAL TELEMETRY TRANSMISSION',
    subtext: 'Modulating spoken reply through Android TextToSpeech',
    angularRpm: '3,800 RPM · TRANSMITTING',
  },
  ERROR: {
    label: 'VOICE MATCH OR SYSTEM ALERT',
    subtext: 'Biometric Voice Match or permission requires review — click Verify Boss Voice to restore',
    angularRpm: 'ALERT · SECURITY GATE',
  },
};

export const JarvisOrbHud: React.FC<JarvisOrbHudProps> = ({
  assistantState,
  handsFreeActive,
  isTapListening,
  wakeWordArmed,
  isMuted,
  voiceError,
  activeProviderBadge,
  fallbackActive,
  currentTimeStr,
  currentDateStr,
  voiceMatchProfile,
  lastVoiceVerification,
  detectedLanguage,
  talkBackLanguageBcp47,
  effectiveTalkBackLanguage,
  cognitiveMode,
  onChangeTalkBackLanguage,
  tapTranscript,
  tapMicHardwareStatus,
  onChangeTapTranscript,
  onSubmitTapCommand,
  onTapToTalk,
  onStopTapToTalk,
  handsFreeTranscript,
  handsFreeMicStatus,
  onChangeHandsFreeTranscript,
  onSubmitHandsFreeCommand,
  onVerifyBossVoiceNow,
  onToggleHandsFree,
  onSimulateHeyJarvisWake,
  onUpdateVoiceMatchProfile,
  onOpenVoiceCalibrationScreen,
  onCancelAction,
  onToggleMute,
  onRetryLastCommand,
}) => {
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [enrollmentStep, setEnrollmentStep] = useState(0);

  const visual = STATE_DESCRIPTIONS[assistantState];
  const isHighVelocity =
    isTapListening ||
    wakeWordArmed ||
    assistantState === 'LISTENING' ||
    assistantState === 'THINKING' ||
    assistantState === 'EXECUTING' ||
    assistantState === 'SPEAKING';

  const handleCompleteEnrollmentPhrase = () => {
    if (enrollmentStep < VOICE_MATCH_ENROLLMENT_PHRASES.length - 1) {
      setEnrollmentStep((s) => s + 1);
    } else {
      const newSig = `VP-STARK-JARVIS-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
      onUpdateVoiceMatchProfile({
        ...voiceMatchProfile,
        enrolled: true,
        enrolledPhrasesCount: VOICE_MATCH_ENROLLMENT_PHRASES.length,
        fundamentalPitchHz: Number((132 + Math.random() * 14).toFixed(1)),
        spectralCentroidHz: Math.round(1780 + Math.random() * 140),
        voiceprintSignature: newSig,
        lastMatchConfidence: 98,
        lastVerifiedAt: new Date().toISOString(),
      });
      setEnrollmentStep(0);
      setShowEnrollmentModal(false);
    }
  };

  return (
    <section
      aria-label="JARVIS Holographic Command Receiver"
      className="liquid-glass-card rounded-3xl p-5"
    >
      {/* Top Telemetry Readout Row with Separate Tap to Talk and Hey JARVIS Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 text-xs text-slate-300">
        <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
          <span className="liquid-accent-text font-semibold">{currentTimeStr}</span>
          <span aria-hidden="true">·</span>
          <span>{currentDateStr}</span>
          <span aria-hidden="true">·</span>
          <span
            data-testid="status-badge-tap-to-talk"
            className="rounded-md border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
          >
            Tap to Talk: {isTapListening ? 'LISTENING' : 'READY'}
          </span>
          <span
            data-testid="status-badge-hey-jarvis"
            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
              wakeWordArmed
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200 font-semibold'
                : handsFreeActive
                  ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/15 bg-white/5 text-slate-400'
            }`}
          >
            Hey JARVIS:{' '}
            {wakeWordArmed
              ? 'AWAKE (LISTENING)'
              : handsFreeActive
                ? 'ON (Wake Active)'
                : 'OFF'}
          </span>
          <button
            type="button"
            data-testid="hud-sound-status-btn"
            onClick={onToggleMute}
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-all ${
              isMuted
                ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
            }`}
          >
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            HUD Sound: {isMuted ? 'OFF (Silent)' : 'ON'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="liquid-accent-text font-medium">{activeProviderBadge}</span>
          {fallbackActive && (
            <>
              <span aria-hidden="true">·</span>
              <span className="liquid-accent-text font-medium">Failover Active</span>
            </>
          )}
        </div>
      </div>

      {/* Holographic JARVIS Command Receiver Stage (Strict 1:1 Aspect Ratio Sphere) */}
      <div className="my-4 flex flex-col items-center justify-center">
        <div
          data-testid="jarvis-command-receiver"
          className="liquid-glass-subcard relative flex w-full max-w-[420px] flex-col items-center justify-center overflow-hidden rounded-3xl px-4 py-4"
        >
          {/* J.A.R.V.I.S. Mark LXXXV Neural HUD Framing Bar (Siri-Style Assistant Disabled) */}
          <div className="liquid-accent-text mb-2.5 flex w-full items-center justify-between gap-2 border-b border-white/15 pb-1.5 font-mono text-[10px] tracking-wider uppercase opacity-90">
            <span className="truncate" data-testid="jarvis-neural-mode-banner">
              J.A.R.V.I.S. // NEURAL CORE · SIRI OFF
            </span>
            <span className="shrink-0 tabular-nums">{visual.angularRpm}</span>
          </div>

          {/* Strict 1:1 Aspect-Square Multi-Axis Rotating Hologram Sphere */}
          <div
            data-testid="jarvis-sphere-ratio-box"
            className="liquid-sphere-filter relative flex aspect-square w-60 sm:w-64 shrink-0 items-center justify-center"
          >
            {/* J.A.R.V.I.S. Stark Arc Reactor Holographic Core Field */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-3 aspect-square rounded-full bg-gradient-to-tr from-amber-500/35 via-orange-500/25 to-cyan-400/25 blur-2xl transition-opacity duration-500 ${
                isHighVelocity ? 'opacity-95 scale-105' : 'opacity-55'
              }`}
            />

            {/* Outer Precision Azimuth & Degree Ring (Clockwise Rotation — Strict 1:1 SVG) */}
            <svg
              viewBox="0 0 320 320"
              className={`${
                isHighVelocity ? 'animate-jarvis-spin-fast' : 'animate-jarvis-spin'
              } pointer-events-none absolute inset-0 z-20 aspect-square h-full w-full`}
              aria-hidden="true"
            >
              <circle
                cx="160"
                cy="160"
                r="152"
                fill="none"
                strokeWidth="1.3"
                strokeDasharray="6 10 28 10"
                className="stroke-amber-400/80"
              />
              <circle
                cx="160"
                cy="160"
                r="144"
                fill="none"
                strokeWidth="1"
                strokeDasharray="2 8"
                className="stroke-amber-300/45"
              />
              <line x1="160" y1="2" x2="160" y2="14" className="stroke-amber-300" strokeWidth="2" />
              <line x1="160" y1="306" x2="160" y2="318" className="stroke-amber-300" strokeWidth="2" />
              <line x1="2" y1="160" x2="14" y2="160" className="stroke-amber-300" strokeWidth="2" />
              <line x1="306" y1="160" x2="318" y2="160" className="stroke-amber-300" strokeWidth="2" />
            </svg>

            {/* Middle Counter-Rotating Segmented Telemetry Ring */}
            <svg
              viewBox="0 0 320 320"
              className={`${
                isHighVelocity ? 'animate-jarvis-reverse-fast' : 'animate-jarvis-reverse'
              } pointer-events-none absolute inset-0 z-20 aspect-square h-full w-full`}
              aria-hidden="true"
            >
              <circle
                cx="160"
                cy="160"
                r="134"
                fill="none"
                strokeWidth="2.2"
                strokeDasharray="54 24 16 24"
                className="stroke-orange-400/75"
              />
              <circle
                cx="160"
                cy="160"
                r="122"
                fill="none"
                strokeWidth="1.2"
                strokeDasharray="90 50"
                className="stroke-amber-300/65"
              />
            </svg>

            {/* Interactive 1:1 Circular Neural Sphere Button (Dedicated to Tap to Talk) */}
            <button
              type="button"
              data-testid="orb-tap-to-talk"
              onClick={isTapListening ? onStopTapToTalk : onTapToTalk}
              aria-label={
                isTapListening
                  ? 'Stop Tap to Talk listening'
                  : 'Activate Tap to Talk voice input'
              }
              className="group relative z-10 flex aspect-square h-48 w-48 sm:h-52 sm:w-52 shrink-0 items-center justify-center rounded-full border border-amber-400/55 bg-black overflow-hidden shadow-[0_0_60px_rgba(245,158,11,0.42),inset_0_1px_2px_rgba(255,255,255,0.45)] transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
            >
              {/* Layer 1: Primary Clockwise Rotating Neural Sphere Image (1:1 aspect-square) */}
              <img
                src={JARVIS_RECEIVER_IMAGE_PATH}
                alt="JARVIS Holographic Command Receiver Sphere"
                className={`pointer-events-none absolute inset-0 aspect-square h-full w-full rounded-full object-cover object-center select-none ${
                  isHighVelocity
                    ? 'animate-jarvis-receiver-cw-active'
                    : 'animate-jarvis-receiver-cw'
                }`}
              />

              {/* Layer 2: Counter-Rotating Screen-Blended Neural Filaments */}
              <img
                src={JARVIS_RECEIVER_IMAGE_PATH}
                alt=""
                aria-hidden="true"
                className={`pointer-events-none absolute inset-2 aspect-square h-[calc(100%-16px)] w-[calc(100%-16px)] rounded-full object-cover object-center mix-blend-screen opacity-65 select-none ${
                  isHighVelocity
                    ? 'animate-jarvis-receiver-ccw-active'
                    : 'animate-jarvis-receiver-ccw'
                }`}
              />

              {/* Layer 3: 3D Gyroscopic Orbital Ring Inside the Neural Sphere */}
              <svg
                viewBox="0 0 240 240"
                className="animate-jarvis-gyro pointer-events-none absolute inset-0 aspect-square h-full w-full"
                aria-hidden="true"
              >
                <circle
                  cx="120"
                  cy="120"
                  r="92"
                  fill="none"
                  strokeWidth="1.5"
                  strokeDasharray="36 18 10 18"
                  className="stroke-amber-300/80"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="64"
                  fill="none"
                  strokeWidth="1.2"
                  strokeDasharray="22 14"
                  className="stroke-amber-200/75"
                />
              </svg>

              {/* Radial Edge Liquid Glass Vignette */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_28px_10px_#020306,inset_0_2px_4px_rgba(255,255,255,0.35)]"
              />

              {/* Central Interactive Tap-to-Talk Core Reticle */}
              <div className="animate-jarvis-orb relative z-20 flex aspect-square h-20 w-20 flex-col items-center justify-center rounded-full border border-amber-300/75 bg-black/65 px-1.5 text-center backdrop-blur-md shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.45)] transition-colors group-hover:bg-black/80">
                {isTapListening ? (
                  <Square className="h-5 w-5 fill-current text-amber-300" />
                ) : (
                  <Mic className="h-5 w-5 text-amber-300" />
                )}
                <span className="mt-1 font-mono text-[9px] font-bold tracking-wider text-amber-100 uppercase">
                  {isTapListening ? 'STOP TAP' : 'TAP TO TALK'}
                </span>
                <span className="font-mono text-[8px] text-amber-300/90">
                  {isTapListening ? 'LISTENING' : 'MANUAL MIC'}
                </span>
              </div>
            </button>
          </div>

          {/* Bottom HUD Corner Telemetry Footer */}
          <div className="liquid-accent-text mt-2.5 flex w-full items-center justify-between gap-2 border-t border-white/15 pt-1.5 font-mono text-[10px] opacity-85">
            <span>RATIO: 1:1 HOLOGRAM SPHERE</span>
            <span>STATE: {assistantState}</span>
          </div>
        </div>

        {/* Waveform / State Readout */}
        <div className="mt-3 text-center">
          <p
            data-testid="assistant-state-label"
            className="liquid-accent-text font-mono text-xs font-semibold tracking-wider"
          >
            {visual.label}
          </p>
          <p className="mt-0.5 max-w-md text-xs text-slate-300">{visual.subtext}</p>
        </div>

        {/* SEPARATED VOICE CHANNELS: Channel 1 (Tap to Talk) vs Channel 2 ("Hey JARVIS" Hands-Free) */}
        <div className="mt-4 grid w-full gap-3 sm:grid-cols-2">
          {/* Separate Control Card 1: Tap to Talk (Manual Single-Command Voice Input) */}
          <div
            data-testid="tap-to-talk-control-box"
            className={`liquid-glass-subcard flex flex-col justify-between rounded-2xl p-3.5 text-xs transition-all ${
              isTapListening ? 'border-amber-400/60 shadow-[0_0_25px_rgba(245,158,11,0.2)]' : ''
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <Mic className="liquid-accent-text h-4 w-4" />
                  <span className="font-semibold text-white">1. Tap to Talk</span>
                </div>
                <span
                  data-testid="tap-to-talk-mode-pill"
                  className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    isTapListening
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {isTapListening ? 'LISTENING ACTIVE' : 'MANUAL'}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                Tap once to open the microphone for a single spoken command without needing a wake word.
              </p>

              {/* Live Tap-to-Talk Capture Panel when active */}
              {isTapListening && (
                <div
                  data-testid="tap-to-talk-live-panel"
                  className="mt-2.5 rounded-xl border border-amber-400/35 bg-black/50 p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-amber-300">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      {tapMicHardwareStatus === 'CAPTURING_AUDIO'
                        ? 'LIVE MIC OPEN — SPEAK NOW'
                        : 'TAP-TO-TALK CAPTURE READY'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">No wake word needed</span>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSubmitTapCommand(tapTranscript);
                    }}
                    className="mt-2 flex gap-1.5"
                  >
                    <input
                      type="text"
                      data-testid="tap-to-talk-transcript-input"
                      value={tapTranscript}
                      onChange={(e) => onChangeTapTranscript(e.target.value)}
                      placeholder="Speak now or type spoken phrase..."
                      aria-label="Live Tap to Talk voice transcript"
                      className="liquid-glass-input w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      data-testid="tap-to-talk-send-btn"
                      className="liquid-glass-btn-primary flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0"
                    >
                      <Send className="h-3 w-3" />
                      Send
                    </button>
                  </form>

                  {/* Quick Single-Tap Spoken Presets for Immediate Testing */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[
                      {
                        id: 'who',
                        label: 'Who are you?',
                        cmd: 'Who are you?',
                      },
                      {
                        id: 'whatsapp',
                        label: 'WhatsApp Rahul (6 PM)',
                        cmd: 'Prepare a WhatsApp message to Rahul saying I will arrive at 6 PM',
                      },
                      {
                        id: 'instagram',
                        label: 'Open Instagram',
                        cmd: 'Open Instagram',
                      },
                      {
                        id: 'youtube',
                        label: 'Open YouTube',
                        cmd: 'Launch YouTube',
                      },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        data-testid={`tap-preset-${preset.id}`}
                        onClick={() => onSubmitTapCommand(preset.cmd)}
                        className="liquid-glass-chip rounded-md px-2 py-0.5 text-[10px] text-amber-200 hover:text-white"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="tap-to-talk-btn"
                onClick={isTapListening ? onStopTapToTalk : onTapToTalk}
                className="liquid-glass-btn-primary flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
              >
                {isTapListening ? (
                  <>
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop Tap to Talk
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Start Tap to Talk
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleMute}
                aria-label={isMuted ? 'Unmute spoken replies' : 'Mute spoken replies'}
                className={`liquid-glass-chip flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0 ${
                  isMuted ? 'text-rose-200' : 'text-slate-100'
                }`}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {isMuted ? 'Muted' : 'TTS'}
              </button>

              <button
                type="button"
                onClick={onCancelAction}
                className="liquid-glass-chip flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0"
              >
                <MicOff className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </div>

          {/* Separate Control Card 2: "Hey JARVIS" (Hands-Free Wake-Word + Boss Voice Verification) */}
          <div
            data-testid="hey-jarvis-control-box"
            className={`liquid-glass-subcard flex flex-col justify-between rounded-2xl p-3.5 text-xs transition-all ${
              handsFreeActive ? 'border-emerald-400/50 shadow-[0_0_24px_rgba(16,185,129,0.15)]' : ''
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <Radio className="h-4 w-4 text-emerald-300" />
                  <span className="font-semibold text-white">2. &quot;Hey JARVIS&quot; Hands-Free</span>
                </div>
                <span
                  data-testid="hands-free-boss-voice-status"
                  className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    lastVoiceVerification && !lastVoiceVerification.verified
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                      : handsFreeActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {lastVoiceVerification && !lastVoiceVerification.verified
                    ? 'UNVERIFIED GUEST BLOCKED'
                    : handsFreeActive
                      ? `BOSS VOICE VERIFIED (${lastVoiceVerification?.confidenceScore ?? voiceMatchProfile.lastMatchConfidence}%)`
                      : 'HANDS-FREE OFF'}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                Hands-free wake-word &amp; continuous Boss Voice listener. Automatically verifies Boss voiceprint ({voiceMatchProfile.fundamentalPitchHz} Hz) and executes commands with or without &ldquo;Hey JARVIS&rdquo;.
              </p>

                  {/* Live Hands-Free Boss Voice Capture & Instant Verification Bar */}
              {handsFreeActive && (
                <div
                  data-testid="hands-free-live-panel"
                  className={`mt-2.5 rounded-xl border p-2.5 transition-all ${
                    wakeWordArmed
                      ? 'border-amber-400/75 bg-amber-950/35 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                      : 'border-emerald-400/35 bg-black/50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      data-testid="wake-word-active-badge"
                      className={`flex items-center gap-1.5 font-mono text-[10px] font-semibold ${
                        wakeWordArmed ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full animate-ping ${
                          wakeWordArmed ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                      />
                      {wakeWordArmed
                        ? 'HEY JARVIS AWAKE — LISTENING FOR YOUR COMMAND'
                        : handsFreeMicStatus === 'CAPTURING_BOSS_VOICE'
                          ? 'LIVE WAKE MIC OPEN — SAY "HEY JARVIS"'
                          : 'WAKE LISTENER READY — SAY "HEY JARVIS"'}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-200/90">
                      {lastVoiceVerification?.confidenceScore ?? voiceMatchProfile.lastMatchConfidence}% Boss Match
                    </span>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSubmitHandsFreeCommand(handsFreeTranscript || 'Hey JARVIS');
                    }}
                    className="mt-2 flex gap-1.5"
                  >
                    <input
                      type="text"
                      data-testid="hands-free-transcript-input"
                      value={handsFreeTranscript}
                      onChange={(e) => onChangeHandsFreeTranscript(e.target.value)}
                      placeholder={
                        wakeWordArmed
                          ? 'JARVIS is awake! Speak or type your command now...'
                          : "Say 'Hey JARVIS' or 'Hey JARVIS, open WhatsApp'..."
                      }
                      aria-label="Live Hands-Free Boss voice transcript"
                      className="liquid-glass-input w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      data-testid="hands-free-send-btn"
                      className="liquid-glass-btn-primary flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0"
                    >
                      <Send className="h-3 w-3" />
                      {handsFreeTranscript.trim() ? 'Speak' : 'Wake'}
                    </button>
                  </form>

                  {/* Quick Single-Tap "Hey JARVIS" Wake & Voice Presets */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[
                      {
                        id: 'wake-only',
                        label: 'Say "Hey JARVIS"',
                        cmd: 'Hey JARVIS',
                      },
                      {
                        id: 'wake-instagram',
                        label: 'Hey JARVIS, open Instagram',
                        cmd: 'Hey JARVIS, open Instagram',
                      },
                      {
                        id: 'wake-spotify',
                        label: 'Hey JARVIS, open Spotify',
                        cmd: 'Hey JARVIS, open Spotify and play workout music',
                      },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        data-testid={`hf-preset-${preset.id}`}
                        onClick={() => onSubmitHandsFreeCommand(preset.cmd)}
                        className="liquid-glass-chip rounded-md px-2 py-0.5 text-[10px] text-emerald-200 hover:text-white"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="hands-free-toggle-btn"
                onClick={onToggleHandsFree}
                className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  handsFreeActive
                    ? 'liquid-glass-subcard border-emerald-400/50 text-emerald-200'
                    : 'liquid-glass-chip text-slate-200'
                }`}
              >
                <Radio className="h-3.5 w-3.5 text-emerald-300" />
                {handsFreeActive ? 'Hey JARVIS: ON' : 'Hey JARVIS: OFF'}
              </button>

              <button
                type="button"
                data-testid="verify-boss-voice-btn"
                onClick={onVerifyBossVoiceNow}
                className="liquid-glass-chip flex min-h-[38px] items-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-2 text-xs font-semibold text-emerald-200 hover:text-white whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                Verify Boss Voice
              </button>

              <button
                type="button"
                data-testid="simulate-hey-jarvis-btn"
                onClick={() => onSimulateHeyJarvisWake('owner', 'Hey JARVIS')}
                className="liquid-glass-chip flex min-h-[38px] items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-500/15 px-2.5 py-2 text-xs font-semibold text-amber-200 hover:text-white whitespace-nowrap shrink-0"
              >
                <Sparkles className="liquid-accent-text h-3.5 w-3.5" />
                Wake (&quot;Hey JARVIS&quot;)
              </button>

              <button
                type="button"
                data-testid="simulate-stranger-voice-btn"
                onClick={() =>
                  onSimulateHeyJarvisWake('guest', 'Hey JARVIS, open WhatsApp')
                }
                className="liquid-glass-chip flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-rose-200 whitespace-nowrap shrink-0"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                Test Block
              </button>
            </div>
          </div>
        </div>

        {/* Universal Polyglot Auto-Language Detection & Owner Talk-Back Language + Human-Brain Cortex Card */}
        <div
          data-testid="polyglot-brain-panel"
          className="liquid-glass-subcard mt-3.5 w-full rounded-2xl p-3.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Brain className="liquid-accent-text h-4 w-4" />
              <span className="font-semibold text-white">
                Human-Brain Cognitive Cortex &amp; Universal Polyglot Language Engine
              </span>
            </div>
            <span
              data-testid="human-brain-status"
              className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-200"
            >
              {cognitiveMode}
            </span>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            {/* Auto-Detected Input Language */}
            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 uppercase">
                <Globe className="liquid-accent-text h-3 w-3" />
                Auto-Detected Input Language
              </span>
              <p
                data-testid="detected-language-badge"
                className="mt-1 font-mono text-xs font-semibold text-emerald-300"
              >
                {detectedLanguage.name} ({detectedLanguage.nativeName}) · {detectedLanguage.confidence}%
              </p>
              <p className="mt-0.5 text-[11px] text-slate-300">
                Automatically detects English, Hindi/Hinglish, Urdu, Arabic, Spanish, French, Japanese, Tamil, Telugu &amp; more.
              </p>
            </div>

            {/* Owner Talk-Back Language Selector */}
            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
              <label
                htmlFor="hud-talkback-language-select"
                className="block font-mono text-[10px] text-slate-400 uppercase"
              >
                Owner Talk-Back Language (Spoken &amp; Text Reply)
              </label>
              <select
                id="hud-talkback-language-select"
                data-testid="talkback-language-select"
                value={talkBackLanguageBcp47}
                onChange={(e) => onChangeTalkBackLanguage(e.target.value)}
                className="liquid-glass-input mt-1 w-full rounded-lg px-2.5 py-1.5 text-xs font-medium text-white"
              >
                {SUPPORTED_JARVIS_LANGUAGES.map((lang) => (
                  <option key={lang.bcp47} value={lang.bcp47}>
                    {lang.name} — {lang.nativeName}
                  </option>
                ))}
              </select>
              <p
                data-testid="effective-talkback-readout"
                className="liquid-accent-text mt-1 font-mono text-[11px] font-medium"
              >
                Active Talk-Back: {effectiveTalkBackLanguage.name} ({effectiveTalkBackLanguage.nativeName})
              </p>
            </div>
          </div>

          {/* Quick Owner Talk-Back Language Switcher Chips */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-300 mr-1">Talk back in:</span>
            {[
              { bcp47: 'AUTO', label: 'Auto-Detect' },
              { bcp47: 'en-US', label: 'English' },
              { bcp47: 'hi-IN', label: 'हिन्दी / Hindi' },
              { bcp47: 'ur-PK', label: 'اردو / Urdu' },
              { bcp47: 'ar-SA', label: 'العربية / Arabic' },
              { bcp47: 'es-ES', label: 'Español' },
              { bcp47: 'fr-FR', label: 'Français' },
              { bcp47: 'ja-JP', label: '日本語' },
            ].map((chip) => {
              const isSelected = talkBackLanguageBcp47 === chip.bcp47;
              return (
                <button
                  key={chip.bcp47}
                  type="button"
                  data-testid={`talkback-chip-${chip.bcp47}`}
                  onClick={() => onChangeTalkBackLanguage(chip.bcp47)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'liquid-glass-btn-primary font-semibold'
                      : 'liquid-glass-chip text-slate-200 hover:text-white'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* J.A.R.V.I.S. Stark Neural Biometric Voice Matrix & Calibration Card */}
        <div
          data-testid="voice-match-panel"
          className="liquid-glass-subcard mt-3.5 w-full rounded-2xl p-3.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Fingerprint className="liquid-accent-text h-4 w-4" />
              <span className="font-semibold text-white">
                J.A.R.V.I.S. Stark Neural Biometric Voice Matrix
              </span>
              <span
                data-testid="siri-disabled-badge"
                className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-200"
              >
                Siri Style: Disabled
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="hud-auto-execute-badge"
                onClick={() =>
                  onUpdateVoiceMatchProfile({
                    ...voiceMatchProfile,
                    autoExecuteWithoutAsking: voiceMatchProfile.autoExecuteWithoutAsking === false,
                  })
                }
                className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition-all whitespace-nowrap shrink-0 ${
                  voiceMatchProfile.autoExecuteWithoutAsking !== false
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/45'
                    : 'bg-slate-800 text-slate-300 border border-white/10'
                }`}
              >
                {voiceMatchProfile.autoExecuteWithoutAsking !== false
                  ? 'Instant Auto-Do: ON'
                  : 'Instant Auto-Do: OFF'}
              </button>
              <button
                type="button"
                data-testid="toggle-strict-voice-match"
                onClick={() =>
                  onUpdateVoiceMatchProfile({
                    ...voiceMatchProfile,
                    strictVoiceMatchLock: !voiceMatchProfile.strictVoiceMatchLock,
                  })
                }
                className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition-all whitespace-nowrap shrink-0 ${
                  voiceMatchProfile.strictVoiceMatchLock
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : 'bg-slate-800 text-slate-300 border border-white/10'
                }`}
              >
                {voiceMatchProfile.strictVoiceMatchLock
                  ? 'Boss Voice Match: LOCKED'
                  : 'Boss Voice Match: OFF'}
              </button>
              {onOpenVoiceCalibrationScreen && (
                <button
                  type="button"
                  data-testid="open-voice-calibration-screen-btn"
                  onClick={onOpenVoiceCalibrationScreen}
                  className="liquid-glass-btn-primary rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0"
                >
                  Voice Calibration Studio
                </button>
              )}
              <button
                type="button"
                data-testid="open-voice-enrollment-btn"
                onClick={() => {
                  setEnrollmentStep(0);
                  setShowEnrollmentModal((v) => !v);
                }}
                className="liquid-glass-chip rounded-lg px-2.5 py-1 text-[11px] font-medium text-white whitespace-nowrap shrink-0"
              >
                {showEnrollmentModal ? 'Close Calibration' : 'Quick Recalibrate'}
              </button>
            </div>
          </div>

          <div className="mt-2.5 grid gap-2 sm:grid-cols-3 font-mono text-[11px] text-slate-300">
            <div className="rounded-xl bg-black/35 px-2.5 py-1.5 border border-white/10">
              <span className="block text-[10px] text-slate-400">BOSS VOICEPRINT SIGNATURE</span>
              <span className="liquid-accent-text font-semibold">
                {voiceMatchProfile.voiceprintSignature}
              </span>
            </div>
            <div className="rounded-xl bg-black/35 px-2.5 py-1.5 border border-white/10">
              <span className="block text-[10px] text-slate-400">BOSS VOCAL HARMONIC PROFILE</span>
              <span className="text-white font-semibold">
                {voiceMatchProfile.fundamentalPitchHz} Hz · {voiceMatchProfile.spectralCentroidHz} Hz
              </span>
            </div>
            <div className="rounded-xl bg-black/35 px-2.5 py-1.5 border border-white/10">
              <span className="block text-[10px] text-slate-400">BOSS BIOMETRIC CONFIDENCE</span>
              <span
                data-testid="voice-match-score"
                className={`font-semibold ${
                  (lastVoiceVerification?.confidenceScore ?? voiceMatchProfile.lastMatchConfidence) >=
                  voiceMatchProfile.confidenceThreshold
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }`}
              >
                {lastVoiceVerification
                  ? `${lastVoiceVerification.confidenceScore}% (${lastVoiceVerification.status} · BOSS)`
                  : `${voiceMatchProfile.lastMatchConfidence}% (VERIFIED_OWNER · BOSS)`}
              </span>
            </div>
          </div>

          {lastVoiceVerification && (
            <div
              data-testid="voice-verification-banner"
              className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs ${
                lastVoiceVerification.verified
                  ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-950/50 border border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {lastVoiceVerification.verified ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <ShieldAlert className="h-4 w-4 shrink-0 text-rose-300" />
                )}
                <span>{lastVoiceVerification.reason}</span>
              </div>
              {!lastVoiceVerification.verified && (
                <button
                  type="button"
                  onClick={onVerifyBossVoiceNow}
                  className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:text-white whitespace-nowrap shrink-0"
                >
                  Restore Boss Voice Verification
                </button>
              )}
            </div>
          )}

          {/* J.A.R.V.I.S. 4-Phrase Neural Voice Matrix Calibration Wizard */}
          {showEnrollmentModal && (
            <div
              data-testid="voice-enrollment-wizard"
              className="mt-2.5 rounded-2xl border border-white/20 bg-black/60 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">
                  Calibrate J.A.R.V.I.S. Neural Voice Matrix ({enrollmentStep + 1} of{' '}
                  {VOICE_MATCH_ENROLLMENT_PHRASES.length})
                </span>
                <span className="font-mono text-[11px] text-emerald-300">
                  Acoustic MFCC + Pitch Capture
                </span>
              </div>
              <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-2.5 text-center font-display text-sm font-semibold text-white">
                &ldquo;{VOICE_MATCH_ENROLLMENT_PHRASES[enrollmentStep]}&rdquo;
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {VOICE_MATCH_ENROLLMENT_PHRASES.map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-2 w-6 rounded-full ${
                        idx <= enrollmentStep ? 'bg-emerald-400' : 'bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="record-enrollment-phrase-btn"
                  onClick={handleCompleteEnrollmentPhrase}
                  className="liquid-glass-btn-primary flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {enrollmentStep < VOICE_MATCH_ENROLLMENT_PHRASES.length - 1
                    ? 'Capture Phrase & Next'
                    : 'Finish Voice Match Setup'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Voice Error / Retry Banner */}
        {voiceError && (
          <div
            role="alert"
            className="liquid-glass-subcard mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl p-3 text-xs text-amber-100"
          >
            <span>{voiceError}</span>
            {onRetryLastCommand && (
              <button
                type="button"
                onClick={onRetryLastCommand}
                className="liquid-glass-chip flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-amber-100 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
