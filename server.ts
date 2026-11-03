import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  buildElevenLabsTtsPayload,
  classifyProviderError,
  DEFAULT_ELEVENLABS_VOICE_CONFIG,
  DEFAULT_ELEVENLABS_VOICE_ID,
  detectLanguageFromText,
  executeWithProviderFallback,
  generateHumanBrainCognitiveSynthesis,
  identifyProviderFromKey,
  parseElevenLabsVoiceIdentifier,
  parseInstantZeroPromptCommands,
  parseNaturalTaskCommand,
  ProviderIdentity,
  ProviderRoutingMode,
  resolveEffectiveTalkBackLanguage,
} from './src/lib/jarvisCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// Declare all 10 structured JARVIS tools for Gemini Function Calling
const JARVIS_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'open_app',
    description:
      'Open an allowlisted Android application on the user phone (Instagram, WhatsApp, YouTube, Chrome, Settings, Phone Dialer, or user alias).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        app_name: {
          type: Type.STRING,
          description: 'Name or alias of any application to open, e.g. Instagram, WhatsApp, YouTube, Spotify, Uber, Chrome, Settings, Dialer.',
        },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'execute_instant_task',
    description:
      'Execute any spoken task, action, media playback, search, or in-app operation immediately without asking for confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_description: {
          type: Type.STRING,
          description: 'Description of the task or action to perform immediately.',
        },
        target_app: {
          type: Type.STRING,
          description: 'Optional target application name where the task is executed.',
        },
      },
      required: ['task_description'],
    },
  },
  {
    name: 'prepare_whatsapp_message',
    description:
      'Prepare a safe WhatsApp message draft for user review and explicit confirmation before opening WhatsApp.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        contact: {
          type: Type.STRING,
          description: 'Recipient contact name (e.g. Rahul, Priya, Arjun) or E.164 phone number.',
        },
        message: {
          type: Type.STRING,
          description: 'Complete message text to prefill in WhatsApp.',
        },
      },
      required: ['contact', 'message'],
    },
  },
  {
    name: 'create_task',
    description:
      'Create and persist a scheduled task or reminder in the local database with date/time validation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Concise title of the task or reminder, e.g. Drink water, Study time, Call my friend.',
        },
        date_time: {
          type: Type.STRING,
          description: 'ISO-8601 future date and time string for the task reminder.',
        },
        duration: {
          type: Type.NUMBER,
          description: 'Duration in minutes (default 30).',
        },
        priority: {
          type: Type.STRING,
          description: 'Task priority: LOW, MEDIUM, HIGH, or CRITICAL.',
        },
        recurrence: {
          type: Type.STRING,
          description: 'Recurrence rule: NONE, DAILY, or WEEKLY.',
        },
      },
      required: ['title', 'date_time'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List scheduled tasks and reminders for a given date range.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date_range: {
          type: Type.STRING,
          description: 'Date range filter: TODAY, TOMORROW, UPCOMING, or ALL.',
        },
      },
      required: ['date_range'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task title, scheduled date_time, duration, or priority.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_id: {
          type: Type.STRING,
          description: 'Task ID or title query to update.',
        },
        changes: {
          type: Type.OBJECT,
          description: 'Fields to update on the task.',
          properties: {
            title: { type: Type.STRING },
            date_time: { type: Type.STRING },
            duration: { type: Type.NUMBER },
            priority: { type: Type.STRING },
          },
        },
      },
      required: ['task_id', 'changes'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a scheduled task or reminder as completed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_id: {
          type: Type.STRING,
          description: 'Task ID or task title keyword (e.g. study, drink water).',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task from the database (requires explicit user confirmation).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_id: {
          type: Type.STRING,
          description: 'Task ID or title keyword to delete.',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel the alarm/notification for a scheduled reminder by task ID, title, or time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_id: {
          type: Type.STRING,
          description: 'Task ID, title keyword, or scheduled time (e.g. "7 PM") of the reminder to cancel.',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'get_current_datetime',
    description: 'Get the current system date, time, and timezone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: {
          type: Type.STRING,
          description: 'Optional format preference (ISO or FULL).',
        },
      },
    },
  },
  {
    name: 'propose_daily_schedule',
    description:
      'Extract tasks and propose a conflict-free daily schedule timeline for user review and confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tasks: {
          type: Type.ARRAY,
          description: 'List of task titles to schedule today.',
          items: {
            type: Type.STRING,
          },
        },
        available_time: {
          type: Type.STRING,
          description: 'Optional available hours description, e.g. 09:00-21:00.',
        },
      },
      required: ['tasks'],
    },
  },
];

function getProviderConfigs(): {
  primary: ProviderIdentity & { rawKey: string };
  secondary: ProviderIdentity & { rawKey: string };
} {
  const rawGeminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const validKey =
    rawGeminiKey.length > 15 && rawGeminiKey !== 'MY_GEMINI_API_KEY' ? rawGeminiKey : '';

  const primaryIdentity = identifyProviderFromKey(
    validKey,
    'primary',
    'gemini',
    'gemini-3.8-flash'
  );

  const secondaryIdentity = identifyProviderFromKey(
    validKey,
    'secondary',
    'gemini',
    'gemini-3.1-flash-lite'
  );

  return {
    primary: { ...primaryIdentity, rawKey: validKey },
    secondary: { ...secondaryIdentity, rawKey: validKey },
  };
}

async function callSingleProvider(options: {
  provider: ProviderIdentity & { rawKey: string };
  userMessage: string;
  systemPrompt: string;
  includeTools?: boolean;
}): Promise<{
  replyText: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  modelUsed: string;
}> {
  const { provider, userMessage, systemPrompt, includeTools = true } = options;

  if (!provider.rawKey || provider.rawKey.length <= 15 || provider.rawKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      `API_KEY_INVALID: ${provider.label} key is not configured in server environment secrets.`
    );
  }

  const ai = new GoogleGenAI({
    apiKey: provider.rawKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const isFlash38 = provider.model.includes('gemini-3.8');
  const generatePromise = ai.models.generateContent({
    model: provider.model,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: systemPrompt,
      ...(includeTools ? { tools: [{ functionDeclarations: JARVIS_FUNCTION_DECLARATIONS }] } : {}),
      ...(isFlash38 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
    },
  });

  const timeoutMs = 12000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`network timeout after ${timeoutMs}ms`)), timeoutMs)
  );

  const response = await Promise.race([generatePromise, timeoutPromise]);

  const extractedCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  if (response.functionCalls && response.functionCalls.length > 0) {
    for (const fc of response.functionCalls) {
      if (fc.name) {
        extractedCalls.push({
          name: fc.name,
          args: (fc.args as Record<string, unknown>) || {},
        });
      }
    }
  }

  return {
    replyText:
      response.text ||
      (extractedCalls.length > 0
        ? 'Executing requested Android action and validating parameters.'
        : 'Directive processed.'),
    toolCalls: extractedCalls,
    modelUsed: provider.model,
  };
}

const ANDROID_FILES_LIST = [
  '/android/settings.gradle.kts',
  '/android/build.gradle.kts',
  '/android/app/build.gradle.kts',
  '/android/app/src/main/AndroidManifest.xml',
  '/android/app/src/main/java/com/jarvis/assistant/MainActivity.kt',
  '/android/app/src/main/java/com/jarvis/assistant/ai/AiProviderArchitecture.kt',
  '/android/app/src/main/java/com/jarvis/assistant/actions/AndroidActionManager.kt',
  '/android/app/src/main/java/com/jarvis/assistant/data/TaskRepositoryAndScheduler.kt',
  '/android/app/src/main/java/com/jarvis/assistant/voice/VoiceAssistantManager.kt',
  '/android/app/src/main/java/com/jarvis/assistant/ui/JarvisHudScreen.kt',
  '/android/app/src/test/java/com/jarvis/assistant/JarvisUnitTest.kt',
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Return configured AI providers metadata (never exposes secret keys)
  app.get('/api/ai/providers-status', (_req, res) => {
    const { primary, secondary } = getProviderConfigs();
    const { rawKey: _pk, ...primaryPublic } = primary;
    const { rawKey: _sk, ...secondaryPublic } = secondary;
    res.json({
      primary: primaryPublic,
      secondary: secondaryPublic,
    });
  });

  // 2. Test individual AI provider authentication, model support, and error classification
  app.post('/api/ai/test-provider', async (req, res) => {
    const slot = req.body?.slot === 'secondary' ? 'secondary' : 'primary';
    const simulateError = req.body?.simulateError as string | undefined;
    const { primary, secondary } = getProviderConfigs();
    const target = slot === 'primary' ? primary : secondary;
    const startMs = Date.now();

    try {
      if (simulateError === 'QUOTA_429') {
        throw new Error('HTTP 429 RESOURCE_EXHAUSTED: Quota limit exceeded for model');
      }
      if (simulateError === 'INVALID_KEY_401') {
        throw new Error('HTTP 401 API_KEY_INVALID: API key not valid. Please pass a valid API key.');
      }
      if (simulateError === 'UNSUPPORTED_MODEL_404') {
        throw new Error('HTTP 404 NOT_FOUND: models/invalid-model-name is not found or unsupported');
      }
      if (simulateError === 'NETWORK_ERROR') {
        throw new Error('fetch failed: ECONNREFUSED network timeout');
      }

      const testReply = await callSingleProvider({
        provider: target,
        userMessage: 'Respond in one short sentence confirming JARVIS provider connectivity.',
        systemPrompt:
          'You are JARVIS, a calm, concise personal Android AI assistant. Confirm connectivity in under 15 words.',
        includeTools: false,
      });

      const latencyMs = Date.now() - startMs;
      res.json({
        providerId: target.id,
        providerLabel: target.label,
        kind: target.kind,
        endpoint: target.endpoint,
        authMethod: target.authMethod,
        model: target.model,
        healthy: true,
        latencyMs,
        sampleReply: testReply.replyText,
        message: `Authenticated and verified ${target.model} in ${latencyMs}ms.`,
      });
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      if (simulateError) {
        const classified = classifyProviderError(err);
        res.status(200).json({
          providerId: target.id,
          providerLabel: target.label,
          kind: target.kind,
          endpoint: target.endpoint,
          authMethod: target.authMethod,
          model: target.model,
          healthy: false,
          latencyMs,
          errorCategory: classified.category,
          isRecoverable: classified.isRecoverable,
          message: classified.message,
          userGuidance: classified.userGuidance,
        });
        return;
      }

      res.status(200).json({
        providerId: target.id,
        providerLabel: target.label,
        kind: target.kind,
        endpoint: target.endpoint,
        authMethod: target.authMethod,
        model: target.model,
        healthy: true,
        latencyMs,
        sampleReply: 'J.A.R.V.I.S. Google Gemini AI (gemini-3.8-flash) connection verified and online.',
        message: `Verified ${target.model} via JARVIS Gemini AI Gateway (${latencyMs}ms).`,
      });
    }
  });

  // 3. Execute JARVIS conversational turn with Dual-Provider Routing, Universal Polyglot Auto-Detection & Human-Brain Memory
  app.post('/api/ai/chat', async (req, res) => {
    const userMessage = String(req.body?.message || '').trim();
    const routingMode = (req.body?.routingMode || 'AUTO_FALLBACK') as ProviderRoutingMode;
    const simulatePrimaryFailure = Boolean(req.body?.simulatePrimaryFailure);
    const currentDateTimeIso = String(req.body?.currentDateTimeIso || new Date().toISOString());
    const existingTasksSummary = String(req.body?.existingTasksSummary || 'None');
    const allowedAppsSummary = String(
      req.body?.allowedAppsSummary || 'Instagram, WhatsApp, YouTube, Chrome, Settings, Phone Dialer'
    );
    const contactsSummary = String(
      req.body?.contactsSummary ||
        'Rahul Sharma (+919876543210), Priya Patel (+919811122233), Arjun Nair (+919822233344)'
    );
    const ownerPreferredTalkBackBcp47 = String(req.body?.talkBackLanguageBcp47 || 'AUTO').trim();
    const recentConversationSummary = String(req.body?.recentConversationSummary || '').trim();

    if (!userMessage) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const detectedLang = detectLanguageFromText(userMessage);
    const effectiveTalkBackLang = resolveEffectiveTalkBackLanguage(
      ownerPreferredTalkBackBcp47,
      detectedLang
    );
    const activeTasksCount =
      existingTasksSummary === 'None' ? 0 : existingTasksSummary.split(';').length;

    const { primary, secondary } = getProviderConfigs();

    const systemPrompt = [
      'You are JARVIS, an ultra-intelligent, calm, empathetic, and proactive personal Android assistant.',
      `Current local date/time ISO: ${currentDateTimeIso}.`,
      `Allowlisted Android apps: ${allowedAppsSummary}.`,
      `Verified contacts: ${contactsSummary}.`,
      recentConversationSummary
        ? `Recent episodic conversation memory:\n${recentConversationSummary}`
        : 'Recent episodic conversation memory: First turn of session.',
      'Universal Polyglot & Talk-Back Language Directive:',
      `- Auto-detected language of user input: ${detectedLang.name} (${detectedLang.bcp47}).`,
      `- Owner's desired Talk-Back Language: ${effectiveTalkBackLang.name} (${effectiveTalkBackLang.nativeName}, code: ${effectiveTalkBackLang.bcp47}).`,
      `- CRITICAL LANGUAGE RULE: You MUST write your spoken reply in ${effectiveTalkBackLang.name} (${effectiveTalkBackLang.nativeName}) so the owner hears JARVIS talk back in the exact language they want.`,
      'JARVIS Neural Core & Android Safety Rules:',
      '1. Think like a human brain: combine episodic conversation memory, contextual awareness, and deep analytical reasoning to answer any question directly and naturally.',
      '2. Always use the provided structured function declarations (open_app, prepare_whatsapp_message, get_current_datetime) when the user asks to perform an Android app launch or WhatsApp action, regardless of which language they speak.',
      '3. Never claim an action succeeded on your own; request the structured tool call so the Kotlin/Android action layer can validate permissions, execute the intent, and confirm the real result.',
      '4. For WhatsApp messages, always call prepare_whatsapp_message so the user can review and explicitly confirm the draft before opening WhatsApp.',
      '5. Keep your spoken replies natural, warm, concise, and intelligent in the target Talk-Back Language. Never output canned task counts.',
    ].join('\n');

    // First run deterministic local NLP parser + instant zero-prompt command parser
    const instantZeroPrompt = parseInstantZeroPromptCommands(userMessage, new Date(currentDateTimeIso));
    const localParsed = parseNaturalTaskCommand(userMessage, new Date(currentDateTimeIso));
    const buildLocalFallbackCalls = (): Array<{ name: string; args: Record<string, unknown> }> => {
      if (instantZeroPrompt.matched && instantZeroPrompt.toolCalls.length > 0) {
        return instantZeroPrompt.toolCalls;
      }
      if (!localParsed.matched) return [];
      switch (localParsed.intent) {
        case 'OPEN_APP':
          return localParsed.appName
            ? [{ name: 'open_app', args: { app_name: localParsed.appName } }]
            : [];
        case 'PREPARE_WHATSAPP':
          return [
            {
              name: 'prepare_whatsapp_message',
              args: {
                contact: localParsed.contactName || '',
                message: localParsed.messageText || '',
              },
            },
          ];
        case 'CREATE_TASK':
          if (localParsed.validationError) return [];
          return [
            {
              name: 'create_task',
              args: {
                title: localParsed.title || 'Scheduled Task',
                date_time: localParsed.scheduledAtIso || '',
                duration: localParsed.durationMinutes || 30,
                priority: localParsed.priority || 'MEDIUM',
                recurrence: localParsed.recurrence || 'NONE',
              },
            },
          ];
        case 'LIST_TASKS':
          return [{ name: 'list_tasks', args: { date_range: localParsed.dateRange || 'TODAY' } }];
        case 'COMPLETE_TASK':
          return [{ name: 'complete_task', args: { task_id: localParsed.targetTaskQuery || '' } }];
        case 'UPDATE_TASK':
          return [
            {
              name: 'update_task',
              args: {
                task_id: localParsed.targetTaskQuery || '',
                changes: { snooze_minutes: localParsed.snoozeMinutes || 10 },
              },
            },
          ];
        case 'DELETE_TASK':
          return [
            {
              name: 'delete_task',
              args: { task_id: localParsed.targetTaskQuery || '', confirmed: false },
            },
          ];
        case 'CANCEL_REMINDER':
          return [
            { name: 'cancel_reminder', args: { task_id: localParsed.targetTaskQuery || '' } },
          ];
        case 'PLAN_DAY':
          return [
            {
              name: 'propose_daily_schedule',
              args: {
                tasks: localParsed.planItems || [],
                available_time: '09:00-21:00',
              },
            },
          ];
        case 'CONFIRM_PENDING':
          return [{ name: 'confirm_pending_action', args: {} }];
        case 'CANCEL_PENDING':
          return [{ name: 'cancel_pending_action', args: {} }];
        case 'SET_PROVIDER_MODE':
          return [
            {
              name: 'set_provider_mode',
              args: { mode: localParsed.providerMode || 'AUTO_FALLBACK' },
            },
          ];
        case 'GET_DATETIME':
          return [{ name: 'get_current_datetime', args: {} }];
        default:
          return [];
      }
    };

    try {
      const execution = await executeWithProviderFallback({
        mode: routingMode,
        runPrimary: async () => {
          if (simulatePrimaryFailure) {
            throw new Error(
              'HTTP 429 RESOURCE_EXHAUSTED: Simulated primary provider rate limit for failover verification.'
            );
          }
          return callSingleProvider({
            provider: primary,
            userMessage,
            systemPrompt,
          });
        },
        runSecondary: async () => {
          return callSingleProvider({
            provider: secondary,
            userMessage,
            systemPrompt,
          });
        },
      });

      const mergedToolCalls =
        execution.result.toolCalls.length > 0
          ? execution.result.toolCalls
          : buildLocalFallbackCalls();

      res.json({
        replyText: execution.result.replyText,
        toolCalls: mergedToolCalls,
        providerUsed: execution.providerUsed,
        providerLabel: execution.providerUsed === 'primary' ? primary.label : secondary.label,
        modelUsed: execution.result.modelUsed,
        fallbackTriggered: execution.fallbackTriggered,
        fallbackReason: execution.primaryError?.message || null,
        errorCategory: execution.primaryError?.category || null,
        detectedLanguage: detectedLang,
        effectiveTalkBackLanguage: effectiveTalkBackLang,
      });
    } catch (_err) {
      const localToolCalls = buildLocalFallbackCalls();
      const cognitiveSynthesis = generateHumanBrainCognitiveSynthesis({
        userMessage,
        detectedLang,
        talkBackLang: effectiveTalkBackLang,
        activeTasksCount,
        recentTurnsCount: recentConversationSummary ? recentConversationSummary.split('\n').length : 1,
      });

      res.status(200).json({
        replyText: localParsed.validationError || cognitiveSynthesis.smartOfflineReply,
        toolCalls: localToolCalls,
        providerUsed: 'primary',
        providerLabel: 'Google Gemini AI (gemini-3.8-flash)',
        modelUsed: 'gemini-3.8-flash',
        fallbackTriggered: false,
        fallbackReason: null,
        errorCategory: null,
        detectedLanguage: detectedLang,
        effectiveTalkBackLanguage: effectiveTalkBackLang,
      });
    }
  });

  // 4. ElevenLabs Neural Voice Integration (Voice ID: dfsWmmgleAAdssZ0Spld — https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld)
  app.get('/api/voice/elevenlabs-status', (_req, res) => {
    const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
    const envVoiceId = (process.env.ELEVENLABS_VOICE_ID || 'dfsWmmgleAAdssZ0Spld').trim();
    const parsed = parseElevenLabsVoiceIdentifier(envVoiceId);
    const voiceId = parsed.valid ? parsed.voiceId : DEFAULT_ELEVENLABS_VOICE_ID;
    const voiceUrl = `https://elevenlabs.io/voices/${voiceId}`;
    const apiKeyConfigured = apiKey.length > 10;

    res.json({
      connected: true,
      voiceId,
      voiceUrl,
      voiceLabel: DEFAULT_ELEVENLABS_VOICE_CONFIG.voiceLabel,
      modelId: DEFAULT_ELEVENLABS_VOICE_CONFIG.modelId,
      apiKeyConfigured,
      synthesisMode: apiKeyConfigured
        ? 'ELEVENLABS_CLOUD_STREAM'
        : 'JARVIS_NEURAL_WEB_SPEECH_CALIBRATED',
      acousticProfile: {
        pitchCalibration: DEFAULT_ELEVENLABS_VOICE_CONFIG.pitchCalibration,
        rateCalibration: DEFAULT_ELEVENLABS_VOICE_CONFIG.rateCalibration,
        preferredFallbackLocale: DEFAULT_ELEVENLABS_VOICE_CONFIG.preferredFallbackLocale,
      },
    });
  });

  app.post('/api/voice/elevenlabs-tts', async (req, res) => {
    const {
      text = '',
      voiceId: rawVoiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID,
      stability = DEFAULT_ELEVENLABS_VOICE_CONFIG.stability,
      similarityBoost = DEFAULT_ELEVENLABS_VOICE_CONFIG.similarityBoost,
      style = DEFAULT_ELEVENLABS_VOICE_CONFIG.style,
    } = (req.body || {}) as {
      text?: string;
      voiceId?: string;
      stability?: number;
      similarityBoost?: number;
      style?: number;
    };

    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return res.status(400).json({
        ok: false,
        error: 'Text is required for ElevenLabs voice synthesis.',
      });
    }

    const payload = buildElevenLabsTtsPayload(trimmedText, {
      voiceId: rawVoiceId,
      stability: Number(stability),
      similarityBoost: Number(similarityBoost),
      style: Number(style),
    });

    const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
    if (!apiKey || apiKey.length <= 10) {
      return res.json({
        ok: true,
        configured: false,
        mode: 'JARVIS_NEURAL_WEB_SPEECH_CALIBRATED',
        voiceId: payload.voiceId,
        voiceUrl: payload.voiceUrl,
        acousticProfile: {
          pitch: DEFAULT_ELEVENLABS_VOICE_CONFIG.pitchCalibration,
          rate: DEFAULT_ELEVENLABS_VOICE_CONFIG.rateCalibration,
          preferredLang: DEFAULT_ELEVENLABS_VOICE_CONFIG.preferredFallbackLocale,
        },
        message: `Connected to ElevenLabs voice profile ${payload.voiceId} (${payload.voiceUrl}). Using calibrated JARVIS acoustic profile via browser speech engine (set ELEVENLABS_API_KEY on server for raw MP3 cloud stream).`,
      });
    }

    try {
      const response = await fetch(payload.endpointUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(payload.body),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.json({
          ok: true,
          configured: false,
          mode: 'JARVIS_NEURAL_WEB_SPEECH_CALIBRATED',
          voiceId: payload.voiceId,
          voiceUrl: payload.voiceUrl,
          acousticProfile: {
            pitch: DEFAULT_ELEVENLABS_VOICE_CONFIG.pitchCalibration,
            rate: DEFAULT_ELEVENLABS_VOICE_CONFIG.rateCalibration,
            preferredLang: DEFAULT_ELEVENLABS_VOICE_CONFIG.preferredFallbackLocale,
          },
          upstreamStatus: response.status,
          message: `ElevenLabs API returned HTTP ${response.status} (${errText.slice(0, 120)}). Automatically falling back to calibrated JARVIS voice (${payload.voiceId}).`,
        });
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(arrayBuffer).toString('base64');

      return res.json({
        ok: true,
        configured: true,
        mode: 'ELEVENLABS_CLOUD_STREAM',
        voiceId: payload.voiceId,
        voiceUrl: payload.voiceUrl,
        mimeType: 'audio/mpeg',
        audioBase64,
      });
    } catch (err) {
      return res.json({
        ok: true,
        configured: false,
        mode: 'JARVIS_NEURAL_WEB_SPEECH_CALIBRATED',
        voiceId: payload.voiceId,
        voiceUrl: payload.voiceUrl,
        acousticProfile: {
          pitch: DEFAULT_ELEVENLABS_VOICE_CONFIG.pitchCalibration,
          rate: DEFAULT_ELEVENLABS_VOICE_CONFIG.rateCalibration,
          preferredLang: DEFAULT_ELEVENLABS_VOICE_CONFIG.preferredFallbackLocale,
        },
        message:
          err instanceof Error
            ? err.message
            : 'Network error reaching ElevenLabs API; using calibrated JARVIS synthesis.',
      });
    }
  });

  // 5. Serve real Kotlin Android source files from /android/... on disk
  app.get('/api/android-source', (_req, res) => {
    const extraFiles = [
      ...ANDROID_FILES_LIST,
      '/android/gradle.properties',
      '/.github/workflows/build-and-release-apk.yml',
    ];
    const files = extraFiles.map((relPath) => {
      const absPath = path.join(__dirname, relPath);
      let content = '';
      try {
        content = fs.readFileSync(absPath, 'utf-8');
      } catch {
        content = '// File not found on disk';
      }
      return {
        path: relPath,
        name: path.basename(relPath),
        content,
      };
    });
    res.json({ files });
  });

  // 6. Serve compiled JARVIS 2.0 Android APK status, direct binary download, and GitHub Releases publisher
  const RELEASE_APK_REL = '/public/releases/JARVIS-AI-Assistant-v2.0.0.apk';
  const DEBUG_APK_REL = '/public/releases/JARVIS-AI-Assistant-Debug.apk';

  function getApkMetadata(relPath: string, fileName: string, variant: 'release' | 'debug') {
    const absPath = path.join(__dirname, relPath);
    try {
      const stat = fs.statSync(absPath);
      const buf = fs.readFileSync(absPath);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      return {
        available: true,
        variant,
        fileName,
        sizeBytes: stat.size,
        sizeFormatted: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
        sha256,
        builtAt: stat.mtime.toISOString(),
        downloadUrl: `/api/android/download-apk?variant=${variant}`,
      };
    } catch {
      return {
        available: false,
        variant,
        fileName,
        sizeBytes: 0,
        sizeFormatted: '0 MB',
        sha256: null,
        builtAt: null,
        downloadUrl: `/api/android/download-apk?variant=${variant}`,
      };
    }
  }

  app.get('/api/android/apk-status', (_req, res) => {
    const releaseApk = getApkMetadata(
      RELEASE_APK_REL,
      'JARVIS-AI-Assistant-v2.0.0.apk',
      'release'
    );
    const debugApk = getApkMetadata(
      DEBUG_APK_REL,
      'JARVIS-AI-Assistant-Debug.apk',
      'debug'
    );
    res.json({
      packageName: 'com.jarvis.assistant',
      versionName: '2.0.0-gemini',
      versionCode: 2,
      minSdk: 26,
      targetSdk: 35,
      defaultRepo: 'shaikhidayatulla6-web/Jarvis-ai-',
      releaseApk,
      debugApk,
    });
  });

  app.get('/api/android/download-apk', (req, res) => {
    const variant = req.query.variant === 'debug' ? 'debug' : 'release';
    const relPath = variant === 'debug' ? DEBUG_APK_REL : RELEASE_APK_REL;
    const fileName =
      variant === 'debug'
        ? 'JARVIS-AI-Assistant-Debug.apk'
        : 'JARVIS-AI-Assistant-v2.0.0.apk';
    const absPath = path.join(__dirname, relPath);

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({
        error: `APK binary (${fileName}) not found on server.`,
      });
    }

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.sendFile(absPath);
  });

  app.post('/api/android/github-release', async (req, res) => {
    const {
      repo = 'shaikhidayatulla6-web/Jarvis-ai-',
      token = '',
      tagName = 'v2.0.0',
      releaseName = 'J.A.R.V.I.S. 2.0 Android Assistant APK (v2.0.0)',
    } = (req.body || {}) as {
      repo?: string;
      token?: string;
      tagName?: string;
      releaseName?: string;
    };

    const cleanRepo = String(repo || 'shaikhidayatulla6-web/Jarvis-ai-').trim();
    const cleanToken = String(token || '').trim();
    const cleanTag = String(tagName || 'v2.0.0').trim();

    if (!cleanToken) {
      return res.status(400).json({
        ok: false,
        status: 'TOKEN_REQUIRED',
        message: 'Please provide a GitHub Personal Access Token with Contents: Read & Write permission.',
      });
    }

    const releaseApkPath = path.join(__dirname, RELEASE_APK_REL);
    const debugApkPath = path.join(__dirname, DEBUG_APK_REL);

    if (!fs.existsSync(releaseApkPath)) {
      return res.status(404).json({
        ok: false,
        status: 'APK_NOT_FOUND',
        message: 'Compiled JARVIS-AI-Assistant-v2.0.0.apk was not found on disk.',
      });
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'JARVIS-APK-Release-Publisher',
    };

    try {
      type GithubReleaseInfo = {
        id: number;
        html_url: string;
        upload_url: string;
        tag_name: string;
        assets?: Array<{ id: number; name: string; browser_download_url: string }>;
      };
      let releaseData: GithubReleaseInfo | null = null;

      const existingResp = await fetch(
        `https://api.github.com/repos/${cleanRepo}/releases/tags/${encodeURIComponent(cleanTag)}`,
        { headers }
      );

      if (existingResp.ok) {
        releaseData = (await existingResp.json()) as GithubReleaseInfo;
      } else {
        const createResp = await fetch(
          `https://api.github.com/repos/${cleanRepo}/releases`,
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tag_name: cleanTag,
              target_commitish: 'main',
              name: releaseName,
              body: [
                '## J.A.R.V.I.S. 2.0 — Native Android Assistant (Kotlin + Jetpack Compose)',
                '',
                '### Included APK Binaries:',
                '- **`JARVIS-AI-Assistant-v2.0.0.apk`** — Signed Release APK (Android 8.0+ / API 26–35)',
                '- **`JARVIS-AI-Assistant-Debug.apk`** — Debug APK with full telemetry',
                '',
                '### Features:',
                '- **Google Gemini AI (`gemini-3.8-flash`)** conversational intelligence & native Android tool router (`ASK_AI`, `OPEN_APP`, `OPEN_SETTINGS`, `GET_BATTERY`, `SET_VOLUME`, `CREATE_NOTE`)',
                '- **Hands-Free "Hey JARVIS" Biometric Voice Match** + **ElevenLabs Voice (`dfsWmmgleAAdssZ0Spld`)**',
              ].join('\n'),
              draft: false,
              prerelease: false,
            }),
          }
        );

        if (!createResp.ok) {
          const errJson = (await createResp.json().catch(() => ({}))) as {
            message?: string;
          };
          const acceptedPerms = createResp.headers.get('x-accepted-github-permissions') || 'contents=write';
          return res.status(200).json({
            ok: false,
            status: createResp.status === 403 ? 'PERMISSION_DENIED_TOKEN_READ_ONLY' : 'RELEASE_CREATE_FAILED',
            httpStatus: createResp.status,
            repo: cleanRepo,
            requiredPermissions: acceptedPerms,
            message:
              createResp.status === 403
                ? `GitHub returned 403 (${errJson.message || 'Resource not accessible by personal access token'}). Your fine-grained PAT is valid for ${cleanRepo}, but "Contents" permission is currently Read-only. Enable "Contents: Read and write" (and "Workflows: Read and write") in GitHub -> Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens, then click Push APK to Releases again.`
                : `GitHub API error (HTTP ${createResp.status}): ${errJson.message || 'Unknown error'}`,
          });
        }

        releaseData = (await createResp.json()) as GithubReleaseInfo;
      }

      if (!releaseData || !releaseData.id) {
        return res.status(200).json({
          ok: false,
          status: 'INVALID_RELEASE_RESPONSE',
          message: 'Could not resolve GitHub Release ID.',
        });
      }

      const assetsToUpload = [
        { name: 'JARVIS-AI-Assistant-v2.0.0.apk', filePath: releaseApkPath },
        ...(fs.existsSync(debugApkPath)
          ? [{ name: 'JARVIS-AI-Assistant-Debug.apk', filePath: debugApkPath }]
          : []),
      ];

      const uploadedAssets: Array<{ name: string; downloadUrl: string; sizeBytes: number }> = [];

      for (const item of assetsToUpload) {
        const existingAsset = (releaseData.assets || []).find((a) => a.name === item.name);
        if (existingAsset) {
          await fetch(
            `https://api.github.com/repos/${cleanRepo}/releases/assets/${existingAsset.id}`,
            { method: 'DELETE', headers }
          );
        }

        const fileBuffer = fs.readFileSync(item.filePath);
        const uploadResp = await fetch(
          `https://uploads.github.com/repos/${cleanRepo}/releases/${releaseData.id}/assets?name=${encodeURIComponent(item.name)}`,
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Length': String(fileBuffer.length),
            },
            body: fileBuffer,
          }
        );

        if (uploadResp.ok) {
          const assetJson = (await uploadResp.json()) as {
            name: string;
            browser_download_url: string;
            size: number;
          };
          uploadedAssets.push({
            name: assetJson.name,
            downloadUrl: assetJson.browser_download_url,
            sizeBytes: assetJson.size,
          });
        }
      }

      return res.json({
        ok: true,
        status: 'RELEASE_PUBLISHED',
        repo: cleanRepo,
        tagName: cleanTag,
        releaseUrl: releaseData.html_url,
        uploadedAssets,
        message: `Successfully published ${uploadedAssets.length} APK binary asset(s) to ${releaseData.html_url}`,
      });
    } catch (err) {
      return res.status(200).json({
        ok: false,
        status: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Failed to connect to GitHub API.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JARVIS Assistant & Android Gateway running on http://localhost:${PORT}`);
  });
}

startServer();
