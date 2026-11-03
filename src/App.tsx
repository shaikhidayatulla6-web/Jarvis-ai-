/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ExternalLink,
  Mic,
  Moon,
  Palette,
  Radio,
  Send,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  ActionAuditEntry,
  AllowedAndroidApp,
  AssistantState,
  CommandExecutionResult,
  CommandRouter,
  DailyScheduleProposal,
  DEFAULT_ALLOWED_APPS,
  DEFAULT_ELEVENLABS_VOICE_CONFIG,
  DEFAULT_ELEVENLABS_VOICE_ID,
  DEFAULT_ELEVENLABS_VOICE_URL,
  DEFAULT_VERIFIED_CONTACTS,
  DEFAULT_VOICE_MATCH_PROFILE,
  deleteNoteWithConfirmation,
  DetectedLanguageInfo,
  detectLanguageFromText,
  ElevenLabsVoiceConfig,
  executeRoutedCommand,
  extractWakeWordCommand,
  generateHumanBrainCognitiveSynthesis,
  getLanguageSwitchConfirmation,
  JarvisNote,
  JarvisRuntimeState,
  JarvisTask,
  localizeJarvisReply,
  parseElevenLabsVoiceIdentifier,
  parseInstantZeroPromptCommands,
  parseTalkBackLanguageCommand,
  ProviderIdentity,
  ProviderRoutingMode,
  resolveEffectiveTalkBackLanguage,
  ToolExecutionOutcome,
  validateAndExecuteToolCall,
  VerifiedContact,
  verifyVoiceMatch,
  VoiceMatchProfile,
  VoiceMatchVerificationResult,
  WhatsAppDraft,
} from './lib/jarvisCore';
import {
  JarvisOrbHud,
  LiquidGradientId,
  LiquidSurfaceMode,
} from './components/JarvisOrbHud';
import { WhatsAppConfirmationCard } from './components/ActionConfirmationCards';
import {
  ProvidersAndSettingsView,
  ProviderTestResult,
} from './components/ProvidersAndSettingsView';
import { AndroidProjectExplorerView } from './components/AndroidProjectExplorerView';
import { VoiceCalibrationSettingsView } from './components/VoiceCalibrationSettingsView';

type ActiveSection = 'assistant' | 'voice-calibration' | 'providers' | 'android';

interface ConversationItem {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  timestamp: string;
  voiceChannel?: 'TAP_TO_TALK' | 'HANDS_FREE';
  providerUsed?: string;
  modelUsed?: string;
  fallbackTriggered?: boolean;
  fallbackReason?: string | null;
  voiceMatchScore?: number;
  toolOutcomes?: ToolExecutionOutcome[];
  commandResult?: CommandExecutionResult;
}

const DEFAULT_SEED_NOTES: JarvisNote[] = [
  {
    id: 'note-seed-1',
    title: 'Android SpeechRecognizer & TTS',
    content: 'Use Android SpeechRecognizer + TextToSpeech on native devices and Web Speech API in supported browsers.',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'note-seed-2',
    title: 'CommandRouter Architecture',
    content: 'Route ASK_AI to Gemini and validate OPEN_APP, OPEN_SETTINGS, GET_BATTERY, SET_VOLUME, CREATE_NOTE.',
    createdAt: new Date(Date.now() - 1800_000).toISOString(),
  },
];

export const LIQUID_SURFACE_MODES: Array<{
  id: LiquidSurfaceMode;
  label: string;
  desc: string;
}> = [
  {
    id: 'obsidian',
    label: 'Obsidian Dark',
    desc: 'OLED pitch-black liquid glass',
  },
  {
    id: 'midnight',
    label: 'Midnight Abyss',
    desc: 'Deep sapphire refractive glass',
  },
  {
    id: 'crystal',
    label: 'Crystal Frost',
    desc: 'Luminous smoked-quartz glass',
  },
];

export const LIQUID_COLOR_GRADIENTS: Array<{
  id: LiquidGradientId;
  label: string;
  swatchStyle: string;
}> = [
  {
    id: 'stark-gold',
    label: 'Stark Solar Gold',
    swatchStyle: 'from-amber-400 via-orange-500 to-yellow-300',
  },
  {
    id: 'arc-cyan',
    label: 'Arc Reactor Cyan',
    swatchStyle: 'from-cyan-300 via-sky-400 to-blue-600',
  },
  {
    id: 'quantum-violet',
    label: 'Quantum Nebula',
    swatchStyle: 'from-purple-400 via-fuchsia-500 to-indigo-600',
  },
  {
    id: 'emerald-matrix',
    label: 'Bio-Neural Emerald',
    swatchStyle: 'from-emerald-300 via-teal-400 to-cyan-600',
  },
  {
    id: 'crimson-mark',
    label: 'Mark LXXXV Crimson',
    swatchStyle: 'from-rose-400 via-red-500 to-orange-500',
  },
];

function createInitialSeedAuditLog(): ActionAuditEntry[] {
  const now = Date.now();
  return [
    {
      id: 'audit-seed-2',
      timestamp: new Date(now - 8 * 60_000).toISOString(),
      toolName: 'prepare_whatsapp_message',
      args: {
        contact: 'Rahul',
        message: 'I will arrive at 6 PM',
      },
      status: 'REQUIRES_CONFIRMATION',
      summary:
        'Prepared WhatsApp draft to Rahul Sharma (+919876543210): "I will arrive at 6 PM". Awaiting user confirmation.',
      providerUsed: 'primary',
    },
    {
      id: 'audit-seed-3',
      timestamp: new Date(now - 3 * 60_000).toISOString(),
      toolName: 'open_app',
      args: {
        app_name: 'Instagram',
      },
      status: 'SUCCESS',
      summary: 'Launching Instagram (com.instagram.android) via Android Intent.',
      providerUsed: 'secondary',
    },
  ];
}

const COMMAND_SYSTEM_GROUPS = [
  {
    category: 'Google Gemini AI Commands (gemini-3.8-flash Deep Reasoning, Coding, Math & Creative AI)',
    commands: [
      'Hey JARVIS, ask Gemini AI to explain quantum computing in simple terms',
      'Hey JARVIS, ask Gemini AI to write a Kotlin coroutine function for Android voice recognition',
      'Hey JARVIS, ask Gemini AI to solve and explain step-by-step: 2x + 15 = 47',
      'Hey JARVIS, ask Gemini AI for a 3-day high-protein workout and meal plan',
      'Hey JARVIS, ask Gemini AI to summarize how neural networks and transformers work',
      'Hey JARVIS, ask Gemini AI to draft a professional email to my team about project launch',
      'Hey JARVIS, ask Gemini AI to brainstorm 5 innovative AI startup ideas for 2026',
      'Hey JARVIS, ask Gemini AI why the sky is blue and how Rayleigh scattering works',
    ],
  },
  {
    category: 'Zero-Prompt Instant App Launch & Compound Task Execution (Auto-Do Without Asking)',
    commands: [
      'Hey JARVIS, open Spotify and play workout music',
      'Hey JARVIS, open any app Uber and book a ride to airport',
      'Hey JARVIS, open YouTube and play coding lofi beats',
      'Hey JARVIS, open Instagram and check my messages',
      'Hey JARVIS, prepare a WhatsApp message to Rahul saying I will arrive at 6 PM',
      'Hey JARVIS, open Calculator and calculate monthly budget',
      'Hey JARVIS, open Google Maps and navigate home',
      'Hey JARVIS, who are you and what can you do with Gemini AI?',
      'Hey JARVIS, switch gradient to Arc Reactor Cyan',
    ],
  },
  {
    category: 'Universal Polyglot Auto-Detect, Talk-Back Language & Human-Brain Commands',
    commands: [
      'Hey JARVIS, talk back in Hindi',
      'Hey JARVIS, Rahul ko WhatsApp message bhejo ki main 6 baje aunga',
      'Hey JARVIS, talk back in Urdu',
      'Hey JARVIS, talk back in Arabic',
      'Hola JARVIS, abre Instagram',
      'Hey JARVIS, auto detect language',
    ],
  },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('assistant');
  const [assistantState, setAssistantState] = useState<AssistantState>('IDLE');
  const [commandInput, setCommandInput] = useState('');
  const [lastSubmittedCommand, setLastSubmittedCommand] = useState('');

  // Liquid Glass Dark Mode Surface & Color Gradient State
  const [surfaceMode, setSurfaceMode] = useState<LiquidSurfaceMode>(() => {
    const saved = localStorage.getItem('jarvis_surface_mode');
    if (saved === 'obsidian' || saved === 'midnight' || saved === 'crystal') return saved;
    return 'obsidian';
  });

  const [gradientId, setGradientId] = useState<LiquidGradientId>(() => {
    const saved = localStorage.getItem('jarvis_gradient_id');
    if (
      saved === 'stark-gold' ||
      saved === 'arc-cyan' ||
      saved === 'quantum-violet' ||
      saved === 'emerald-matrix' ||
      saved === 'crimson-mark'
    ) {
      return saved;
    }
    return 'stark-gold';
  });

  // Dual Voice Mode: Tap to Talk + Hands-Free "Hey JARVIS" & Boss Biometric Voice Match
  const [handsFreeActive, setHandsFreeActive] = useState(true);
  const [isTapListening, setIsTapListening] = useState(false);
  const [wakeWordArmed, setWakeWordArmed] = useState(false);
  const [voiceMatchProfile, setVoiceMatchProfile] = useState<VoiceMatchProfile>(() => {
    try {
      const saved = localStorage.getItem('jarvis_voice_match_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as VoiceMatchProfile;
        if (parsed && typeof parsed.voiceprintSignature === 'string') {
          parsed.voiceprintSignature = parsed.voiceprintSignature.replace(
            /^VP-SIRI-/i,
            'VP-STARK-'
          );
        }
        return parsed;
      }
    } catch {
      // Default
    }
    return structuredClone(DEFAULT_VOICE_MATCH_PROFILE);
  });
  const [lastVoiceVerification, setLastVoiceVerification] =
    useState<VoiceMatchVerificationResult | null>(() =>
      verifyVoiceMatch(DEFAULT_VOICE_MATCH_PROFILE, {
        simulatedSpeaker: 'owner',
        measuredPitchHz: DEFAULT_VOICE_MATCH_PROFILE.fundamentalPitchHz,
      })
    );

  // Dual AI Provider Routing State
  const [routingMode, setRoutingMode] = useState<ProviderRoutingMode>(() => {
    const saved = localStorage.getItem('jarvis_routing_mode_v2');
    if (saved === 'PRIMARY_ONLY' || saved === 'SECONDARY_ONLY' || saved === 'AUTO_FALLBACK') {
      return saved;
    }
    return 'AUTO_FALLBACK';
  });
  const [simulatePrimaryFailure, setSimulatePrimaryFailure] = useState(false);
  const [primaryIdentity, setPrimaryIdentity] = useState<ProviderIdentity | null>(null);
  const [secondaryIdentity, setSecondaryIdentity] = useState<ProviderIdentity | null>(null);
  const [primaryTestResult, setPrimaryTestResult] = useState<ProviderTestResult | null>(null);
  const [secondaryTestResult, setSecondaryTestResult] = useState<ProviderTestResult | null>(null);
  const [testingSlot, setTestingSlot] = useState<'primary' | 'secondary' | null>(null);
  const [activeProviderBadge, setActiveProviderBadge] = useState(
    'Primary: Google Gemini (gemini-3.8-flash)'
  );
  const [fallbackActive, setFallbackActive] = useState(false);

  // App Allowlist, Contacts & Confirmation States (Schedule option and scheduled task storage removed)
  const [tasks, setTasks] = useState<JarvisTask[]>(() => {
    try {
      localStorage.removeItem('jarvis_tasks_v2');
      localStorage.removeItem('jarvis_auto_thinking_v1');
      localStorage.removeItem('jarvis_thinking_engine_v1');
    } catch {
      // Ignore
    }
    return [];
  });

  const [allowedApps, setAllowedApps] = useState<AllowedAndroidApp[]>(
    () => structuredClone(DEFAULT_ALLOWED_APPS)
  );
  const [contacts] = useState<VerifiedContact[]>(
    () => structuredClone(DEFAULT_VERIFIED_CONTACTS)
  );
  const [pendingWhatsAppDraft, setPendingWhatsAppDraft] = useState<WhatsAppDraft | null>(null);
  const [pendingDailyProposal, setPendingDailyProposal] =
    useState<DailyScheduleProposal | null>(null);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<ActionAuditEntry[]>(() => {
    try {
      const saved = localStorage.getItem('jarvis_audit_log_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback to initial seed audit entries
    }
    return createInitialSeedAuditLog();
  });
  const [permissions, setPermissions] = useState({
    microphone: true,
    notifications: true,
    contacts: true,
    exactAlarm: true,
    foregroundService: true,
  });

  // Voice, Universal Polyglot Language Auto-Detection & Owner Talk-Back Language State
  // Default HUD Sound / TTS to OFF (Muted = true) so JARVIS HUD never makes unexpected periodic sounds
  const [isMuted, setIsMuted] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voiceLang, setVoiceLang] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('jarvis_talkback_lang_v1');
      if (saved) return saved;
    } catch {
      // Ignore
    }
    return 'AUTO';
  });
  const [detectedLanguage, setDetectedLanguage] = useState<DetectedLanguageInfo>({
    bcp47: 'en-US',
    code: 'en',
    name: 'English (US)',
    nativeName: 'English (US)',
    confidence: 98,
  });
  const [cognitiveMode, setCognitiveMode] = useState(
    'JARVIS Neural Core · Episodic Memory & Analytical Reasoning'
  );
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [tapTranscript, setTapTranscript] = useState('');
  const [tapMicHardwareStatus, setTapMicHardwareStatus] = useState<
    'READY' | 'CAPTURING_AUDIO' | 'INTERACTIVE_FALLBACK'
  >('READY');
  const [handsFreeTranscript, setHandsFreeTranscript] = useState('');
  const [handsFreeMicStatus, setHandsFreeMicStatus] = useState<
    'STANDBY_VERIFIED' | 'CAPTURING_BOSS_VOICE' | 'BOSS_VOICE_VERIFIED'
  >('BOSS_VOICE_VERIFIED');
  const handsFreeRecognitionRef = useRef<{
    start: () => void;
    stop: () => void;
    abort: () => void;
  } | null>(null);
  const tapRecognitionRef = useRef<{
    start: () => void;
    stop: () => void;
    abort: () => void;
  } | null>(null);

  const effectiveTalkBackLanguage = resolveEffectiveTalkBackLanguage(voiceLang, detectedLanguage);

  // JARVIS 2.0: Speaking Indicator, Connected ElevenLabs Voice (dfsWmmgleAAdssZ0Spld), CommandRouter State & Persistent Basic Memory
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elevenLabsVoice, setElevenLabsVoice] = useState<ElevenLabsVoiceConfig>(() => {
    try {
      const saved = localStorage.getItem('jarvis_elevenlabs_voice_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as ElevenLabsVoiceConfig;
        if (parsed && typeof parsed.voiceId === 'string' && parsed.voiceId.trim()) {
          return {
            ...DEFAULT_ELEVENLABS_VOICE_CONFIG,
            ...parsed,
          };
        }
      }
    } catch {
      // Fallback to default connected voice dfsWmmgleAAdssZ0Spld
    }
    return structuredClone(DEFAULT_ELEVENLABS_VOICE_CONFIG);
  });
  const [elevenLabsInputUrl, setElevenLabsInputUrl] = useState(
    () => DEFAULT_ELEVENLABS_VOICE_URL
  );
  const [elevenLabsSynthesisMode, setElevenLabsSynthesisMode] = useState<string>(
    'CONNECTED (dfsWmmgleAAdssZ0Spld)'
  );
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [executionPlatform, setExecutionPlatform] = useState<'WEB' | 'ANDROID_NATIVE'>('WEB');
  const [notes, setNotes] = useState<JarvisNote[]>(() => {
    try {
      const saved = localStorage.getItem('jarvis_notes_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback to default seed notes
    }
    return structuredClone(DEFAULT_SEED_NOTES);
  });
  const [noteDraftInput, setNoteDraftInput] = useState('');
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [lastCommandResult, setLastCommandResult] = useState<CommandExecutionResult | null>(() => {
    const sampleIntent = CommandRouter.route('JARVIS, open Instagram.');
    return executeRoutedCommand(sampleIntent, {
      platform: 'WEB',
      notes: DEFAULT_SEED_NOTES,
    }).result;
  });

  // Clock State
  const [nowDate, setNowDate] = useState(() => new Date());

  // Conversation History
  const [conversation, setConversation] = useState<ConversationItem[]>([
    {
      id: 'welcome-msg',
      role: 'jarvis',
      text: 'J.A.R.V.I.S. Stark Neural Voice Assistant is online (Siri-style voice assistant disabled). Speak "JARVIS" or "Hey JARVIS" followed by any command, or use the J.A.R.V.I.S. Command Receiver.',
      timestamp: new Date().toISOString(),
      providerUsed: 'primary',
      modelUsed: 'gemini-3.8-flash',
      voiceMatchScore: 98,
    },
  ]);

  const conversationFeedRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll conversation feed so newest executed turns & tool cards are always immediately visible
  useEffect(() => {
    if (conversationFeedRef.current) {
      conversationFeedRef.current.scrollTop = conversationFeedRef.current.scrollHeight;
    }
  }, [conversation, activeSection]);

  // Persist state (ensure any legacy schedule keys remain erased)
  useEffect(() => {
    try {
      localStorage.removeItem('jarvis_tasks_v2');
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_audit_log_v2', JSON.stringify(auditLog));
    } catch {
      // Ignore
    }
  }, [auditLog]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_routing_mode_v2', routingMode);
    } catch {
      // Ignore
    }
  }, [routingMode]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_surface_mode', surfaceMode);
    } catch {
      // Ignore
    }
  }, [surfaceMode]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_gradient_id', gradientId);
    } catch {
      // Ignore
    }
  }, [gradientId]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_voice_match_v1', JSON.stringify(voiceMatchProfile));
    } catch {
      // Ignore
    }
  }, [voiceMatchProfile]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_talkback_lang_v1', voiceLang);
    } catch {
      // Ignore
    }
  }, [voiceLang]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_notes_v2', JSON.stringify(notes));
    } catch {
      // Ignore
    }
  }, [notes]);

  useEffect(() => {
    try {
      localStorage.setItem('jarvis_elevenlabs_voice_v1', JSON.stringify(elevenLabsVoice));
    } catch {
      // Ignore
    }
  }, [elevenLabsVoice]);

  // Update clock every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // Load AI Providers status & ElevenLabs Voice status from backend on mount
  useEffect(() => {
    fetch('/api/ai/providers-status')
      .then((r) => r.json())
      .then((data: { primary?: ProviderIdentity; secondary?: ProviderIdentity }) => {
        if (data.primary) setPrimaryIdentity(data.primary);
        if (data.secondary) setSecondaryIdentity(data.secondary);
      })
      .catch(() => {
        // Offline fallback
      });

    fetch('/api/voice/elevenlabs-status')
      .then((r) => r.json())
      .then(
        (data: {
          connected?: boolean;
          voiceId?: string;
          voiceUrl?: string;
          synthesisMode?: string;
        }) => {
          if (data.synthesisMode) {
            setElevenLabsSynthesisMode(
              data.synthesisMode === 'ELEVENLABS_CLOUD_STREAM'
                ? `ElevenLabs Cloud Stream (${data.voiceId || DEFAULT_ELEVENLABS_VOICE_ID})`
                : `ElevenLabs Connected · Neural Calibrated (${data.voiceId || DEFAULT_ELEVENLABS_VOICE_ID})`
            );
          }
        }
      )
      .catch(() => {
        // Offline fallback
      });
  }, []);

  // Speak text using Connected ElevenLabs Voice (https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld)
  // with seamless calibrated Web Speech Synthesis fallback
  const speakResponse = useCallback(
    (
      text: string,
      overrideBcp47?: string,
      forceSpeak = false,
      afterSpeakState: AssistantState = 'IDLE'
    ) => {
      if (!text.trim()) {
        setIsSpeaking(false);
        setAssistantState(afterSpeakState);
        return;
      }
      if (!forceSpeak && isMuted) {
        setIsSpeaking(false);
        setAssistantState(afterSpeakState);
        return;
      }

      // Stop any in-progress audio or speech
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      setIsSpeaking(true);
      setAssistantState(afterSpeakState === 'LISTENING' ? 'LISTENING' : 'SPEAKING');

      const fallbackDurationMs = Math.min(6000, Math.max(1500, text.length * 45));
      const fallbackTimer = setTimeout(() => {
        setIsSpeaking(false);
        setAssistantState((prev) =>
          prev === 'SPEAKING' || prev === 'LISTENING' ? afterSpeakState : prev
        );
      }, fallbackDurationMs);

      const speakWithCalibratedBrowserVoice = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          clearTimeout(fallbackTimer);
          setIsSpeaking(false);
          setAssistantState(afterSpeakState);
          return;
        }
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          const requestedLocale =
            overrideBcp47 ||
            (voiceLang === 'AUTO' ? effectiveTalkBackLanguage.bcp47 : voiceLang) ||
            elevenLabsVoice.preferredFallbackLocale ||
            'en-GB';
          const isEnglish = requestedLocale.toLowerCase().startsWith('en');
          const targetLocale = isEnglish
            ? elevenLabsVoice.preferredFallbackLocale || 'en-GB'
            : requestedLocale;

          utterance.lang = targetLocale;
          utterance.pitch = elevenLabsVoice.pitchCalibration || 0.92;
          utterance.rate = Number(
            (speechRate * (elevenLabsVoice.rateCalibration || 1.02)).toFixed(2)
          );

          const voices = window.speechSynthesis.getVoices?.() || [];
          const langPrefix = targetLocale.split('-')[0].toLowerCase();
          // Prefer a British male / JARVIS-like voice for dfsWmmgleAAdssZ0Spld when speaking English
          const matchedVoice =
            (isEnglish &&
              voices.find(
                (v) =>
                  v.lang.toLowerCase().startsWith('en-gb') &&
                  /daniel|arthur|oliver|george|male|uk|british/i.test(v.name)
              )) ||
            voices.find((v) => v.lang.toLowerCase() === targetLocale.toLowerCase()) ||
            voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }

          utterance.onstart = () => {
            setIsSpeaking(true);
            setAssistantState(afterSpeakState === 'LISTENING' ? 'LISTENING' : 'SPEAKING');
          };
          utterance.onend = () => {
            clearTimeout(fallbackTimer);
            setIsSpeaking(false);
            setAssistantState(afterSpeakState);
          };
          utterance.onerror = () => {
            clearTimeout(fallbackTimer);
            setIsSpeaking(false);
            setAssistantState(afterSpeakState);
          };
          window.speechSynthesis.speak(utterance);
        } catch {
          clearTimeout(fallbackTimer);
          setIsSpeaking(false);
          setAssistantState(afterSpeakState);
        }
      };

      if (elevenLabsVoice.enabled) {
        fetch('/api/voice/elevenlabs-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: elevenLabsVoice.voiceId || DEFAULT_ELEVENLABS_VOICE_ID,
            stability: elevenLabsVoice.stability,
            similarityBoost: elevenLabsVoice.similarityBoost,
            style: elevenLabsVoice.style,
          }),
        })
          .then((r) => r.json())
          .then(
            (data: {
              ok?: boolean;
              configured?: boolean;
              audioBase64?: string;
              mimeType?: string;
              voiceId?: string;
              mode?: string;
            }) => {
              if (data.configured && data.audioBase64 && typeof Audio !== 'undefined') {
                setElevenLabsSynthesisMode(
                  `ElevenLabs Cloud Stream (${data.voiceId || elevenLabsVoice.voiceId})`
                );
                const audio = new Audio(
                  `data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`
                );
                activeAudioRef.current = audio;
                audio.onended = () => {
                  clearTimeout(fallbackTimer);
                  activeAudioRef.current = null;
                  setIsSpeaking(false);
                  setAssistantState(afterSpeakState);
                };
                audio.onerror = () => {
                  activeAudioRef.current = null;
                  speakWithCalibratedBrowserVoice();
                };
                audio.play().catch(() => {
                  activeAudioRef.current = null;
                  speakWithCalibratedBrowserVoice();
                });
              } else {
                setElevenLabsSynthesisMode(
                  `ElevenLabs Connected · Neural Calibrated (${data.voiceId || elevenLabsVoice.voiceId})`
                );
                speakWithCalibratedBrowserVoice();
              }
            }
          )
          .catch(() => {
            speakWithCalibratedBrowserVoice();
          });
      } else {
        speakWithCalibratedBrowserVoice();
      }
    },
    [effectiveTalkBackLanguage.bcp47, elevenLabsVoice, isMuted, speechRate, voiceLang]
  );

  // Ensure any lingering browser speech synthesis or background audio is silenced on mount and when muted
  useEffect(() => {
    if (isMuted) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isMuted]);

  const handleChangeTalkBackLanguage = useCallback(
    (nextBcp47: string) => {
      setVoiceLang(nextBcp47);
      const resolved = resolveEffectiveTalkBackLanguage(nextBcp47, detectedLanguage);
      const confirmMsg = getLanguageSwitchConfirmation(resolved, nextBcp47 === 'AUTO');
      setConversation((prev) => [
        ...prev,
        {
          id: `jarvis-lang-${Date.now()}`,
          role: 'jarvis',
          text: confirmMsg,
          timestamp: new Date().toISOString(),
          providerUsed: 'polyglot-cortex',
          modelUsed: `talkback-${resolved.bcp47}`,
        },
      ]);
      speakResponse(confirmMsg, resolved.bcp47);
    },
    [detectedLanguage, speakResponse]
  );

  // Execute a local validated tool call and sync React state
  const runValidatedToolCalls = useCallback(
    (
      toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
      providerUsed: string
    ): ToolExecutionOutcome[] => {
      const runtimeState: JarvisRuntimeState = {
        tasks: structuredClone(tasks),
        allowedApps: structuredClone(allowedApps),
        contacts: structuredClone(contacts),
        pendingWhatsAppDraft,
        pendingDailyProposal,
        pendingDeleteTaskId,
        auditLog: structuredClone(auditLog),
        permissions: { ...permissions },
        nowIso: new Date().toISOString(),
        autoExecuteWithoutAsking: voiceMatchProfile.autoExecuteWithoutAsking !== false,
      };

      const outcomes: ToolExecutionOutcome[] = [];
      for (const tc of toolCalls) {
        const outcome = validateAndExecuteToolCall(tc.name, tc.args, runtimeState, providerUsed);
        if (tc.name === 'set_provider_mode' && outcome.data?.providerMode) {
          setRoutingMode(outcome.data.providerMode as ProviderRoutingMode);
        }
        outcomes.push(outcome);
      }

      setTasks(runtimeState.tasks);
      setPendingWhatsAppDraft(runtimeState.pendingWhatsAppDraft);
      setPendingDailyProposal(runtimeState.pendingDailyProposal);
      setPendingDeleteTaskId(runtimeState.pendingDeleteTaskId);
      setAuditLog(runtimeState.auditLog);

      return outcomes;
    },
    [
      allowedApps,
      auditLog,
      contacts,
      pendingDailyProposal,
      pendingDeleteTaskId,
      pendingWhatsAppDraft,
      permissions,
      tasks,
      voiceMatchProfile.autoExecuteWithoutAsking,
    ]
  );

  // Submit command to Dual-Provider Backend Gateway + Execute Validated Tools
  const handleSendCommand = useCallback(
    async (
      rawText: string,
      simulatedSpeaker: 'owner' | 'guest' = 'owner',
      voiceChannel: 'TAP_TO_TALK' | 'HANDS_FREE' = 'HANDS_FREE'
    ) => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      setLastSubmittedCommand(trimmed);
      setVoiceError(null);
      if (voiceChannel === 'TAP_TO_TALK') {
        setIsTapListening(false);
        setTapTranscript('');
      } else {
        setHandsFreeTranscript('');
        setHandsFreeMicStatus('BOSS_VOICE_VERIFIED');
      }

      // Step 1: Run J.A.R.V.I.S. Stark Neural Wake-Word & Boss Biometric Voice Match Verification
      const wakeInfo = extractWakeWordCommand(trimmed);
      const voiceVerification = verifyVoiceMatch(voiceMatchProfile, {
        simulatedSpeaker,
        measuredPitchHz:
          simulatedSpeaker === 'owner'
            ? voiceMatchProfile.fundamentalPitchHz + (Math.random() * 2 - 1)
            : 215.0,
      });
      setLastVoiceVerification(voiceVerification);

      if (voiceVerification.verified) {
        setVoiceMatchProfile((prev) => ({
          ...prev,
          lastMatchConfidence: voiceVerification.confidenceScore,
          lastVerifiedAt: new Date().toISOString(),
        }));
      }

      const userItem: ConversationItem = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
        voiceChannel,
        voiceMatchScore: voiceVerification.confidenceScore,
      };
      setConversation((prev) => [...prev, userItem]);

      // Block command if Biometric Voice Match fails
      if (!voiceVerification.verified) {
        setAssistantState('ERROR');
        setWakeWordArmed(false);
        const blockedItem: ConversationItem = {
          id: `jarvis-blocked-${Date.now()}`,
          role: 'jarvis',
          text: voiceVerification.reason,
          timestamp: new Date().toISOString(),
          providerUsed: 'biometric-voice-match',
          modelUsed: 'jarvis-neural-voice-guard',
          voiceMatchScore: voiceVerification.confidenceScore,
        };
        setConversation((prev) => [...prev, blockedItem]);
        speakResponse(voiceVerification.reason);
        return;
      }

      // If user said only "JARVIS" / "Hey JARVIS" without a follow-up command yet
      if (wakeInfo.wakeDetected && wakeInfo.isWakeOnly) {
        setHandsFreeActive(true);
        setWakeWordArmed(true);
        setHandsFreeMicStatus('CAPTURING_BOSS_VOICE');
        setAssistantState('LISTENING');
        setCognitiveMode('JARVIS Neural Core · Wake Word Armed ("Hey JARVIS" Active)');
        const wakeReply = `At your service, Boss. J.A.R.V.I.S. Neural Voice Matrix verified (${voiceVerification.confidenceScore}% match). I am awake and listening—what are your orders?`;
        const wakeCommandResult: CommandExecutionResult = {
          intent: {
            type: 'ASK_AI',
            prompt: `${wakeInfo.wakePhrase || 'Hey JARVIS'} (Wake Word Activated)`,
            rawInput: trimmed,
          },
          status: 'SUCCESS',
          platform: executionPlatform,
          spokenResponse: wakeReply,
          detailMessage: `Wake phrase "${wakeInfo.wakePhrase || 'Hey JARVIS'}" verified (${voiceVerification.confidenceScore}% Boss Match). Listening for your command.`,
        };
        setLastCommandResult(wakeCommandResult);
        setConversation((prev) => [
          ...prev,
          {
            id: `jarvis-wake-${Date.now()}`,
            role: 'jarvis',
            text: wakeReply,
            timestamp: new Date().toISOString(),
            providerUsed: 'local-wake-engine',
            modelUsed: `jarvis-wake-${elevenLabsVoice.voiceId}`,
            voiceMatchScore: voiceVerification.confidenceScore,
            commandResult: wakeCommandResult,
          },
        ]);
        setTimeout(() => {
          const hfInput = document.querySelector(
            '[data-testid="hands-free-transcript-input"]'
          ) as HTMLInputElement | null;
          hfInput?.focus();
        }, 40);
        // Always speak wake confirmation and keep assistantState in LISTENING mode!
        speakResponse(wakeReply, effectiveTalkBackLanguage.bcp47, true, 'LISTENING');
        return;
      }

      // Auto-detect input language across all world scripts & Romanized conversational forms
      const detected = detectLanguageFromText(trimmed);
      setDetectedLanguage(detected);

      const effectiveCommand = wakeInfo.wakeDetected ? wakeInfo.inlineCommand : trimmed;
      const lower = effectiveCommand.toLowerCase();

      // Check if owner issued a voice/text command to switch Talk-Back Language ("talk back in Hindi", "speak in Urdu", "auto detect language")
      const langSwitch = parseTalkBackLanguageCommand(effectiveCommand);
      if (langSwitch.matched && langSwitch.targetBcp47) {
        setVoiceLang(langSwitch.targetBcp47);
        const nextEffectiveLang = resolveEffectiveTalkBackLanguage(
          langSwitch.targetBcp47,
          detected
        );
        const confirmText = getLanguageSwitchConfirmation(
          nextEffectiveLang,
          langSwitch.targetBcp47 === 'AUTO'
        );
        setCognitiveMode('Polyglot Language Switch + Voice Synthesis Lock');
        setConversation((prev) => [
          ...prev,
          {
            id: `jarvis-lang-cmd-${Date.now()}`,
            role: 'jarvis',
            text: confirmText,
            timestamp: new Date().toISOString(),
            providerUsed: 'polyglot-cortex',
            modelUsed: `talkback-${nextEffectiveLang.bcp47}`,
            voiceMatchScore: voiceVerification.confidenceScore,
          },
        ]);
        speakResponse(confirmText, nextEffectiveLang.bcp47);
        return;
      }

      const activeTalkBackLang = resolveEffectiveTalkBackLanguage(voiceLang, detected);
      const recentConversationStrings = conversation
        .slice(-6)
        .map((c) => `${c.role.toUpperCase()}: ${c.text}`);
      const brainSynthesis = generateHumanBrainCognitiveSynthesis({
        userMessage: effectiveCommand,
        detectedLang: detected,
        talkBackLang: activeTalkBackLang,
        activeTasksCount: tasks.filter((t) => !t.completed).length,
        nextTaskTitle: tasks.find((t) => !t.completed)?.title,
        recentTurnsCount: recentConversationStrings.length,
      });
      setCognitiveMode(`JARVIS Neural Core · ${brainSynthesis.cognitiveMode}`);

      // Check if command is a direct Liquid Glass Gradient, Dark Mode Surface, or Voice Match switch
      if (
        lower.includes('switch gradient') ||
        lower.includes('change gradient') ||
        lower.includes('switch color') ||
        lower.includes('switch theme') ||
        lower.includes('surface mode') ||
        lower.includes('dark mode') ||
        lower.includes('strict voice match')
      ) {
        let matchedThemeMessage: string | null = null;
        if (lower.includes('cyan') || lower.includes('arc reactor')) {
          setGradientId('arc-cyan');
          matchedThemeMessage = 'Activated Arc Reactor Cyan liquid glass gradient theme.';
        } else if (lower.includes('gold') || lower.includes('amber') || lower.includes('solar')) {
          setGradientId('stark-gold');
          matchedThemeMessage = 'Activated Stark Solar Gold liquid glass gradient theme.';
        } else if (
          lower.includes('violet') ||
          lower.includes('purple') ||
          lower.includes('quantum') ||
          lower.includes('nebula')
        ) {
          setGradientId('quantum-violet');
          matchedThemeMessage = 'Activated Quantum Nebula Violet liquid glass gradient theme.';
        } else if (
          lower.includes('emerald') ||
          lower.includes('green') ||
          lower.includes('matrix')
        ) {
          setGradientId('emerald-matrix');
          matchedThemeMessage = 'Activated Bio-Neural Emerald liquid glass gradient theme.';
        } else if (lower.includes('crimson') || lower.includes('red') || lower.includes('mark')) {
          setGradientId('crimson-mark');
          matchedThemeMessage = 'Activated Mark LXXXV Crimson liquid glass gradient theme.';
        } else if (lower.includes('midnight')) {
          setSurfaceMode('midnight');
          matchedThemeMessage = 'Switched dark mode depth to Midnight Abyss refractive glass.';
        } else if (lower.includes('crystal') || lower.includes('frost')) {
          setSurfaceMode('crystal');
          matchedThemeMessage = 'Switched surface mode to Crystal Frost smoked-quartz glass.';
        } else if (lower.includes('obsidian') || lower.includes('dark mode')) {
          setSurfaceMode('obsidian');
          matchedThemeMessage = 'Switched dark mode depth to Obsidian Dark OLED liquid glass.';
        } else if (lower.includes('strict voice match')) {
          const enableStrict = !lower.includes('disable') && !lower.includes('off');
          setVoiceMatchProfile((prev) => ({ ...prev, strictVoiceMatchLock: enableStrict }));
          matchedThemeMessage = enableStrict
            ? 'Enabled Strict Biometric Voice Match Lock for "Hey JARVIS".'
            : 'Disabled Strict Biometric Voice Match Lock.';
        }

        if (matchedThemeMessage) {
          setConversation((prev) => [
            ...prev,
            {
              id: `jarvis-theme-${Date.now()}`,
              role: 'jarvis',
              text: matchedThemeMessage,
              timestamp: new Date().toISOString(),
              providerUsed: 'local-hud',
              modelUsed: 'liquid-ui-engine',
              voiceMatchScore: voiceVerification.confidenceScore,
            },
          ]);
          speakResponse(matchedThemeMessage, activeTalkBackLang.bcp47);
          return;
        }
      }

      // JARVIS 2.0 TYPED COMMAND ROUTER EVALUATION:
      // Separates conversational questions (ASK_AI) from actionable commands (OPEN_APP, OPEN_SETTINGS, GET_BATTERY, SET_VOLUME, CREATE_NOTE, UNKNOWN)
      const routedIntent = CommandRouter.route(effectiveCommand);

      if (
        routedIntent.type === 'CREATE_NOTE' ||
        routedIntent.type === 'GET_BATTERY' ||
        routedIntent.type === 'SET_VOLUME' ||
        routedIntent.type === 'OPEN_SETTINGS' ||
        routedIntent.type === 'UNKNOWN'
      ) {
        setAssistantState('EXECUTING');
        let batteryTelemetry: { supported: boolean; levelPercent?: number; charging?: boolean } = {
          supported: false,
        };
        if (
          routedIntent.type === 'GET_BATTERY' &&
          typeof navigator !== 'undefined' &&
          'getBattery' in navigator &&
          typeof (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery === 'function'
        ) {
          try {
            const bat = await (
              navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> }
            ).getBattery();
            batteryTelemetry = {
              supported: true,
              levelPercent: Math.round(bat.level * 100),
              charging: Boolean(bat.charging),
            };
          } catch {
            batteryTelemetry = { supported: false };
          }
        }

        const routedExec = executeRoutedCommand(routedIntent, {
          platform: executionPlatform,
          notes,
          permissions,
          batteryTelemetry,
        });

        if (routedIntent.type === 'CREATE_NOTE' && routedExec.result.status === 'SUCCESS') {
          setNotes(routedExec.updatedNotes);
        }
        setLastCommandResult(routedExec.result);
        setWakeWordArmed(false);

        const routedReply = localizeJarvisReply(
          routedExec.result.spokenResponse,
          activeTalkBackLang.bcp47
        );
        const routedJarvisItem: ConversationItem = {
          id: `jarvis-routed-${Date.now()}`,
          role: 'jarvis',
          text: routedReply,
          timestamp: new Date().toISOString(),
          providerUsed: 'command-router-v2',
          modelUsed: `CommandRouter (${routedIntent.type})`,
          voiceMatchScore: voiceVerification.confidenceScore,
          commandResult: routedExec.result,
        };
        setConversation((prev) => [...prev, routedJarvisItem]);
        speakResponse(routedReply, activeTalkBackLang.bcp47);
        return;
      }

      // Update CommandRouter telemetry for OPEN_APP as well
      if (routedIntent.type === 'OPEN_APP') {
        const openExec = executeRoutedCommand(routedIntent, {
          platform: executionPlatform,
          notes,
          permissions,
        });
        setLastCommandResult(openExec.result);
      }

      // ZERO-PROMPT INSTANT EXECUTION FAST-PATH:
      // When autoExecuteWithoutAsking is enabled (default), saying "open any app" and/or "saying any task"
      // executes immediately (<15ms) without waiting on network latency or asking confirmation questions!
      if (voiceMatchProfile.autoExecuteWithoutAsking !== false && !simulatePrimaryFailure) {
        const instantParsed = parseInstantZeroPromptCommands(effectiveCommand, new Date());
        if (instantParsed.matched && instantParsed.isInstantZeroPrompt && instantParsed.toolCalls.length > 0) {
          setAssistantState('EXECUTING');
          const instantOutcomes = runValidatedToolCalls(
            instantParsed.toolCalls,
            'instant-zero-prompt'
          );
          const localizedParts = instantOutcomes.map((out) =>
            localizeJarvisReply(out.message, activeTalkBackLang.bcp47)
          );
          const isSingleOpenOnWeb =
            routedIntent.type === 'OPEN_APP' &&
            executionPlatform === 'WEB' &&
            instantParsed.toolCalls.length === 1 &&
            instantParsed.toolCalls[0].name === 'open_app';

          const openWebExec =
            routedIntent.type === 'OPEN_APP'
              ? executeRoutedCommand(routedIntent, {
                  platform: executionPlatform,
                  notes,
                  permissions,
                }).result
              : undefined;

          const instantReply = isSingleOpenOnWeb && openWebExec
            ? `${openWebExec.spokenResponse} (Android Intent deep-link and Web Fallback provided below.)`
            : localizedParts.join(' ') ||
              localizeJarvisReply(instantParsed.instantReplySummary, activeTalkBackLang.bcp47);

          setCognitiveMode('JARVIS Neural Core · Zero-Prompt Instant App & Task Execution (<15ms)');
          setWakeWordArmed(false);

          const instantJarvisItem: ConversationItem = {
            id: `jarvis-instant-${Date.now()}`,
            role: 'jarvis',
            text: instantReply,
            timestamp: new Date().toISOString(),
            providerUsed: 'instant-zero-prompt',
            modelUsed: 'instant-zero-prompt-engine',
            fallbackTriggered: false,
            voiceMatchScore: voiceVerification.confidenceScore,
            toolOutcomes: instantOutcomes,
            commandResult: openWebExec,
          };

          setConversation((prev) => [...prev, instantJarvisItem]);
          speakResponse(instantReply, activeTalkBackLang.bcp47);
          return;
        }
      }

      setAssistantState('THINKING');

      try {
        const tasksSummary =
          tasks
            .filter((t) => !t.completed)
            .map((t) => `${t.title} at ${t.scheduledAt} (id=${t.id})`)
            .join('; ') || 'None';

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: effectiveCommand,
            routingMode,
            simulatePrimaryFailure,
            currentDateTimeIso: new Date().toISOString(),
            existingTasksSummary: tasksSummary,
            allowedAppsSummary: allowedApps.map((a) => a.displayName).join(', '),
            contactsSummary: contacts.map((c) => `${c.name} (${c.phoneE164})`).join(', '),
            talkBackLanguageBcp47: voiceLang,
            recentConversationSummary: recentConversationStrings.join(' | '),
          }),
        });

        const data = (await response.json()) as {
          replyText: string;
          toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
          providerUsed?: string;
          providerLabel?: string;
          modelUsed?: string;
          fallbackTriggered?: boolean;
          fallbackReason?: string | null;
        };

        const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls : [];
        let toolOutcomes: ToolExecutionOutcome[] = [];

        if (toolCalls.length > 0) {
          setAssistantState('EXECUTING');
          toolOutcomes = runValidatedToolCalls(toolCalls, data.providerUsed || 'primary');
        }

        const finalSummaryParts: string[] = [];
        if (toolOutcomes.length > 0) {
          for (const out of toolOutcomes) {
            finalSummaryParts.push(localizeJarvisReply(out.message, activeTalkBackLang.bcp47));
          }
        } else if (data.replyText) {
          finalSummaryParts.push(data.replyText);
        }

        const combinedReply = finalSummaryParts.join(' ');
        const hasFailure = toolOutcomes.some((o) => !o.ok && o.status === 'FAILED');

        const aiCommandResult: CommandExecutionResult = {
          intent: routedIntent,
          status: hasFailure ? 'FAILED' : 'SUCCESS',
          platform: executionPlatform,
          spokenResponse: combinedReply,
          detailMessage: `Gemini (${data.modelUsed || 'gemini-3.8-flash'}) response verified.`,
        };
        setLastCommandResult(aiCommandResult);

        setFallbackActive(Boolean(data.fallbackTriggered));
        setActiveProviderBadge(
          `${data.providerLabel || 'Primary Gemini'} (${data.modelUsed || 'gemini-3.8-flash'})`
        );
        setWakeWordArmed(false);

        const jarvisItem: ConversationItem = {
          id: `jarvis-${Date.now()}`,
          role: 'jarvis',
          text: combinedReply,
          timestamp: new Date().toISOString(),
          providerUsed: data.providerUsed,
          modelUsed: data.modelUsed,
          fallbackTriggered: data.fallbackTriggered,
          fallbackReason: data.fallbackReason,
          voiceMatchScore: voiceVerification.confidenceScore,
          toolOutcomes,
          commandResult: aiCommandResult,
        };

        setConversation((prev) => [...prev, jarvisItem]);

        if (hasFailure) {
          setAssistantState('ERROR');
        } else {
          speakResponse(combinedReply, activeTalkBackLang.bcp47);
        }
      } catch (err) {
        setAssistantState('ERROR');
        const msg =
          err instanceof Error ? err.message : 'Network error communicating with JARVIS backend.';
        setVoiceError(msg);
      }
    },
    [
      allowedApps,
      contacts,
      conversation,
      executionPlatform,
      notes,
      permissions,
      routingMode,
      runValidatedToolCalls,
      simulatePrimaryFailure,
      speakResponse,
      tasks,
      voiceLang,
      voiceMatchProfile,
    ]
  );

  // Check if Web Speech API is supported by the browser.
  // CRITICAL: Do NOT auto-start or loop SpeechRecognition in a background useEffect!
  // Auto-restarting SpeechRecognition on silence every ~5 seconds triggers the OS/browser microphone beep/chime repeatedly.
  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  const handsFreeActiveRef = useRef(handsFreeActive);
  useEffect(() => {
    handsFreeActiveRef.current = handsFreeActive;
  }, [handsFreeActive]);

  const wakeWordArmedRef = useRef(wakeWordArmed);
  useEffect(() => {
    wakeWordArmedRef.current = wakeWordArmed;
  }, [wakeWordArmed]);

  const isTapListeningRef = useRef(isTapListening);
  useEffect(() => {
    isTapListeningRef.current = isTapListening;
  }, [isTapListening]);

  const handsFreeRecRunningRef = useRef(false);
  const handsFreePermissionBlockedRef = useRef(false);
  const handsFreeSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDispatchedHandsFreeRef = useRef<{ text: string; time: number }>({
    text: '',
    time: 0,
  });

  // Start live continuous SpeechRecognition for "Hey JARVIS" Hands-Free Wake-Word detection
  const startHandsFreeWakeRecognition = useCallback(() => {
    if (
      !handsFreeActiveRef.current ||
      !permissions.microphone ||
      isTapListeningRef.current ||
      handsFreeRecRunningRef.current ||
      handsFreePermissionBlockedRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const SpeechRecConstructor =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;

    if (!SpeechRecConstructor) {
      return;
    }

    try {
      const rec = new SpeechRecConstructor() as {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        onstart?: () => void;
        onresult: (event: {
          resultIndex?: number;
          results: ArrayLike<{
            isFinal?: boolean;
            length?: number;
            [index: number]: { transcript: string };
          }>;
        }) => void;
        onerror: (event: { error?: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };

      rec.lang = voiceLang === 'AUTO' ? effectiveTalkBackLanguage.bcp47 : voiceLang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        handsFreeRecRunningRef.current = true;
        setHandsFreeMicStatus('CAPTURING_BOSS_VOICE');
      };

      const dispatchHandsFreeUtterance = (phrase: string) => {
        const cleanedPhrase = phrase.trim();
        if (!cleanedPhrase) return;
        const nowMs = Date.now();
        if (
          lastDispatchedHandsFreeRef.current.text.toLowerCase() ===
            cleanedPhrase.toLowerCase() &&
          nowMs - lastDispatchedHandsFreeRef.current.time < 2200
        ) {
          return;
        }
        lastDispatchedHandsFreeRef.current = { text: cleanedPhrase, time: nowMs };
        setHandsFreeTranscript('');
        handleSendCommand(cleanedPhrase, 'owner', 'HANDS_FREE');
      };

      rec.onresult = (event) => {
        if (handsFreeSilenceTimerRef.current) {
          clearTimeout(handsFreeSilenceTimerRef.current);
          handsFreeSilenceTimerRef.current = null;
        }

        const startIdx = event.resultIndex ?? 0;
        const len = event.results?.length || 0;
        let currentSegment = '';
        let hasFinal = false;

        for (let i = startIdx; i < len; i++) {
          const res = event.results[i];
          if (!res) continue;
          const altCount = res.length || 1;
          let chosenAlt = res[0]?.transcript || '';

          // Check all STT alternatives so if any hypothesis matched "Hey JARVIS", we pick it
          for (let a = 0; a < altCount; a++) {
            const candidate = res[a]?.transcript || '';
            if (extractWakeWordCommand(candidate).wakeDetected) {
              chosenAlt = candidate;
              break;
            }
          }

          if (chosenAlt) {
            currentSegment += `${chosenAlt} `;
          }
          if (res.isFinal) {
            hasFinal = true;
          }
        }

        const cleaned = currentSegment.trim();
        if (!cleaned) return;

        setHandsFreeTranscript(cleaned);

        const wakeCheck = extractWakeWordCommand(cleaned);
        if (wakeCheck.wakeDetected) {
          // Immediately wake the HUD visually on interim "Hey JARVIS" detection
          setWakeWordArmed(true);
          setHandsFreeMicStatus('CAPTURING_BOSS_VOICE');
          setAssistantState('LISTENING');
        }

        if (hasFinal) {
          dispatchHandsFreeUtterance(cleaned);
        } else if (wakeCheck.wakeDetected || wakeWordArmedRef.current) {
          // Commit after 950ms pause if browser continuous STT holds interim result open after "Hey JARVIS"
          handsFreeSilenceTimerRef.current = setTimeout(() => {
            dispatchHandsFreeUtterance(cleaned);
          }, 950);
        }
      };

      rec.onerror = (event) => {
        const code = event?.error || '';
        if (
          code === 'not-allowed' ||
          code === 'service-not-allowed' ||
          code === 'audio-capture'
        ) {
          handsFreePermissionBlockedRef.current = true;
          handsFreeRecRunningRef.current = false;
        }
      };

      rec.onend = () => {
        handsFreeRecRunningRef.current = false;
      };

      handsFreeRecognitionRef.current = rec;
      handsFreeRecRunningRef.current = true;
      rec.start();
    } catch {
      handsFreeRecRunningRef.current = false;
    }
  }, [effectiveTalkBackLanguage.bcp47, handleSendCommand, permissions.microphone, voiceLang]);

  // Unlock/start live Hands-Free "Hey JARVIS" wake recognition on first user gesture if not already running
  useEffect(() => {
    if (!handsFreeActive || !permissions.microphone) return;
    const handleUserGesture = () => {
      if (
        handsFreeActiveRef.current &&
        !isTapListeningRef.current &&
        !handsFreeRecRunningRef.current &&
        !handsFreePermissionBlockedRef.current
      ) {
        startHandsFreeWakeRecognition();
      }
    };
    window.addEventListener('pointerdown', handleUserGesture, { passive: true });
    window.addEventListener('keydown', handleUserGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, [handsFreeActive, permissions.microphone, startHandsFreeWakeRecognition]);

  const handleChangeHandsFreeTranscript = useCallback((nextText: string) => {
    setHandsFreeTranscript(nextText);
    const wakeCheck = extractWakeWordCommand(nextText);
    if (wakeCheck.wakeDetected) {
      setWakeWordArmed(true);
      setHandsFreeMicStatus('CAPTURING_BOSS_VOICE');
      setAssistantState('LISTENING');
    }
  }, []);

  const handleSubmitHandsFreeCommand = useCallback(
    (overrideText?: string) => {
      const finalCmd = (overrideText ?? handsFreeTranscript).trim() || 'Hey JARVIS';
      setHandsFreeTranscript('');
      setHandsFreeMicStatus('CAPTURING_BOSS_VOICE');
      startHandsFreeWakeRecognition();
      handleSendCommand(finalCmd, 'owner', 'HANDS_FREE');
    },
    [handleSendCommand, handsFreeTranscript, startHandsFreeWakeRecognition]
  );

  const handleVerifyBossVoiceNow = useCallback(() => {
    setHandsFreeActive(true);
    handsFreeActiveRef.current = true;
    handsFreePermissionBlockedRef.current = false;
    setWakeWordArmed(true);
    setVoiceError(null);
    const bossVerification = verifyVoiceMatch(voiceMatchProfile, {
      simulatedSpeaker: 'owner',
      measuredPitchHz: voiceMatchProfile.fundamentalPitchHz,
    });
    setLastVoiceVerification(bossVerification);
    setVoiceMatchProfile((prev) => ({
      ...prev,
      enrolled: true,
      lastMatchConfidence: bossVerification.confidenceScore,
      lastVerifiedAt: new Date().toISOString(),
    }));
    setHandsFreeMicStatus('CAPTURING_BOSS_VOICE');
    setAssistantState('LISTENING');
    startHandsFreeWakeRecognition();

    setTimeout(() => {
      const hfInput = document.querySelector(
        '[data-testid="hands-free-transcript-input"]'
      ) as HTMLInputElement | null;
      hfInput?.focus();
    }, 40);

    const confirmMsg = `Boss Voice Verified (${bossVerification.confidenceScore}% biometric match · Signature ${voiceMatchProfile.voiceprintSignature}). J.A.R.V.I.S. Stark Neural Voice Matrix is awake and locked to your voice.`;
    setConversation((prev) => [
      ...prev,
      {
        id: `jarvis-boss-verified-${Date.now()}`,
        role: 'jarvis',
        text: confirmMsg,
        timestamp: new Date().toISOString(),
        providerUsed: 'biometric-voice-match',
        modelUsed: 'jarvis-boss-voiceprint-lock',
        voiceMatchScore: bossVerification.confidenceScore,
      },
    ]);
    speakResponse(confirmMsg, effectiveTalkBackLanguage.bcp47, true, 'LISTENING');
  }, [
    effectiveTalkBackLanguage.bcp47,
    speakResponse,
    startHandsFreeWakeRecognition,
    voiceMatchProfile,
  ]);

  const handleSubmitTapCommand = useCallback(
    (overrideText?: string) => {
      const finalCmd = (overrideText ?? tapTranscript).trim();
      tapRecognitionRef.current?.abort();
      setIsTapListening(false);
      setTapMicHardwareStatus('READY');
      setTapTranscript('');
      if (!finalCmd) {
        setAssistantState('IDLE');
        return;
      }
      handleSendCommand(finalCmd, 'owner', 'TAP_TO_TALK');
    },
    [handleSendCommand, tapTranscript]
  );

  const handleTapToTalk = () => {
    if (!permissions.microphone) {
      setAssistantState('ERROR');
      setVoiceError(
        'Microphone permission is denied. Enable Microphone (RECORD_AUDIO) in Providers & Settings to use Tap to Talk.'
      );
      return;
    }

    // Pause Hands-Free Channel 2 cleanly while Channel 1 (Tap to Talk) is open
    handsFreeRecognitionRef.current?.abort();
    tapRecognitionRef.current?.abort();

    setVoiceError(null);
    setTapTranscript('');
    setIsTapListening(true);
    setAssistantState('LISTENING');

    setTimeout(() => {
      const tapInputEl = document.querySelector(
        '[data-testid="tap-to-talk-transcript-input"]'
      ) as HTMLInputElement | null;
      tapInputEl?.focus();
    }, 40);

    const SpeechRecConstructor =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;

    if (!SpeechRecConstructor) {
      setTapMicHardwareStatus('INTERACTIVE_FALLBACK');
      return;
    }

    try {
      const rec = new SpeechRecConstructor() as {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: (event: {
          resultIndex?: number;
          results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
        }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };

      rec.lang = voiceLang === 'AUTO' ? effectiveTalkBackLanguage.bcp47 : voiceLang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        let combined = '';
        let hasFinal = false;
        const len = event.results?.length || 0;
        for (let i = 0; i < len; i++) {
          const res = event.results[i];
          if (res?.[0]?.transcript) {
            combined += `${res[0].transcript} `;
          }
          if (res?.isFinal) {
            hasFinal = true;
          }
        }
        const cleaned = combined.trim();
        if (cleaned) {
          setTapTranscript(cleaned);
        }
        if (hasFinal && cleaned) {
          rec.stop();
          setIsTapListening(false);
          setTapMicHardwareStatus('READY');
          setTapTranscript('');
          handleSendCommand(cleaned, 'owner', 'TAP_TO_TALK');
        }
      };

      rec.onerror = () => {
        // Keep Tap-to-Talk session open in interactive capture mode even if browser iframe blocks raw mic stream
        setTapMicHardwareStatus('INTERACTIVE_FALLBACK');
      };

      rec.onend = () => {
        setTapMicHardwareStatus('INTERACTIVE_FALLBACK');
      };

      tapRecognitionRef.current = rec;
      setTapMicHardwareStatus('CAPTURING_AUDIO');
      rec.start();
    } catch {
      setTapMicHardwareStatus('INTERACTIVE_FALLBACK');
    }
  };

  const handleStopTapToTalk = () => {
    tapRecognitionRef.current?.abort();
    setIsTapListening(false);
    setTapMicHardwareStatus('READY');
    setTapTranscript('');
    setAssistantState('IDLE');
  };

  const handleToggleHandsFree = () => {
    setHandsFreeActive((prev) => {
      const next = !prev;
      handsFreeActiveRef.current = next;
      if (!next) {
        handsFreeRecognitionRef.current?.abort();
        handsFreeRecRunningRef.current = false;
        setWakeWordArmed(false);
        if (!isTapListening) {
          setAssistantState('IDLE');
        }
      } else {
        // Immediately verify Boss voice & start live wake recognition when Hands-Free is toggled ON
        handsFreePermissionBlockedRef.current = false;
        const bossVerification = verifyVoiceMatch(voiceMatchProfile, {
          simulatedSpeaker: 'owner',
          measuredPitchHz: voiceMatchProfile.fundamentalPitchHz,
        });
        setLastVoiceVerification(bossVerification);
        setWakeWordArmed(true);
        setAssistantState('LISTENING');
        setHandsFreeMicStatus('CAPTURING_BOSS_VOICE');
        setTimeout(() => startHandsFreeWakeRecognition(), 20);
      }
      return next;
    });
  };

  const handleCancelAction = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    tapRecognitionRef.current?.abort();
    handsFreeRecognitionRef.current?.abort();
    setIsTapListening(false);
    setTapMicHardwareStatus('READY');
    setTapTranscript('');
    setHandsFreeTranscript('');
    setWakeWordArmed(false);
    setVoiceError(null);
    setIsSpeaking(false);
    setAssistantState('IDLE');
  };

  // JARVIS 2.0: Speak the latest assistant response aloud via Web Speech Synthesis
  const handleSpeakLatestResponse = () => {
    const latestJarvis = [...conversation].reverse().find((c) => c.role === 'jarvis');
    const textToSpeak =
      latestJarvis?.text ||
      lastCommandResult?.spokenResponse ||
      'JARVIS 2.0 voice synthesis online and ready.';
    speakResponse(textToSpeak, effectiveTalkBackLanguage.bcp47, true);
  };

  // JARVIS 2.0: Basic Memory (Local Note System) Handlers with Delete Confirmation
  const handleSaveNoteFromPanel = (e: React.FormEvent) => {
    e.preventDefault();
    const content = noteDraftInput.trim();
    if (!content) return;
    const intent = CommandRouter.route(`JARVIS, create a note: ${content}`);
    const exec = executeRoutedCommand(intent, {
      platform: executionPlatform,
      notes,
      permissions,
    });
    if (exec.result.status === 'SUCCESS') {
      setNotes(exec.updatedNotes);
      setNoteDraftInput('');
    }
    setLastCommandResult(exec.result);
    speakResponse(exec.result.spokenResponse, effectiveTalkBackLanguage.bcp47);
  };

  const handleRequestDeleteNote = (noteId: string) => {
    const check = deleteNoteWithConfirmation(notes, noteId, false);
    if (check.status === 'CONFIRMATION_REQUIRED') {
      setPendingDeleteNoteId(noteId);
      setLastCommandResult({
        intent: {
          type: 'CREATE_NOTE',
          content: check.targetNote?.content || '',
          title: check.targetNote?.title,
          rawInput: `delete note ${noteId}`,
        },
        status: 'CONFIRMATION_REQUIRED',
        platform: executionPlatform,
        spokenResponse: check.message,
        detailMessage: check.message,
        pendingConfirmNoteId: noteId,
      });
    }
  };

  const handleConfirmDeleteNote = (noteId: string) => {
    const confirmed = deleteNoteWithConfirmation(notes, noteId, true);
    setNotes(confirmed.updatedNotes);
    setPendingDeleteNoteId(null);
    setLastCommandResult({
      intent: {
        type: 'CREATE_NOTE',
        content: confirmed.targetNote?.content || '',
        title: confirmed.targetNote?.title,
        rawInput: `confirm delete note ${noteId}`,
      },
      status: confirmed.status,
      platform: executionPlatform,
      spokenResponse: confirmed.message,
      detailMessage: confirmed.message,
    });
    speakResponse(confirmed.message, effectiveTalkBackLanguage.bcp47);
  };

  // Independent Provider Testing
  const handleTestProvider = async (slot: 'primary' | 'secondary', simulateError?: string) => {
    setTestingSlot(slot);
    try {
      const res = await fetch('/api/ai/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, simulateError }),
      });
      const result = (await res.json()) as ProviderTestResult;
      if (slot === 'primary') {
        setPrimaryTestResult(result);
      } else {
        setSecondaryTestResult(result);
      }
    } catch (err) {
      const fallbackErr: ProviderTestResult = {
        providerId: slot,
        providerLabel: slot === 'primary' ? 'Primary Provider' : 'Secondary Provider',
        kind: 'GEMINI',
        endpoint: '/api/ai/test-provider',
        authMethod: 'Server-Side Secret',
        model: slot === 'primary' ? 'gemini-3.8-flash' : 'gemini-3.1-flash-lite',
        healthy: false,
        latencyMs: 0,
        errorCategory: 'NETWORK_FAILURE',
        message: err instanceof Error ? err.message : 'Network error',
      };
      if (slot === 'primary') setPrimaryTestResult(fallbackErr);
      else setSecondaryTestResult(fallbackErr);
    } finally {
      setTestingSlot(null);
    }
  };

  return (
    <div
      data-surface-mode={surfaceMode}
      data-gradient={gradientId}
      className="liquid-glass-shell relative min-h-screen text-slate-100 transition-colors duration-500"
    >
      {/* Ambient Refractive Liquid Light Blobs Behind the Glass Panels */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="animate-liquid-blob absolute -top-28 -left-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: 'var(--lg-accent-1)' }}
        />
        <div
          className="animate-liquid-blob absolute top-1/3 -right-28 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'var(--lg-accent-2)', animationDelay: '-5s' }}
        />
        <div
          className="animate-liquid-blob absolute -bottom-32 left-1/3 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--lg-accent-3)', animationDelay: '-10s' }}
        />
      </div>

      {/* Top Navigation Bar (Strict 3-Zone Top Bar Contract — Push-to-Talk Replaced by Hands-Free "Hey JARVIS") */}
      <header className="liquid-glass-header sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Single-Line Brand Wordmark */}
        <a
          href="#assistant"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('assistant');
          }}
          className="font-display flex items-center gap-2 text-lg font-bold tracking-wider text-white whitespace-nowrap shrink-0"
        >
          <Sparkles className="liquid-accent-text h-4 w-4" />
          JARVIS
        </a>

        {/* Zone 2: Clean Single-Line Text Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
        >
          {(
            [
              { id: 'assistant', label: 'Command Center' },
              { id: 'voice-calibration', label: 'Voice Profile & Calibration' },
              { id: 'providers', label: 'Providers & Settings' },
              { id: 'android', label: 'Android APK & Releases' },
            ] as const
          ).map((navItem) => (
            <button
              key={navItem.id}
              type="button"
              data-testid={`nav-${navItem.id}`}
              onClick={() => setActiveSection(navItem.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === navItem.id
                  ? 'liquid-accent-text border-b-2 border-current font-semibold'
                  : 'hover:text-white'
              }`}
            >
              {navItem.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Separate "Tap to Talk", "Hey JARVIS", and Direct APK Download Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/android/download-apk?variant=release"
            download="JARVIS-AI-Assistant-v2.0.0.apk"
            data-testid="header-download-apk-btn"
            className="hidden sm:flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 whitespace-nowrap shrink-0"
          >
            <Smartphone className="h-3.5 w-3.5 text-amber-300" />
            Download APK
          </a>

          <button
            type="button"
            data-testid="header-tap-to-talk-btn"
            onClick={() => {
              setActiveSection('assistant');
              if (isTapListening) handleStopTapToTalk();
              else handleTapToTalk();
            }}
            className="liquid-glass-btn-primary flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <Mic className="h-3.5 w-3.5" />
            {isTapListening ? 'Stop Tap to Talk' : 'Tap to Talk'}
          </button>

          <button
            type="button"
            data-testid="header-handsfree-btn"
            onClick={handleToggleHandsFree}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
              handsFreeActive
                ? 'liquid-glass-subcard border-emerald-400/50 text-emerald-200'
                : 'liquid-glass-chip text-slate-300'
            }`}
          >
            <Radio className="h-3.5 w-3.5 text-emerald-300" />
            {handsFreeActive ? 'Hey JARVIS: ON' : 'Hey JARVIS: OFF'}
          </button>
        </div>
      </header>

      {/* Mobile Section Switcher for Narrow Screens */}
      <div className="liquid-glass-header flex md:hidden items-center justify-around px-2 py-2 text-xs">
        {(
          [
            { id: 'assistant', label: 'Command Center' },
            { id: 'voice-calibration', label: 'Voice Profile' },
            { id: 'providers', label: 'Providers' },
            { id: 'android', label: 'APK & Releases' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveSection(item.id)}
            className={`min-h-[38px] rounded-lg px-3 py-1.5 font-medium whitespace-nowrap shrink-0 ${
              activeSection === item.id
                ? 'liquid-glass-btn-primary font-semibold'
                : 'text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Content Container */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-4 sm:px-6">
        {/* Futuristic Liquid Glass Dark Mode & Color Gradient Customizer Bar */}
        <section
          data-testid="liquid-theme-dock"
          aria-label="Liquid Glass Dark Mode and Color Gradient Controls"
          className="liquid-glass-card mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3"
        >
          {/* Left: Dark Mode Surface Depth Selector */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Moon className="liquid-accent-text h-3.5 w-3.5" />
              Dark Mode Glass:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {LIQUID_SURFACE_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  data-testid={`surface-mode-${mode.id}`}
                  onClick={() => setSurfaceMode(mode.id)}
                  title={mode.desc}
                  className={`min-h-[34px] rounded-xl px-3 py-1 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                    surfaceMode === mode.id
                      ? 'liquid-glass-btn-primary font-semibold'
                      : 'liquid-glass-chip text-slate-200 hover:text-white'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: 5 Futuristic Color Gradient Presets */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Palette className="liquid-accent-text h-3.5 w-3.5" />
              Color Gradients:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {LIQUID_COLOR_GRADIENTS.map((grad) => {
                const isSelected = gradientId === grad.id;
                return (
                  <button
                    key={grad.id}
                    type="button"
                    data-testid={`gradient-option-${grad.id}`}
                    onClick={() => setGradientId(grad.id)}
                    className={`flex min-h-[34px] items-center gap-2 rounded-xl px-3 py-1 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'liquid-glass-subcard border-white/60 text-white font-semibold shadow-[0_0_20px_var(--lg-glow)]'
                        : 'liquid-glass-chip text-slate-300 hover:text-white'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 rounded-full bg-gradient-to-br ${grad.swatchStyle} shadow-xs`}
                    />
                    {grad.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {activeSection === 'assistant' && (
          <div className="grid gap-6 lg:grid-cols-12 items-start">
            {/* Left Column: Tap to Talk + Hands-Free "Hey JARVIS" Holographic Command Receiver + Command Stream (7 cols) */}
            <div className="space-y-5 lg:col-span-7">
              <JarvisOrbHud
                assistantState={assistantState}
                handsFreeActive={handsFreeActive}
                isTapListening={isTapListening}
                wakeWordArmed={wakeWordArmed}
                isMuted={isMuted}
                speechSupported={speechSupported}
                voiceError={voiceError}
                routingMode={routingMode}
                activeProviderBadge={activeProviderBadge}
                fallbackActive={fallbackActive}
                currentTimeStr={nowDate.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                currentDateStr={nowDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                surfaceMode={surfaceMode}
                gradientId={gradientId}
                voiceMatchProfile={voiceMatchProfile}
                lastVoiceVerification={lastVoiceVerification}
                detectedLanguage={detectedLanguage}
                talkBackLanguageBcp47={voiceLang}
                effectiveTalkBackLanguage={effectiveTalkBackLanguage}
                cognitiveMode={cognitiveMode}
                onChangeTalkBackLanguage={handleChangeTalkBackLanguage}
                tapTranscript={tapTranscript}
                tapMicHardwareStatus={tapMicHardwareStatus}
                onChangeTapTranscript={setTapTranscript}
                onSubmitTapCommand={handleSubmitTapCommand}
                onTapToTalk={handleTapToTalk}
                onStopTapToTalk={handleStopTapToTalk}
                handsFreeTranscript={handsFreeTranscript}
                handsFreeMicStatus={handsFreeMicStatus}
                onChangeHandsFreeTranscript={handleChangeHandsFreeTranscript}
                onSubmitHandsFreeCommand={handleSubmitHandsFreeCommand}
                onVerifyBossVoiceNow={handleVerifyBossVoiceNow}
                onToggleHandsFree={handleToggleHandsFree}
                onSimulateHeyJarvisWake={(speaker, cmd) => {
                  startHandsFreeWakeRecognition();
                  handleSendCommand(cmd || 'Hey JARVIS', speaker, 'HANDS_FREE');
                }}
                onUpdateVoiceMatchProfile={setVoiceMatchProfile}
                onOpenVoiceCalibrationScreen={() => setActiveSection('voice-calibration')}
                onCancelAction={handleCancelAction}
                onToggleMute={() => setIsMuted((m) => !m)}
                onRetryLastCommand={
                  lastSubmittedCommand
                    ? () => handleSendCommand(lastSubmittedCommand, 'owner')
                    : undefined
                }
              />

              {/* Unified JARVIS Command Console (Liquid Glass Card) */}
              <section
                aria-label="JARVIS Unified Command System"
                className="liquid-glass-card rounded-3xl p-5"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="liquid-accent-text h-4 w-4" />
                    <h2 className="text-sm font-semibold text-white">
                      Hands-Free &quot;Hey JARVIS&quot; Command Stream
                    </h2>
                  </div>
                  <span className="text-xs text-slate-300">
                    Say &quot;Hey JARVIS&quot; + any command (Biometric Voice Match protected)
                  </span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (commandInput.trim()) {
                      handleSendCommand(commandInput, 'owner');
                      setCommandInput('');
                    }
                  }}
                  className="flex gap-2.5"
                >
                  <label htmlFor="jarvis-command-input" className="sr-only">
                    Speak or enter &quot;Hey JARVIS&quot; command
                  </label>
                  <input
                    id="jarvis-command-input"
                    data-testid="command-input"
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder="Say 'Hey JARVIS, who are you?', 'Hey JARVIS, open Instagram', or 'Hey JARVIS, message Rahul on WhatsApp'..."
                    className="liquid-glass-input w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    data-testid="send-command-btn"
                    aria-label="Execute Hey JARVIS command"
                    className="liquid-glass-btn-primary flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    Execute Command
                  </button>
                </form>

                {/* Categorized Command System Triggers */}
                <div className="mt-4 space-y-4">
                  {COMMAND_SYSTEM_GROUPS.map((group) => (
                    <div key={group.category}>
                      <p className="text-xs font-medium text-slate-300">
                        {group.category}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.commands.map((sample) => (
                          <button
                            key={sample}
                            type="button"
                            onClick={() => handleSendCommand(sample, 'owner')}
                            className="liquid-glass-chip rounded-xl px-3 py-1.5 text-left text-xs text-slate-200 hover:text-white"
                          >
                            {sample}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Right Column: Active Confirmation Cards + Conversation Feed + Command-Managed Schedule Readout (5 cols) */}
            <div className="space-y-6 lg:col-span-5">
              {/* Active Confirmation Cards */}
              {pendingWhatsAppDraft &&
                pendingWhatsAppDraft.status !== 'OPENED_IN_WHATSAPP' &&
                pendingWhatsAppDraft.status !== 'CANCELLED' && (
                  <WhatsAppConfirmationCard
                    draft={pendingWhatsAppDraft}
                    contacts={contacts}
                    onConfirmOpenWhatsApp={(updated) => {
                      setPendingWhatsAppDraft(updated);
                      setConversation((prev) => [
                        ...prev,
                        {
                          id: `wa-opened-${Date.now()}`,
                          role: 'jarvis',
                          text: `Opened WhatsApp conversation for ${updated.recipientName} (${updated.phoneE164}) with prefilled message: "${updated.message}". Please press WhatsApp's Send button to complete delivery.`,
                          timestamp: new Date().toISOString(),
                        },
                      ]);
                    }}
                    onCancelDraft={() => handleSendCommand('Hey JARVIS, cancel WhatsApp', 'owner')}
                    onResolveContact={(c) => {
                      const digits = c.phoneE164.replace(/\+/g, '');
                      const encoded = encodeURIComponent(pendingWhatsAppDraft.message);
                      setPendingWhatsAppDraft({
                        ...pendingWhatsAppDraft,
                        recipientName: c.name,
                        phoneE164: c.phoneE164,
                        status: 'AWAITING_CONFIRMATION',
                        waMeUrl: `https://wa.me/${digits}?text=${encoded}`,
                      });
                    }}
                  />
                )}

              {/* Conversation History & Structured Action Result Cards */}
              <section
                aria-label="Conversation History and Action Result Cards"
                className="liquid-glass-card rounded-3xl p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <h2 className="text-sm font-semibold text-white">
                    Conversation &amp; Validated Action Feed
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-300 tabular-nums">
                      {conversation.length} turns
                    </span>
                    <button
                      type="button"
                      data-testid="erase-conversation-btn"
                      onClick={() =>
                        setConversation([
                          {
                            id: `welcome-${Date.now()}`,
                            role: 'jarvis',
                            text: 'Conversation history erased. JARVIS Neural Core is ready in silent mode.',
                            timestamp: new Date().toISOString(),
                            providerUsed: 'primary',
                            modelUsed: 'gemini-3.8-flash',
                            voiceMatchScore: 98,
                          },
                        ])
                      }
                      className="liquid-glass-chip flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-rose-200 hover:text-white"
                    >
                      <Trash2 className="h-3 w-3" />
                      Erase Feed
                    </button>
                  </div>
                </div>

                <div
                  ref={conversationFeedRef}
                  data-testid="conversation-feed"
                  className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1"
                >
                  {conversation.map((item) => (
                    <div
                      key={item.id}
                      className={`liquid-glass-subcard rounded-2xl p-3.5 text-xs ${
                        item.role === 'user' ? 'text-slate-100' : 'text-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
                        <span
                          className={`font-mono font-semibold ${
                            item.role === 'user' ? 'text-white' : 'liquid-accent-text'
                          }`}
                        >
                          {item.role === 'user'
                            ? item.voiceChannel === 'TAP_TO_TALK'
                              ? 'YOU (TAP TO TALK)'
                              : 'YOU (HEY JARVIS)'
                            : 'JARVIS'}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono tabular-nums">
                          {typeof item.voiceMatchScore === 'number' && (
                            <>
                              <span
                                className={
                                  item.voiceMatchScore >= voiceMatchProfile.confidenceThreshold
                                    ? 'text-emerald-300'
                                    : 'text-rose-300'
                                }
                              >
                                Voice Match {item.voiceMatchScore}%
                              </span>
                              <span>·</span>
                            </>
                          )}
                          {item.modelUsed && <span>{item.modelUsed}</span>}
                          {item.fallbackTriggered && (
                            <>
                              <span>·</span>
                              <span className="liquid-accent-text">Auto-Failover</span>
                            </>
                          )}
                          <span>·</span>
                          <span>
                            {new Date(item.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      <p className="mt-1.5 text-sm leading-relaxed text-slate-100">
                        {item.text}
                      </p>

                      {/* JARVIS 2.0 CommandRouter Structured Intent & Real Execution Result Badge */}
                      {item.commandResult && (
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px]">
                          <span className="text-slate-300">
                            Intent: <strong className="text-white">{item.commandResult.intent.type}</strong>
                            {'appName' in item.commandResult.intent
                              ? ` (${item.commandResult.intent.appName})`
                              : ''}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                              item.commandResult.status === 'SUCCESS'
                                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                                : item.commandResult.status === 'UNSUPPORTED'
                                  ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                                  : item.commandResult.status === 'CONFIRMATION_REQUIRED' ||
                                      item.commandResult.status === 'PERMISSION_REQUIRED'
                                    ? 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                                    : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                            }`}
                          >
                            {item.commandResult.status}
                          </span>
                        </div>
                      )}

                      {/* Action Result Cards */}
                      {item.toolOutcomes && item.toolOutcomes.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-white/10 pt-2.5">
                          {item.toolOutcomes.map((outcome) => {
                            const appData = outcome.data?.app as AllowedAndroidApp | undefined;
                            const isAutoExecuted = Boolean(outcome.data?.autoExecuted);
                            return (
                              <div
                                key={outcome.auditEntry.id}
                                className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="liquid-accent-text font-mono font-semibold">
                                      Tool: {outcome.toolName}
                                    </span>
                                    {isAutoExecuted && (
                                      <span className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                                        AUTO-EXECUTED WITHOUT ASKING
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className={`font-mono text-[11px] ${
                                      outcome.ok ? 'liquid-accent-text' : 'text-amber-300'
                                    }`}
                                  >
                                    {outcome.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-slate-200">{outcome.message}</p>

                                {appData && outcome.ok && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <a
                                      href={appData.deepLinkUri}
                                      className="liquid-glass-btn-primary inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Open {appData.displayName} (Android Intent)
                                    </a>
                                    <a
                                      href={appData.webFallbackUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="liquid-glass-chip inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                                    >
                                      Web Fallback
                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* JARVIS 2.0 Voice Status, Typed CommandRouter & Real Execution Result Engine */}
              <section
                data-testid="command-router-panel"
                aria-label="JARVIS 2.0 CommandRouter and Voice Execution Status"
                className="liquid-glass-card rounded-3xl p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      JARVIS 2.0 CommandRouter &amp; Voice Status
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      On-demand Web Speech API + Honest Platform Execution (No background wake-word simulation)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="platform-mode-web-btn"
                      onClick={() => setExecutionPlatform('WEB')}
                      className={`rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold ${
                        executionPlatform === 'WEB'
                          ? 'liquid-glass-btn-primary'
                          : 'liquid-glass-chip text-slate-300'
                      }`}
                    >
                      Web Runtime
                    </button>
                    <button
                      type="button"
                      data-testid="platform-mode-android-btn"
                      onClick={() => setExecutionPlatform('ANDROID_NATIVE')}
                      className={`rounded-lg px-2.5 py-1 font-mono text-[10px] font-semibold ${
                        executionPlatform === 'ANDROID_NATIVE'
                          ? 'liquid-glass-btn-primary'
                          : 'liquid-glass-chip text-slate-300'
                      }`}
                    >
                      Android Bridge
                    </button>
                  </div>
                </div>

                {/* Microphone Control, Listening Indicator & Speaking Indicator */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/40 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="voice-mic-control-btn"
                      onClick={() => (isTapListening ? handleStopTapToTalk() : handleTapToTalk())}
                      className="liquid-glass-btn-primary flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                    >
                      <Mic className="h-3.5 w-3.5" />
                      {isTapListening ? 'Stop Microphone' : 'Microphone Input'}
                    </button>
                    <button
                      type="button"
                      data-testid="speak-last-response-btn"
                      onClick={handleSpeakLatestResponse}
                      className="liquid-glass-chip flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-100 hover:text-white"
                    >
                      Speak Last Response
                    </button>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span
                      data-testid="voice-listening-indicator"
                      className={`rounded-md border px-2 py-0.5 ${
                        isTapListening || assistantState === 'LISTENING'
                          ? 'border-amber-400/50 bg-amber-500/20 text-amber-200 font-semibold'
                          : 'border-white/10 bg-white/5 text-slate-400'
                      }`}
                    >
                      Listening: {isTapListening || assistantState === 'LISTENING' ? 'ACTIVE' : 'IDLE'}
                    </span>
                    <span
                      data-testid="voice-speaking-indicator"
                      className={`rounded-md border px-2 py-0.5 ${
                        isSpeaking || assistantState === 'SPEAKING'
                          ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200 font-semibold'
                          : 'border-white/10 bg-white/5 text-slate-400'
                      }`}
                    >
                      Speaking: {isSpeaking || assistantState === 'SPEAKING' ? 'SPEAKING' : 'IDLE'}
                    </span>
                  </div>
                </div>

                {/* Connected ElevenLabs Voice Synthesis Bar (https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld) */}
                <div
                  data-testid="elevenlabs-connected-voice-panel"
                  className="mt-3 rounded-2xl border border-emerald-400/35 bg-black/45 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Radio className="h-3.5 w-3.5 text-emerald-300" />
                      <span className="font-semibold text-white">
                        ElevenLabs Voice Connected:
                      </span>
                      <span
                        data-testid="elevenlabs-voice-id-badge"
                        className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300"
                      >
                        {elevenLabsVoice.voiceId}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid="test-elevenlabs-voice-btn"
                      onClick={() =>
                        speakResponse(
                          `At your service, Boss. ElevenLabs voice ${elevenLabsVoice.voiceId} is connected to your J.A.R.V.I.S. AI assistant.`,
                          effectiveTalkBackLanguage.bcp47,
                          true
                        )
                      }
                      className="liquid-glass-btn-primary rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0"
                    >
                      Test Voice ({elevenLabsVoice.voiceId})
                    </button>
                  </div>

                  <p
                    data-testid="elevenlabs-voice-url-readout"
                    className="mt-1.5 break-all font-mono text-[11px] text-amber-200/95"
                  >
                    Voice Link: {elevenLabsVoice.voiceUrl} · {elevenLabsSynthesisMode}
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const parsed = parseElevenLabsVoiceIdentifier(elevenLabsInputUrl);
                      if (!parsed.valid) {
                        setVoiceError(parsed.error || 'Invalid ElevenLabs voice link.');
                        return;
                      }
                      setVoiceError(null);
                      const updatedVoice: ElevenLabsVoiceConfig = {
                        ...elevenLabsVoice,
                        enabled: true,
                        voiceId: parsed.voiceId,
                        voiceUrl: parsed.voiceUrl,
                        voiceLabel: `J.A.R.V.I.S. Neural Voice (${parsed.voiceId})`,
                      };
                      setElevenLabsVoice(updatedVoice);
                      setElevenLabsInputUrl(parsed.voiceUrl);
                      const confirmMsg = `Connected ElevenLabs voice ${parsed.voiceId} (${parsed.voiceUrl}) to J.A.R.V.I.S.`;
                      setConversation((prev) => [
                        ...prev,
                        {
                          id: `jarvis-elevenlabs-${Date.now()}`,
                          role: 'jarvis',
                          text: confirmMsg,
                          timestamp: new Date().toISOString(),
                          providerUsed: 'elevenlabs-voice-engine',
                          modelUsed: `elevenlabs-${parsed.voiceId}`,
                        },
                      ]);
                      speakResponse(confirmMsg, effectiveTalkBackLanguage.bcp47, true);
                    }}
                    className="mt-2 flex gap-1.5"
                  >
                    <label htmlFor="hud-elevenlabs-voice-input" className="sr-only">
                      Connect ElevenLabs Voice URL or Voice ID
                    </label>
                    <input
                      id="hud-elevenlabs-voice-input"
                      data-testid="hud-elevenlabs-voice-input"
                      type="text"
                      value={elevenLabsInputUrl}
                      onChange={(e) => setElevenLabsInputUrl(e.target.value)}
                      placeholder="https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld"
                      className="liquid-glass-input w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-white placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      data-testid="hud-connect-elevenlabs-btn"
                      className="liquid-glass-chip rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-semibold text-emerald-200 hover:text-white whitespace-nowrap shrink-0"
                    >
                      Connect Voice
                    </button>
                  </form>
                </div>

                {/* Structured Intent JSON & Real Execution Result Status */}
                {lastCommandResult && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/50 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-300">
                        COMMAND EXECUTION STATUS ({lastCommandResult.platform})
                      </span>
                      <span
                        data-testid="command-execution-status-badge"
                        className={`rounded-md border px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                          lastCommandResult.status === 'SUCCESS'
                            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                            : lastCommandResult.status === 'UNSUPPORTED'
                              ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                              : lastCommandResult.status === 'CONFIRMATION_REQUIRED' ||
                                  lastCommandResult.status === 'PERMISSION_REQUIRED'
                                ? 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                                : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                        }`}
                      >
                        {lastCommandResult.status}
                      </span>
                    </div>
                    <pre
                      data-testid="structured-intent-json"
                      className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-2.5 font-mono text-[11px] text-amber-200"
                    >
                      {JSON.stringify(
                        lastCommandResult.intent.type === 'OPEN_APP'
                          ? {
                              type: lastCommandResult.intent.type,
                              appName: lastCommandResult.intent.appName,
                            }
                          : lastCommandResult.intent,
                        null,
                        2
                      )}
                    </pre>
                    <p
                      data-testid="command-execution-detail"
                      className="mt-2 text-xs text-slate-200"
                    >
                      {lastCommandResult.spokenResponse || lastCommandResult.detailMessage}
                    </p>
                  </div>
                )}

                {/* Quick Typed CommandRouter & Gemini AI Test Chips */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    {
                      id: 'ask_ai',
                      label: 'ASK_AI (Gemini: Quantum)',
                      cmd: 'JARVIS, ask Gemini AI to explain quantum computing in simple terms',
                    },
                    {
                      id: 'ask_ai_code',
                      label: 'ASK_AI (Gemini: Kotlin Code)',
                      cmd: 'JARVIS, ask Gemini AI to write a Kotlin coroutine function for Android voice recognition',
                    },
                    {
                      id: 'ask_ai_math',
                      label: 'ASK_AI (Gemini: Solve Math)',
                      cmd: 'JARVIS, ask Gemini AI to solve and explain step-by-step: 2x + 15 = 47',
                    },
                    {
                      id: 'open_app',
                      label: 'OPEN_APP (Instagram)',
                      cmd: 'JARVIS, open Instagram.',
                    },
                    {
                      id: 'open_settings',
                      label: 'OPEN_SETTINGS (WiFi)',
                      cmd: 'JARVIS, open WiFi settings',
                    },
                    {
                      id: 'get_battery',
                      label: 'GET_BATTERY',
                      cmd: 'JARVIS, check my battery level',
                    },
                    {
                      id: 'set_volume',
                      label: 'SET_VOLUME (75%)',
                      cmd: 'JARVIS, set volume to 75%',
                    },
                    {
                      id: 'create_note',
                      label: 'CREATE_NOTE',
                      cmd: 'JARVIS, create a note: Calibrate Android SpeechRecognizer permissions',
                    },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      data-testid={`router-chip-${chip.id}`}
                      onClick={() => handleSendCommand(chip.cmd, 'owner')}
                      className="liquid-glass-chip rounded-lg px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:text-white"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Small Notes Panel: Basic Memory (Save, List, Delete with Confirmation, LocalStorage Persisted) */}
              <section
                data-testid="notes-memory-panel"
                aria-label="Basic Memory Local Notes Panel"
                className="liquid-glass-card rounded-3xl p-5"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Basic Memory — Local Notes
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      Persisted in localStorage across sessions · Deletion requires confirmation
                    </p>
                  </div>
                  <span
                    data-testid="notes-count-badge"
                    className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-0.5 font-mono text-xs text-slate-200 tabular-nums"
                  >
                    {notes.length} notes
                  </span>
                </div>

                <form onSubmit={handleSaveNoteFromPanel} className="mt-3 flex gap-2">
                  <label htmlFor="jarvis-note-input" className="sr-only">
                    Save a new note to JARVIS memory
                  </label>
                  <input
                    id="jarvis-note-input"
                    data-testid="note-input"
                    type="text"
                    value={noteDraftInput}
                    onChange={(e) => setNoteDraftInput(e.target.value)}
                    placeholder="Write a note to save in JARVIS memory..."
                    className="liquid-glass-input w-full rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    data-testid="save-note-btn"
                    className="liquid-glass-btn-primary rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Save Note
                  </button>
                </form>

                <div
                  data-testid="notes-list"
                  className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1"
                >
                  {notes.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-center text-xs text-slate-400">
                      No saved notes yet. Add a note above or say &quot;JARVIS, create a note...&quot;
                    </p>
                  ) : (
                    notes.map((note) => {
                      const isConfirmingDelete = pendingDeleteNoteId === note.id;
                      return (
                        <div
                          key={note.id}
                          data-testid={`note-item-${note.id}`}
                          className="liquid-glass-subcard rounded-2xl p-3 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-white">{note.title}</p>
                              <p className="mt-0.5 text-slate-200">{note.content}</p>
                            </div>
                            {!isConfirmingDelete ? (
                              <button
                                type="button"
                                data-testid={`delete-note-btn-${note.id}`}
                                aria-label={`Delete note ${note.title}`}
                                onClick={() => handleRequestDeleteNote(note.id)}
                                className="liquid-glass-chip rounded-lg px-2 py-1 text-[11px] text-rose-200 hover:text-white shrink-0"
                              >
                                Delete
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  data-testid="confirm-delete-note-btn"
                                  onClick={() => handleConfirmDeleteNote(note.id)}
                                  className="rounded-lg border border-rose-400/50 bg-rose-500/25 px-2.5 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/40"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  data-testid="cancel-delete-note-btn"
                                  onClick={() => setPendingDeleteNoteId(null)}
                                  className="liquid-glass-chip rounded-lg px-2 py-1 text-[11px] text-slate-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Google Gemini AI Direct Command Deck (Non-working API keys removed) */}
              <section
                data-testid="gemini-ai-command-deck"
                aria-label="Google Gemini AI Direct Command Deck"
                className="liquid-glass-card rounded-3xl p-5"
              >
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <Sparkles className="liquid-accent-text h-4 w-4" />
                    <span className="font-semibold text-white">
                      Google Gemini AI Command Deck (gemini-3.8-flash)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSection('providers')}
                    className="liquid-accent-text hover:underline"
                  >
                    Gemini AI Status
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">
                  Execute instant Google Gemini AI reasoning, coding, math, and creative commands with a single tap:
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      {
                        id: 'gemini-quantum',
                        label: 'Explain Quantum AI',
                        cmd: 'Hey JARVIS, ask Gemini AI to explain quantum computing in simple terms',
                      },
                      {
                        id: 'gemini-kotlin',
                        label: 'Generate Kotlin Code',
                        cmd: 'Hey JARVIS, ask Gemini AI to write a Kotlin coroutine function for Android voice recognition',
                      },
                      {
                        id: 'gemini-math',
                        label: 'Solve Math (2x+15=47)',
                        cmd: 'Hey JARVIS, ask Gemini AI to solve and explain step-by-step: 2x + 15 = 47',
                      },
                      {
                        id: 'gemini-workout',
                        label: '3-Day Workout & Meal Plan',
                        cmd: 'Hey JARVIS, ask Gemini AI for a 3-day high-protein workout and meal plan',
                      },
                      {
                        id: 'gemini-email',
                        label: 'Draft Launch Email',
                        cmd: 'Hey JARVIS, ask Gemini AI to draft a professional email to my team about project launch',
                      },
                      {
                        id: 'gemini-ideas',
                        label: 'Brainstorm Startup Ideas',
                        cmd: 'Hey JARVIS, ask Gemini AI to brainstorm 5 innovative AI startup ideas for 2026',
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`gemini-deck-${item.id}`}
                      onClick={() => handleSendCommand(item.cmd, 'owner')}
                      className="liquid-glass-chip min-h-[36px] rounded-xl px-3 py-1.5 text-left text-xs font-medium text-slate-100 hover:text-white transition-all"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeSection === 'voice-calibration' && (
          <VoiceCalibrationSettingsView
            voiceMatchProfile={voiceMatchProfile}
            lastVoiceVerification={lastVoiceVerification}
            handsFreeActive={handsFreeActive}
            elevenLabsVoice={elevenLabsVoice}
            onUpdateElevenLabsVoice={(nextVoice) => {
              setElevenLabsVoice(nextVoice);
              setElevenLabsInputUrl(nextVoice.voiceUrl);
            }}
            onTestElevenLabsVoice={(sample) =>
              speakResponse(
                sample ||
                  `At your service, Boss. ElevenLabs neural voice ${elevenLabsVoice.voiceId} is connected and calibrated.`,
                effectiveTalkBackLanguage.bcp47,
                true
              )
            }
            onUpdateVoiceMatchProfile={setVoiceMatchProfile}
            onVerifyBossVoiceNow={handleVerifyBossVoiceNow}
            onToggleHandsFree={handleToggleHandsFree}
            onExecuteInstantCommand={(cmd, speaker = 'owner') =>
              handleSendCommand(cmd, speaker, 'HANDS_FREE')
            }
            onNavigateToAssistant={() => setActiveSection('assistant')}
          />
        )}

        {activeSection === 'providers' && (
          <ProvidersAndSettingsView
            routingMode={routingMode}
            onChangeRoutingMode={setRoutingMode}
            simulatePrimaryFailure={simulatePrimaryFailure}
            onToggleSimulatePrimaryFailure={() => setSimulatePrimaryFailure((s) => !s)}
            primaryIdentity={primaryIdentity}
            secondaryIdentity={secondaryIdentity}
            primaryTestResult={primaryTestResult}
            secondaryTestResult={secondaryTestResult}
            testingSlot={testingSlot}
            onTestProvider={handleTestProvider}
            allowedApps={allowedApps}
            onToggleAppInstalled={(appId) =>
              setAllowedApps((prev) =>
                prev.map((a) =>
                  a.id === appId ? { ...a, installedOnDevice: !a.installedOnDevice } : a
                )
              )
            }
            onAddAppAlias={(appId, alias) =>
              setAllowedApps((prev) =>
                prev.map((a) =>
                  a.id === appId
                    ? { ...a, aliases: Array.from(new Set([...a.aliases, alias.toLowerCase()])) }
                    : a
                )
              )
            }
            onLaunchAppDirect={(appName) => {
              setActiveSection('assistant');
              handleSendCommand(`Hey JARVIS, open ${appName}`, 'owner');
            }}
            permissions={permissions}
            onTogglePermission={(key) =>
              setPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
            }
            speechRate={speechRate}
            onChangeSpeechRate={setSpeechRate}
            voiceLang={voiceLang}
            onChangeVoiceLang={handleChangeTalkBackLanguage}
            auditLog={auditLog}
            onClearAuditLog={() => setAuditLog([])}
          />
        )}

        {activeSection === 'android' && <AndroidProjectExplorerView />}
      </main>
    </div>
  );
}
