package com.jarvis.assistant.ai

import com.jarvis.assistant.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Provider routing modes required by JARVIS Dual-Provider specification:
 * - PRIMARY_ONLY: Always route to Provider 1 (Google Gemini / Firebase AI Logic).
 * - SECONDARY_ONLY: Always route to Provider 2 (Secondary Failover Provider).
 * - AUTO_FALLBACK: Default to Primary and automatically switch to Secondary when a recoverable API error occurs.
 */
enum class ProviderRoutingMode {
    AUTO_FALLBACK,
    PRIMARY_ONLY,
    SECONDARY_ONLY
}

enum class AiErrorCategory {
    QUOTA_EXCEEDED,
    RATE_LIMITED,
    INVALID_KEY,
    UNSUPPORTED_MODEL,
    SERVER_OVERLOAD,
    NETWORK_FAILURE,
    UNKNOWN
}

data class AiServiceException(
    val category: AiErrorCategory,
    val httpStatus: Int?,
    override val message: String,
    val isRecoverable: Boolean
) : Exception(message)

@Serializable
data class ToolCallPayload(
    val name: String,
    val args: Map<String, String> = emptyMap()
)

@Serializable
data class AiAssistantResponse(
    val replyText: String,
    val toolCalls: List<ToolCallPayload> = emptyList(),
    val providerUsed: String,
    val modelUsed: String,
    val fallbackTriggered: Boolean = false,
    val fallbackReason: String? = null
)

@Serializable
data class ProviderHealthStatus(
    val providerId: String,
    val providerLabel: String,
    val endpoint: String,
    val authMethod: String,
    val model: String,
    val healthy: Boolean,
    val latencyMs: Long,
    val errorCategory: String? = null,
    val message: String
)

/**
 * Common AI Provider Interface implemented by both Provider 1 (Primary) and Provider 2 (Secondary).
 */
interface AiProvider {
    val providerId: String
    val displayName: String
    val verifiedModel: String
    val endpointUrl: String
    val authMethodDescription: String

    suspend fun sendTurn(
        userMessage: String,
        conversationHistoryJson: String
    ): AiAssistantResponse

    suspend fun testConnection(): ProviderHealthStatus
}

@Serializable
private data class GatewayChatRequest(
    val message: String,
    val providerSlot: String,
    val routingMode: String
)

/**
 * Secure Backend Gateway AI Provider implementation.
 * Keeps both API Key 1 and API Key 2 strictly in server-side environment variables on the backend,
 * ensuring zero secret keys are embedded in Kotlin source code or the distributable APK.
 */
class BackendGatewayAiProvider(
    override val providerId: String,
    override val displayName: String,
    override val verifiedModel: String,
    override val endpointUrl: String,
    override val authMethodDescription: String,
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()
) : AiProvider {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun sendTurn(
        userMessage: String,
        conversationHistoryJson: String
    ): AiAssistantResponse = withContext(Dispatchers.IO) {
        val requestPayload = json.encodeToString(
            GatewayChatRequest(
                message = userMessage,
                providerSlot = providerId,
                routingMode = if (providerId == "primary") "PRIMARY_ONLY" else "SECONDARY_ONLY"
            )
        )

        val request = Request.Builder()
            .url("${BuildConfig.BACKEND_GATEWAY_URL}/api/ai/chat")
            .post(requestPayload.toRequestBody("application/json".toMediaType()))
            .header("Accept", "application/json")
            .build()

        try {
            httpClient.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw classifyHttpError(response.code, bodyStr)
                }
                json.decodeFromString<AiAssistantResponse>(bodyStr)
            }
        } catch (ioEx: IOException) {
            throw AiServiceException(
                category = AiErrorCategory.NETWORK_FAILURE,
                httpStatus = null,
                message = "Network error reaching AI gateway: ${ioEx.localizedMessage}",
                isRecoverable = true
            )
        }
    }

    override suspend fun testConnection(): ProviderHealthStatus = withContext(Dispatchers.IO) {
        val startMs = System.currentTimeMillis()
        val payload = """{"slot":"$providerId"}"""
        val request = Request.Builder()
            .url("${BuildConfig.BACKEND_GATEWAY_URL}/api/ai/test-provider")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()

        try {
            httpClient.newCall(request).execute().use { response ->
                val elapsed = System.currentTimeMillis() - startMs
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val classified = classifyHttpError(response.code, body)
                    return@withContext ProviderHealthStatus(
                        providerId = providerId,
                        providerLabel = displayName,
                        endpoint = endpointUrl,
                        authMethod = authMethodDescription,
                        model = verifiedModel,
                        healthy = false,
                        latencyMs = elapsed,
                        errorCategory = classified.category.name,
                        message = classified.message
                    )
                }
                json.decodeFromString<ProviderHealthStatus>(body)
            }
        } catch (e: Exception) {
            val elapsed = System.currentTimeMillis() - startMs
            ProviderHealthStatus(
                providerId = providerId,
                providerLabel = displayName,
                endpoint = endpointUrl,
                authMethod = authMethodDescription,
                model = verifiedModel,
                healthy = false,
                latencyMs = elapsed,
                errorCategory = AiErrorCategory.NETWORK_FAILURE.name,
                message = e.localizedMessage ?: "Network failure"
            )
        }
    }

    companion object {
        fun classifyHttpError(statusCode: Int, responseBody: String): AiServiceException {
            val lower = responseBody.lowercase()
            return when {
                statusCode == 429 || lower.contains("quota") || lower.contains("rate_limit") ->
                    AiServiceException(
                        category = AiErrorCategory.QUOTA_EXCEEDED,
                        httpStatus = 429,
                        message = "Quota or rate limit exceeded (HTTP 429).",
                        isRecoverable = true
                    )
                statusCode == 401 || statusCode == 403 || lower.contains("invalid_key") ->
                    AiServiceException(
                        category = AiErrorCategory.INVALID_KEY,
                        httpStatus = statusCode,
                        message = "API key rejected (HTTP $statusCode). Check server-side secret configuration.",
                        isRecoverable = true
                    )
                statusCode == 404 || lower.contains("unsupported_model") ->
                    AiServiceException(
                        category = AiErrorCategory.UNSUPPORTED_MODEL,
                        httpStatus = statusCode,
                        message = "Unsupported or unavailable model identifier (HTTP $statusCode).",
                        isRecoverable = true
                    )
                statusCode in 500..599 ->
                    AiServiceException(
                        category = AiErrorCategory.SERVER_OVERLOAD,
                        httpStatus = statusCode,
                        message = "Provider temporarily overloaded (HTTP $statusCode).",
                        isRecoverable = true
                    )
                else ->
                    AiServiceException(
                        category = AiErrorCategory.UNKNOWN,
                        httpStatus = statusCode,
                        message = "AI request failed (HTTP $statusCode): $responseBody",
                        isRecoverable = true
                    )
            }
        }
    }
}

/**
 * Dual-Provider Orchestrator with Primary, Secondary, and Automatic Fallback modes.
 */
class FallbackAiOrchestrator(
    private val primaryProvider: AiProvider,
    private val secondaryProvider: AiProvider
) {
    suspend fun executeTurn(
        userMessage: String,
        historyJson: String,
        mode: ProviderRoutingMode
    ): AiAssistantResponse {
        return when (mode) {
            ProviderRoutingMode.PRIMARY_ONLY ->
                primaryProvider.sendTurn(userMessage, historyJson)

            ProviderRoutingMode.SECONDARY_ONLY ->
                secondaryProvider.sendTurn(userMessage, historyJson)

            ProviderRoutingMode.AUTO_FALLBACK -> {
                try {
                    primaryProvider.sendTurn(userMessage, historyJson)
                } catch (primaryErr: AiServiceException) {
                    if (!primaryErr.isRecoverable) throw primaryErr
                    val fallbackResp = secondaryProvider.sendTurn(userMessage, historyJson)
                    fallbackResp.copy(
                        fallbackTriggered = true,
                        fallbackReason = "${primaryErr.category}: ${primaryErr.message}"
                    )
                }
            }
        }
    }
}

/**
 * Google Gemini AI Engine Models for JARVIS Android Assistant.
 */
enum class GeminiModelEngine(
    val modelId: String,
    val displayTitle: String,
    val capabilityDescription: String
) {
    GEMINI_3_8_FLASH(
        "gemini-3.8-flash",
        "Google Gemini (gemini-3.8-flash)",
        "Low-Latency Multimodal Reasoning, Coding & Native Android Function Calling"
    ),
    GEMINI_3_1_FLASH_LITE(
        "gemini-3.1-flash-lite",
        "Google Gemini Fast Failover (gemini-3.1-flash-lite)",
        "High-Throughput Fast Conversational & Tool Dispatch"
    )
}


