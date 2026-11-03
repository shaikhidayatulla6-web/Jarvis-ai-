import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildElevenLabsTtsPayload,
  calibrateVoiceProfileFromSamples,
  classifyProviderError,
  CommandRouter,
  computeNextOccurrence,
  DEFAULT_ALLOWED_APPS,
  DEFAULT_ELEVENLABS_VOICE_CONFIG,
  DEFAULT_ELEVENLABS_VOICE_ID,
  DEFAULT_ELEVENLABS_VOICE_URL,
  DEFAULT_VERIFIED_CONTACTS,
  DEFAULT_VOICE_MATCH_PROFILE,
  deleteNoteWithConfirmation,
  detectLanguageFromText,
  executeRoutedCommand,
  executeWithProviderFallback,
  extractWakeWordCommand,
  filterAuditLogEntries,
  generateDailyScheduleProposal,
  identifyProviderFromKey,
  JarvisRuntimeState,
  localizeJarvisReply,
  parseElevenLabsVoiceIdentifier,
  parseInstantZeroPromptCommands,
  parseNaturalTaskCommand,
  parseTalkBackLanguageCommand,
  prepareWhatsAppMessageWorkflow,
  resolveAndroidAppTarget,
  resolveEffectiveTalkBackLanguage,
  validateAndExecuteToolCall,
  validateTaskDateTime,
  verifyVoiceMatch,
} from './jarvisCore';

function createFreshState(nowIso = '2026-10-29T10:00:00.000Z'): JarvisRuntimeState {
  return {
    tasks: [],
    allowedApps: structuredClone(DEFAULT_ALLOWED_APPS),
    contacts: structuredClone(DEFAULT_VERIFIED_CONTACTS),
    pendingWhatsAppDraft: null,
    pendingDailyProposal: null,
    pendingDeleteTaskId: null,
    auditLog: [],
    permissions: {
      microphone: true,
      notifications: true,
      contacts: true,
      exactAlarm: true,
      foregroundService: false,
    },
    nowIso,
  };
}

test('1. Natural-language task parsing extracts relative and specific times accurately', () => {
  const refNow = new Date('2026-10-29T10:00:00.000Z');

  const cmd1 = parseNaturalTaskCommand('Remind me to drink water in two hours', refNow);
  assert.equal(cmd1.matched, true);
  assert.equal(cmd1.intent, 'CREATE_TASK');
  assert.equal(cmd1.title, 'Drink water');
  assert.equal(cmd1.scheduledAtIso, '2026-10-29T12:00:00.000Z');

  const cmd2 = parseNaturalTaskCommand('Schedule study time tomorrow at 7 PM', refNow);
  assert.equal(cmd2.matched, true);
  assert.equal(cmd2.intent, 'CREATE_TASK');
  assert.equal(cmd2.title, 'Study time');
  assert.equal(cmd2.category, 'STUDY');

  const cmd3 = parseNaturalTaskCommand(
    'JARVIS, prepare a WhatsApp message to Rahul saying I will arrive at 6 PM',
    refNow
  );
  assert.equal(cmd3.matched, true);
  assert.equal(cmd3.intent, 'PREPARE_WHATSAPP');
  assert.equal(cmd3.contactName, 'Rahul');
  assert.equal(cmd3.messageText, 'I will arrive at 6 PM');

  const cmd4 = parseNaturalTaskCommand(
    'JARVIS, plan my day. I need to study, exercise, work on my business, and finish my assignments.',
    refNow
  );
  assert.equal(cmd4.matched, true);
  assert.equal(cmd4.intent, 'PLAN_DAY');
  assert.deepEqual(cmd4.planItems, [
    'study',
    'exercise',
    'work on my business',
    'finish my assignments',
  ]);
});

test('2. Date and time validation rejects past dates, missing dates, and malformed timestamps', () => {
  const refNow = new Date('2026-10-29T10:00:00.000Z');

  const past = validateTaskDateTime('2026-10-28T09:00:00.000Z', refNow);
  assert.equal(past.valid, false);
  assert.ok(past.error?.includes('past'));

  const invalid = validateTaskDateTime('not-a-real-date', refNow);
  assert.equal(invalid.valid, false);

  const validFuture = validateTaskDateTime('2026-10-29T15:30:00.000Z', refNow);
  assert.equal(validFuture.valid, true);
  assert.equal(validFuture.isoString, '2026-10-29T15:30:00.000Z');
});

test('3. Recurring reminders calculate next DAILY and WEEKLY occurrences accurately', () => {
  const refNow = new Date('2026-10-29T10:00:00.000Z');
  const currentIso = '2026-10-29T08:00:00.000Z';

  const nextDaily = computeNextOccurrence(currentIso, 'DAILY', refNow);
  assert.equal(nextDaily, '2026-10-30T08:00:00.000Z');

  const nextWeekly = computeNextOccurrence(currentIso, 'WEEKLY', refNow);
  assert.equal(nextWeekly, '2026-11-05T08:00:00.000Z');

  const noneRec = computeNextOccurrence(currentIso, 'NONE', refNow);
  assert.equal(noneRec, null);
});

test('4. Task persistence and duplicate action prevention on retries', () => {
  const state = createFreshState('2026-10-29T10:00:00.000Z');

  const firstCreate = validateAndExecuteToolCall(
    'create_task',
    {
      title: 'Call my friend',
      date_time: '2026-10-29T18:00:00.000Z',
      duration: 30,
      priority: 'HIGH',
    },
    state
  );
  assert.equal(firstCreate.ok, true);
  assert.equal(state.tasks.length, 1);

  // Retry exact same task creation -> must be rejected as duplicate
  const duplicateRetry = validateAndExecuteToolCall(
    'create_task',
    {
      title: '  call my friend ',
      date_time: '2026-10-29T18:00:25.000Z',
      duration: 30,
      priority: 'HIGH',
    },
    state
  );
  assert.equal(duplicateRetry.ok, false);
  assert.equal(duplicateRetry.errorCode, 'DUPLICATE_TASK');
  assert.equal(state.tasks.length, 1);
});

test('5. Tool argument validation rejects unknown tools, malformed arguments, and enforces confirmation before deletion', () => {
  const state = createFreshState('2026-10-29T10:00:00.000Z');

  const unknownTool = validateAndExecuteToolCall('execute_shell_command', { cmd: 'rm -rf /' }, state);
  assert.equal(unknownTool.ok, false);
  assert.equal(unknownTool.errorCode, 'UNKNOWN_TOOL');

  const malformedOpen = validateAndExecuteToolCall('open_app', { app_name: '' }, state);
  assert.equal(malformedOpen.ok, false);
  assert.equal(malformedOpen.errorCode, 'MALFORMED_ARGS');

  // Create a task, then attempt delete without confirmation
  validateAndExecuteToolCall(
    'create_task',
    { title: 'Study Kotlin', date_time: '2026-10-29T19:00:00.000Z' },
    state
  );
  const taskId = state.tasks[0].id;

  const unconfirmedDelete = validateAndExecuteToolCall(
    'delete_task',
    { task_id: taskId, confirmed: false },
    state
  );
  assert.equal(unconfirmedDelete.status, 'REQUIRES_CONFIRMATION');
  assert.equal(state.tasks.length, 1);

  const confirmedDelete = validateAndExecuteToolCall(
    'delete_task',
    { task_id: taskId, confirmed: true },
    state
  );
  assert.equal(confirmedDelete.status, 'SUCCESS');
  assert.equal(state.tasks.length, 0);
});

test('6. Permission, app allowlist, and WhatsApp contact verification states', () => {
  const state = createFreshState('2026-10-29T10:00:00.000Z');

  // Disable notifications permission -> create_task must fail gracefully
  state.permissions.notifications = false;
  const blockedReminder = validateAndExecuteToolCall(
    'create_task',
    { title: 'Drink water', date_time: '2026-10-29T12:00:00.000Z' },
    state
  );
  assert.equal(blockedReminder.ok, false);
  assert.equal(blockedReminder.errorCode, 'NOTIFICATIONS_DISABLED');

  // App allowlist resolution
  const igResolved = resolveAndroidAppTarget('Instagram', state.allowedApps);
  assert.equal(igResolved.status, 'RESOLVED');
  assert.equal(igResolved.app?.packageName, 'com.instagram.android');

  const unlistedApp = resolveAndroidAppTarget('RootExplorerHack', state.allowedApps);
  assert.equal(unlistedApp.status, 'NOT_ALLOWLISTED');

  // WhatsApp draft preparation requires explicit confirmation & contact lookup
  const waKnown = prepareWhatsAppMessageWorkflow(
    'Rahul',
    'I will arrive at 6 PM',
    state.contacts,
    new Date('2026-10-29T10:00:00.000Z')
  );
  assert.equal(waKnown.status, 'AWAITING_CONFIRMATION');
  assert.ok(waKnown.waMeUrl.includes('919876543210'));

  const waUnknown = prepareWhatsAppMessageWorkflow(
    'NonExistentPerson',
    'Hello',
    state.contacts,
    new Date('2026-10-29T10:00:00.000Z')
  );
  assert.equal(waUnknown.status, 'MISSING_CONTACT');
});

test('7. Dual AI Provider identification, error classification, and Automatic Fallback switching', async () => {
  const p1 = identifyProviderFromKey('AIzaSyD1234567890abcdef', 'primary');
  assert.equal(p1.kind, 'GEMINI');
  assert.equal(p1.model, 'gemini-3.8-flash');

  const p2 = identifyProviderFromKey('gsk_1234567890abcdefghijk', 'secondary');
  assert.equal(p2.kind, 'GROQ');
  assert.equal(p2.model, 'llama-3.3-70b-versatile');

  const rateLimitErr = classifyProviderError(new Error('HTTP 429 RESOURCE_EXHAUSTED: Quota exceeded'), 429);
  assert.equal(rateLimitErr.category, 'QUOTA_EXCEEDED');
  assert.equal(rateLimitErr.isRecoverable, true);

  // Automatic fallback switches to secondary when primary throws a recoverable error
  let primaryCalled = 0;
  let secondaryCalled = 0;
  const fallbackRes = await executeWithProviderFallback({
    mode: 'AUTO_FALLBACK',
    runPrimary: async () => {
      primaryCalled += 1;
      throw new Error('429 rate limit exceeded on primary');
    },
    runSecondary: async () => {
      secondaryCalled += 1;
      return 'Response from Secondary Provider';
    },
  });

  assert.equal(primaryCalled, 1);
  assert.equal(secondaryCalled, 1);
  assert.equal(fallbackRes.providerUsed, 'secondary');
  assert.equal(fallbackRes.fallbackTriggered, true);
  assert.equal(fallbackRes.result, 'Response from Secondary Provider');
});

test('8. Daily Planner detects overlapping tasks and proposes conflict-free blocks', () => {
  const state = createFreshState('2026-10-29T08:00:00.000Z');
  validateAndExecuteToolCall(
    'create_task',
    {
      title: 'Existing Morning Meeting',
      date_time: new Date(2026, 9, 29, 9, 0, 0).toISOString(),
      duration: 60,
    },
    state
  );

  const proposal = generateDailyScheduleProposal({
    rawTasks: [
      { title: 'Study session', durationMinutes: 60 },
      { title: 'Exercise', durationMinutes: 45 },
    ],
    existingTasks: state.tasks,
    baseDate: new Date(2026, 9, 29, 8, 0, 0),
    availableStartHour: 9,
    availableEndHour: 21,
  });

  assert.equal(proposal.blocks.length, 2);
  assert.equal(proposal.conflictsDetected, 1);
  assert.equal(proposal.blocks[0].hasConflict, true);
});

test('9. Unified Command System handles snooze, confirm/cancel pending actions, and provider switching via commands', () => {
  const refNow = new Date('2026-10-29T10:00:00.000Z');
  const state = createFreshState('2026-10-29T10:00:00.000Z');

  // Create a task and snooze it via command
  validateAndExecuteToolCall(
    'create_task',
    { title: 'Drink water', date_time: '2026-10-29T12:00:00.000Z' },
    state
  );
  const snoozeCmd = parseNaturalTaskCommand('Snooze drink water for 15 minutes', refNow);
  assert.equal(snoozeCmd.matched, true);
  assert.equal(snoozeCmd.intent, 'UPDATE_TASK');
  assert.equal(snoozeCmd.snoozeMinutes, 15);

  const snoozeRes = validateAndExecuteToolCall(
    'update_task',
    { title_query: snoozeCmd.targetTaskQuery, snooze_minutes: snoozeCmd.snoozeMinutes },
    state
  );
  assert.equal(snoozeRes.ok, true);
  assert.equal(state.tasks[0].scheduledAt, '2026-10-29T12:15:00.000Z');

  // Propose daily schedule and confirm via command
  validateAndExecuteToolCall(
    'propose_daily_schedule',
    { tasks: [{ title: 'Deep work', duration_minutes: 60 }] },
    state
  );
  assert.ok(state.pendingDailyProposal);

  const confirmCmd = parseNaturalTaskCommand('Confirm schedule', refNow);
  assert.equal(confirmCmd.matched, true);
  assert.equal(confirmCmd.intent, 'CONFIRM_PENDING');

  const confirmRes = validateAndExecuteToolCall(
    'confirm_pending_action',
    {},
    state
  );
  assert.equal(confirmRes.ok, true);
  assert.equal(state.pendingDailyProposal, null);
  assert.equal(state.tasks.length, 2);

  // Switch AI provider mode via command
  const modeCmd = parseNaturalTaskCommand('Switch to secondary provider', refNow);
  assert.equal(modeCmd.matched, true);
  assert.equal(modeCmd.intent, 'SET_PROVIDER_MODE');
  assert.equal(modeCmd.providerMode, 'SECONDARY_ONLY');

  const modeRes = validateAndExecuteToolCall(
    'set_provider_mode',
    { mode: modeCmd.providerMode },
    state
  );
  assert.equal(modeRes.ok, true);
});

test('10. J.A.R.V.I.S. Stark Neural Hands-Free wake-word extraction and Biometric Voice Match verification (Siri-style disabled)', () => {
  assert.equal(DEFAULT_VOICE_MATCH_PROFILE.voiceprintSignature, 'VP-STARK-JARVIS-98A4F2');
  assert.equal(DEFAULT_VOICE_MATCH_PROFILE.voiceprintSignature.includes('SIRI'), false);
  const wakeOnly = extractWakeWordCommand('Hey JARVIS');
  assert.equal(wakeOnly.wakeDetected, true);
  assert.equal(wakeOnly.wakePhrase, 'Hey JARVIS');
  assert.equal(wakeOnly.isWakeOnly, true);

  // Commas, punctuation, phonetic STT transcriptions, filler prefixes, and wake-check phrases
  const wakeWithComma = extractWakeWordCommand('Hey, Jarvis!');
  assert.equal(wakeWithComma.wakeDetected, true);
  assert.equal(wakeWithComma.wakePhrase, 'Hey JARVIS');
  assert.equal(wakeWithComma.isWakeOnly, true);

  const wakePhonetic = extractWakeWordCommand('um, hey jarviz?');
  assert.equal(wakePhonetic.wakeDetected, true);
  assert.equal(wakePhonetic.wakePhrase, 'Hey JARVIS');
  assert.equal(wakePhonetic.isWakeOnly, true);

  const wakeCheckPhrase = extractWakeWordCommand('Hey Jarvis, are you there?');
  assert.equal(wakeCheckPhrase.wakeDetected, true);
  assert.equal(wakeCheckPhrase.isWakeOnly, true);

  const singleBreath = extractWakeWordCommand('Hey JARVIS, remind me to drink water in two hours');
  assert.equal(singleBreath.wakeDetected, true);
  assert.equal(singleBreath.wakePhrase, 'Hey JARVIS');
  assert.equal(singleBreath.isWakeOnly, false);
  assert.equal(singleBreath.inlineCommand, 'remind me to drink water in two hours');

  const parsedHeyJarvis = parseNaturalTaskCommand(
    'Hey JARVIS, remind me to drink water in two hours',
    new Date('2026-10-29T10:00:00.000Z')
  );
  assert.equal(parsedHeyJarvis.matched, true);
  assert.equal(parsedHeyJarvis.intent, 'CREATE_TASK');
  assert.equal(parsedHeyJarvis.title, 'Drink water');

  // Biometric Voice Match verification
  const ownerCheck = verifyVoiceMatch(DEFAULT_VOICE_MATCH_PROFILE, {
    simulatedSpeaker: 'owner',
    measuredPitchHz: 138.0,
  });
  assert.equal(ownerCheck.verified, true);
  assert.equal(ownerCheck.status, 'VERIFIED_OWNER');
  assert.ok(ownerCheck.confidenceScore >= 85);

  const strangerCheck = verifyVoiceMatch(DEFAULT_VOICE_MATCH_PROFILE, {
    simulatedSpeaker: 'guest',
  });
  assert.equal(strangerCheck.verified, false);
  assert.equal(strangerCheck.status, 'REJECTED_VOICE_MISMATCH');
  assert.ok(strangerCheck.confidenceScore < 85);
});

test('11. Local Audit Log search and filtering works offline by query, status, and tool name', () => {
  const state = createFreshState('2026-10-29T10:00:00.000Z');
  validateAndExecuteToolCall(
    'create_task',
    { title: 'Drink water', date_time: '2026-10-29T12:00:00.000Z' },
    state,
    'primary'
  );
  validateAndExecuteToolCall(
    'prepare_whatsapp_message',
    { contact: 'Rahul', message: 'I will arrive at 6 PM' },
    state,
    'secondary'
  );
  validateAndExecuteToolCall('open_app', { app_name: 'Instagram' }, state, 'primary');

  assert.equal(state.auditLog.length, 3);

  const byQuery = filterAuditLogEntries(state.auditLog, { query: 'rahul' });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].toolName, 'prepare_whatsapp_message');

  const byStatus = filterAuditLogEntries(state.auditLog, {
    statusFilter: 'REQUIRES_CONFIRMATION',
  });
  assert.equal(byStatus.length, 1);
  assert.equal(byStatus[0].toolName, 'prepare_whatsapp_message');

  const byTool = filterAuditLogEntries(state.auditLog, { toolFilter: 'open_app' });
  assert.equal(byTool.length, 1);
  assert.equal(byTool[0].toolName, 'open_app');

  const byArgsQuery = filterAuditLogEntries(state.auditLog, { query: 'instagram' });
  assert.equal(byArgsQuery.length, 1);
  assert.equal(byArgsQuery[0].toolName, 'open_app');
});

test('12. Universal language auto-detection, owner talk-back language switching, and multilingual command parsing', () => {
  const refNow = new Date('2026-10-29T10:00:00.000Z');

  // Auto-detect Hindi (Devanagari & Romanized Hinglish), Urdu, Arabic, Spanish, Japanese, English
  const hiDev = detectLanguageFromText('जार्विस, मुझे 2 घंटे में पानी पीने की याद दिलाओ');
  assert.equal(hiDev.bcp47, 'hi-IN');

  const hinglish = detectLanguageFromText('Hey JARVIS, mujhe 2 ghante mein paani peene ki yaad dilao');
  assert.equal(hinglish.bcp47, 'hi-IN');
  assert.equal(hinglish.isRomanized, true);

  const urdu = detectLanguageFromText('مجھے آج کے کام بتاؤ');
  assert.equal(urdu.bcp47, 'ur-PK');

  const arabic = detectLanguageFromText('يا جارفيس افتح انستغرام');
  assert.equal(arabic.bcp47, 'ar-SA');

  const spanish = detectLanguageFromText('Hola JARVIS, abre Instagram por favor');
  assert.equal(spanish.bcp47, 'es-ES');

  const japanese = detectLanguageFromText('今日の予定を教えて');
  assert.equal(japanese.bcp47, 'ja-JP');

  // Multilingual natural-language task & app parsing
  const parsedHinglishTask = parseNaturalTaskCommand(
    'Hey JARVIS, mujhe 2 ghante mein paani peene ki yaad dilao',
    refNow
  );
  assert.equal(parsedHinglishTask.matched, true);
  assert.equal(parsedHinglishTask.intent, 'CREATE_TASK');
  assert.equal(parsedHinglishTask.scheduledAtIso, '2026-10-29T12:00:00.000Z');

  const parsedHinglishWa = parseNaturalTaskCommand(
    'Hey JARVIS, Rahul ko WhatsApp message bhejo ki main 6 baje aunga',
    refNow
  );
  assert.equal(parsedHinglishWa.matched, true);
  assert.equal(parsedHinglishWa.intent, 'PREPARE_WHATSAPP');
  assert.equal(parsedHinglishWa.contactName, 'Rahul');

  // Talk-back language preference command & resolution
  const switchHindi = parseTalkBackLanguageCommand('Hey JARVIS, talk back in Hindi');
  assert.equal(switchHindi.matched, true);
  assert.equal(switchHindi.targetBcp47, 'hi-IN');

  const effectiveAuto = resolveEffectiveTalkBackLanguage('AUTO', spanish);
  assert.equal(effectiveAuto.bcp47, 'es-ES');

  const effectiveOwnerPinned = resolveEffectiveTalkBackLanguage('ur-PK', spanish);
  assert.equal(effectiveOwnerPinned.bcp47, 'ur-PK');

  const localizedHi = localizeJarvisReply('Launching Instagram (com.instagram.android) via Android Intent.', 'hi-IN');
  assert.ok(localizedHi.includes('जी सर'));
});

test('13. Hands-Free Boss Voice Verification verifies Boss voiceprint accurately', () => {
  const bossCheck = verifyVoiceMatch(DEFAULT_VOICE_MATCH_PROFILE, {
    simulatedSpeaker: 'owner',
    measuredPitchHz: 142.0,
  });
  assert.equal(bossCheck.verified, true);
  assert.equal(bossCheck.status, 'VERIFIED_OWNER');
  assert.ok(bossCheck.reason.includes('Boss Voice Verified'));
  assert.ok(bossCheck.confidenceScore >= 95);
});

test('14. Voice Profile Calibration and Zero-Prompt Instant App + Task Execution work without asking', () => {
  const calibrated = calibrateVoiceProfileFromSamples(DEFAULT_VOICE_MATCH_PROFILE, {
    ownerName: 'Shaik Hidayatulla (Boss)',
    fundamentalPitchHz: 140.2,
    spectralCentroidHz: 1850,
    confidenceThreshold: 88,
    autoExecuteWithoutAsking: true,
    noiseSuppressionLevel: 'HIGH_PRECISION',
  });
  assert.equal(calibrated.enrolled, true);
  assert.equal(calibrated.ownerName, 'Shaik Hidayatulla (Boss)');
  assert.equal(calibrated.fundamentalPitchHz, 140.2);
  assert.equal(calibrated.spectralCentroidHz, 1850);
  assert.equal(calibrated.confidenceThreshold, 88);
  assert.equal(calibrated.autoExecuteWithoutAsking, true);
  assert.ok(calibrated.voiceprintSignature.startsWith('VP-STARK-JARVIS-'));
  assert.equal(calibrated.voiceprintSignature.includes('SIRI'), false);

  // Compound command: "Hey JARVIS, open any app Uber and book a ride to airport"
  const compound = parseInstantZeroPromptCommands(
    'Hey JARVIS, open any app Uber and book a ride to airport'
  );
  assert.equal(compound.matched, true);
  assert.equal(compound.isInstantZeroPrompt, true);
  assert.equal(compound.toolCalls.length, 2);
  assert.equal(compound.toolCalls[0].name, 'open_app');
  assert.equal(compound.toolCalls[0].args.app_name, 'Uber');
  assert.equal(compound.toolCalls[1].name, 'execute_instant_task');
  assert.equal(compound.toolCalls[1].args.task_description, 'Book a ride to airport');

  // Execute both tools with autoExecuteWithoutAsking = true
  const state = createFreshState('2026-10-29T10:00:00.000Z');
  state.autoExecuteWithoutAsking = true;

  const openOutcome = validateAndExecuteToolCall(
    compound.toolCalls[0].name,
    compound.toolCalls[0].args,
    state
  );
  assert.equal(openOutcome.ok, true);
  assert.equal(openOutcome.status, 'SUCCESS');
  assert.ok(openOutcome.message.includes('Uber'));

  const taskOutcome = validateAndExecuteToolCall(
    compound.toolCalls[1].name,
    compound.toolCalls[1].args,
    state
  );
  assert.equal(taskOutcome.ok, true);
  assert.equal(taskOutcome.status, 'SUCCESS');
  assert.ok(taskOutcome.message.includes('Book a ride to airport'));

  // WhatsApp command with autoExecuteWithoutAsking = true executes immediately with SUCCESS
  const waOutcome = validateAndExecuteToolCall(
    'prepare_whatsapp_message',
    { contact: 'Rahul', message: 'On my way now' },
    state
  );
  assert.equal(waOutcome.ok, true);
  assert.equal(waOutcome.status, 'SUCCESS');
  assert.equal(state.pendingWhatsAppDraft?.status, 'OPENED_IN_WHATSAPP');
});

test('15. JARVIS 2.0 CommandRouter, honest platform execution statuses, and persistent Note Memory with delete confirmation', () => {
  // 1. OPEN_APP structured intent
  const openInstagram = CommandRouter.route('JARVIS, open Instagram.');
  assert.equal(openInstagram.type, 'OPEN_APP');
  if (openInstagram.type === 'OPEN_APP') {
    assert.equal(openInstagram.appName, 'Instagram');
  }

  // On WEB platform, OPEN_APP returns UNSUPPORTED and explains native Android integration is required
  const webOpenRes = executeRoutedCommand(openInstagram, {
    platform: 'WEB',
    notes: [],
  });
  assert.equal(webOpenRes.result.status, 'UNSUPPORTED');
  assert.ok(webOpenRes.result.spokenResponse.includes('native Android integration'));

  // On ANDROID_NATIVE platform, OPEN_APP returns SUCCESS
  const androidOpenRes = executeRoutedCommand(openInstagram, {
    platform: 'ANDROID_NATIVE',
    notes: [],
  });
  assert.equal(androidOpenRes.result.status, 'SUCCESS');

  // 2. OPEN_SETTINGS structured intent
  const openSettings = CommandRouter.route('Hey JARVIS, open wifi settings');
  assert.equal(openSettings.type, 'OPEN_SETTINGS');
  const webSettingsRes = executeRoutedCommand(openSettings, {
    platform: 'WEB',
    notes: [],
  });
  assert.equal(webSettingsRes.result.status, 'UNSUPPORTED');

  // 3. GET_BATTERY structured intent
  const getBattery = CommandRouter.route('JARVIS, what is my battery level?');
  assert.equal(getBattery.type, 'GET_BATTERY');
  const batterySuccess = executeRoutedCommand(getBattery, {
    platform: 'WEB',
    notes: [],
    batteryTelemetry: { supported: true, levelPercent: 84, charging: true },
  });
  assert.equal(batterySuccess.result.status, 'SUCCESS');
  assert.ok(batterySuccess.result.spokenResponse.includes('84%'));

  const batteryUnsupported = executeRoutedCommand(getBattery, {
    platform: 'WEB',
    notes: [],
    batteryTelemetry: { supported: false },
  });
  assert.equal(batteryUnsupported.result.status, 'UNSUPPORTED');

  // 4. SET_VOLUME structured intent
  const setVol = CommandRouter.route('JARVIS, set volume to 75%');
  assert.equal(setVol.type, 'SET_VOLUME');
  if (setVol.type === 'SET_VOLUME') {
    assert.equal(setVol.level, 75);
  }
  const webVolRes = executeRoutedCommand(setVol, {
    platform: 'WEB',
    notes: [],
  });
  assert.equal(webVolRes.result.status, 'UNSUPPORTED');

  // 5. CREATE_NOTE structured intent + Basic Memory persistence + Delete with confirmation
  const createNoteIntent = CommandRouter.route('JARVIS, create a note: Buy oat milk and espresso beans');
  assert.equal(createNoteIntent.type, 'CREATE_NOTE');
  const noteExec = executeRoutedCommand(createNoteIntent, {
    platform: 'WEB',
    notes: [],
  });
  assert.equal(noteExec.result.status, 'SUCCESS');
  assert.equal(noteExec.updatedNotes.length, 1);
  assert.equal(noteExec.updatedNotes[0].content, 'Buy oat milk and espresso beans');

  const savedNoteId = noteExec.updatedNotes[0].id;
  const unconfirmedDel = deleteNoteWithConfirmation(noteExec.updatedNotes, savedNoteId, false);
  assert.equal(unconfirmedDel.status, 'CONFIRMATION_REQUIRED');
  assert.equal(unconfirmedDel.updatedNotes.length, 1);

  const confirmedDel = deleteNoteWithConfirmation(noteExec.updatedNotes, savedNoteId, true);
  assert.equal(confirmedDel.status, 'SUCCESS');
  assert.equal(confirmedDel.updatedNotes.length, 0);

  // 6. ASK_AI structured intent
  const askAi = CommandRouter.route('JARVIS, explain quantum entanglement in simple terms');
  assert.equal(askAi.type, 'ASK_AI');
  if (askAi.type === 'ASK_AI') {
    assert.equal(askAi.prompt, 'explain quantum entanglement in simple terms');
  }

  // 7. UNKNOWN structured intent for incomplete command
  const unknownCmd = CommandRouter.route('JARVIS, open');
  assert.equal(unknownCmd.type, 'UNKNOWN');
  const unknownExec = executeRoutedCommand(unknownCmd, {
    platform: 'WEB',
    notes: [],
  });
  assert.equal(unknownExec.result.status, 'FAILED');
});

test('16. ElevenLabs Voice connection (https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld) parses URL, ID, and builds TTS payload', () => {
  assert.equal(DEFAULT_ELEVENLABS_VOICE_ID, 'dfsWmmgleAAdssZ0Spld');
  assert.equal(
    DEFAULT_ELEVENLABS_VOICE_URL,
    'https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld'
  );
  assert.equal(DEFAULT_ELEVENLABS_VOICE_CONFIG.voiceId, 'dfsWmmgleAAdssZ0Spld');
  assert.equal(DEFAULT_ELEVENLABS_VOICE_CONFIG.enabled, true);

  const fromUrl = parseElevenLabsVoiceIdentifier(
    'https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld'
  );
  assert.equal(fromUrl.valid, true);
  assert.equal(fromUrl.voiceId, 'dfsWmmgleAAdssZ0Spld');
  assert.equal(fromUrl.voiceUrl, 'https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld');

  const fromRawId = parseElevenLabsVoiceIdentifier('dfsWmmgleAAdssZ0Spld');
  assert.equal(fromRawId.valid, true);
  assert.equal(fromRawId.voiceId, 'dfsWmmgleAAdssZ0Spld');
  assert.equal(fromRawId.voiceUrl, 'https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld');

  const invalid = parseElevenLabsVoiceIdentifier('not a voice');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.voiceId, 'dfsWmmgleAAdssZ0Spld');

  const payload = buildElevenLabsTtsPayload('At your service, Boss.', {
    voiceId: 'https://elevenlabs.io/voices/dfsWmmgleAAdssZ0Spld',
  });
  assert.equal(
    payload.endpointUrl,
    'https://api.elevenlabs.io/v1/text-to-speech/dfsWmmgleAAdssZ0Spld'
  );
  assert.equal(payload.voiceId, 'dfsWmmgleAAdssZ0Spld');
  assert.equal(payload.body.text, 'At your service, Boss.');
  assert.equal(payload.body.model_id, 'eleven_multilingual_v2');
  assert.equal(payload.body.voice_settings.use_speaker_boost, true);
});

test('17. Google Gemini AI commands route to ASK_AI without interception and sanitize invalid key/model overrides', () => {
  // Invalid model/endpoint overrides ("3", "6") must be sanitized to gemini-3.8-flash
  const sanitizedPrimary = identifyProviderFromKey('1', 'primary', '2', '3', '6');
  assert.equal(sanitizedPrimary.kind, 'GEMINI');
  assert.equal(sanitizedPrimary.model, 'gemini-3.8-flash');
  assert.equal(sanitizedPrimary.configured, true);
  assert.ok(sanitizedPrimary.endpoint.includes('gemini-3.8-flash:generateContent'));

  // Gemini AI commands must NOT be intercepted by zero-prompt action verb parser
  const geminiQuantumCmd =
    'Hey JARVIS, ask Gemini AI to explain quantum computing in simple terms';
  const zeroPromptCheck = parseInstantZeroPromptCommands(geminiQuantumCmd);
  assert.equal(zeroPromptCheck.matched, false);

  const routedQuantum = CommandRouter.route(geminiQuantumCmd);
  assert.equal(routedQuantum.type, 'ASK_AI');

  const geminiMathCmd =
    'Hey JARVIS, ask Gemini AI to solve and explain step-by-step: 2x + 15 = 47';
  const zeroPromptMath = parseInstantZeroPromptCommands(geminiMathCmd);
  assert.equal(zeroPromptMath.matched, false);
  const routedMath = CommandRouter.route(geminiMathCmd);
  assert.equal(routedMath.type, 'ASK_AI');
});




