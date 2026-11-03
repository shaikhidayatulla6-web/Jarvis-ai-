package com.jarvis.assistant

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.jarvis.assistant.actions.AndroidActionManager
import com.jarvis.assistant.ai.BackendGatewayAiProvider
import com.jarvis.assistant.ai.FallbackAiOrchestrator
import com.jarvis.assistant.ai.ProviderRoutingMode
import com.jarvis.assistant.ui.JarvisHudScreen
import com.jarvis.assistant.voice.VoiceAssistantManager
import com.jarvis.assistant.voice.VoiceState
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var voiceManager: VoiceAssistantManager
    private lateinit var actionManager: AndroidActionManager
    private lateinit var aiOrchestrator: FallbackAiOrchestrator

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* Permission states updated dynamically */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        actionManager = AndroidActionManager(this)

        val primaryProvider = BackendGatewayAiProvider(
            providerId = "primary",
            displayName = "Primary (Google Gemini / Firebase AI Logic)",
            verifiedModel = "gemini-3.8-flash",
            endpointUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
            authMethodDescription = "Server-Side Secret / Firebase App Check"
        )

        val secondaryProvider = BackendGatewayAiProvider(
            providerId = "secondary",
            displayName = "Secondary (Failover AI Provider)",
            verifiedModel = "gemini-3.1-flash-lite",
            endpointUrl = "${BuildConfig.BACKEND_GATEWAY_URL}/api/ai/chat",
            authMethodDescription = "Server-Side Bearer / Failover Key"
        )

        aiOrchestrator = FallbackAiOrchestrator(primaryProvider, secondaryProvider)

        setContent {
            var routingMode by remember { mutableStateOf(ProviderRoutingMode.AUTO_FALLBACK) }
            var activeProviderLabel by remember { mutableStateOf("Auto Fallback · Primary Ready") }
            val messages = remember {
                mutableStateListOf(
                    "jarvis" to "JARVIS online. Dual-provider AI brain, voice recognition, app launcher, WhatsApp preparation, and task scheduler ready."
                )
            }

            LaunchedEffect(Unit) {
                requestEssentialPermissionsIfNeeded()
            }

            if (!::voiceManager.isInitialized) {
                voiceManager = VoiceAssistantManager(this) { spokenText ->
                    messages.add("user" to spokenText)
                    handleUserCommand(
                        command = spokenText,
                        mode = routingMode,
                        onUpdateLabel = { activeProviderLabel = it },
                        onReply = { reply ->
                            messages.add("jarvis" to reply)
                            voiceManager.speakReply(reply)
                        }
                    )
                }
            }

            val voiceState by voiceManager.voiceState.collectAsState()
            val rmsLevel by voiceManager.rmsDbLevel.collectAsState()

            MaterialTheme(colorScheme = darkColorScheme()) {
                JarvisHudScreen(
                    voiceState = voiceState,
                    rmsLevel = rmsLevel,
                    routingMode = routingMode,
                    activeProviderLabel = activeProviderLabel,
                    messages = messages,
                    onModeChange = { newMode ->
                        routingMode = newMode
                        activeProviderLabel = when (newMode) {
                            ProviderRoutingMode.AUTO_FALLBACK -> "Auto Fallback · Primary Default"
                            ProviderRoutingMode.PRIMARY_ONLY -> "Primary Provider Only"
                            ProviderRoutingMode.SECONDARY_ONLY -> "Secondary Provider Only"
                        }
                    },
                    onPushToTalkClick = {
                        if (voiceState == VoiceState.LISTENING) {
                            voiceManager.stopListening()
                        } else {
                            voiceManager.startPushToTalkListening()
                        }
                    },
                    onSendTextCommand = { text ->
                        messages.add("user" to text)
                        handleUserCommand(
                            command = text,
                            mode = routingMode,
                            onUpdateLabel = { activeProviderLabel = it },
                            onReply = { reply ->
                                messages.add("jarvis" to reply)
                                voiceManager.speakReply(reply)
                            }
                        )
                    }
                )
            }
        }
    }

    private fun handleUserCommand(
        command: String,
        mode: ProviderRoutingMode,
        onUpdateLabel: (String) -> Unit,
        onReply: (String) -> Unit
    ) {
        lifecycleScope.launch {
            try {
                val aiTurn = aiOrchestrator.executeTurn(
                    userMessage = command,
                    historyJson = "[]",
                    mode = mode
                )
                onUpdateLabel(
                    if (aiTurn.fallbackTriggered) {
                        "Failover Active -> ${aiTurn.providerUsed.uppercase()} (${aiTurn.modelUsed})"
                    } else {
                        "Active: ${aiTurn.providerUsed.uppercase()} (${aiTurn.modelUsed})"
                    }
                )

                // Execute any structured tool calls validated by Kotlin
                for (tool in aiTurn.toolCalls) {
                    when (tool.name) {
                        "open_app" -> {
                            val appName = tool.args["app_name"].orEmpty()
                            actionManager.openApp(appName)
                        }
                        "prepare_whatsapp_message" -> {
                            val contact = tool.args["contact"].orEmpty()
                            val msg = tool.args["message"].orEmpty()
                            actionManager.prepareWhatsAppMessage(contact, msg)
                        }
                    }
                }

                onReply(aiTurn.replyText)
            } catch (e: Exception) {
                onReply("Unable to complete request: ${e.localizedMessage}")
            }
        }
    }

    private fun requestEssentialPermissionsIfNeeded() {
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }

    override fun onDestroy() {
        if (::voiceManager.isInitialized) {
            voiceManager.shutdown()
        }
        super.onDestroy()
    }
}
