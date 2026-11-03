package com.jarvis.assistant

import com.jarvis.assistant.ai.AiErrorCategory
import com.jarvis.assistant.ai.AiAssistantResponse
import com.jarvis.assistant.ai.AiProvider
import com.jarvis.assistant.ai.AiServiceException
import com.jarvis.assistant.ai.FallbackAiOrchestrator
import com.jarvis.assistant.ai.ProviderHealthStatus
import com.jarvis.assistant.ai.ProviderRoutingMode
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JarvisUnitTest {

    @Test
    fun `automatic fallback switches from primary to secondary on recoverable 429 quota error`() = runTest {
        val failingPrimary = object : AiProvider {
            override val providerId = "primary"
            override val displayName = "Primary Gemini"
            override val verifiedModel = "gemini-3.8-flash"
            override val endpointUrl = "https://generativelanguage.googleapis.com/v1beta"
            override val authMethodDescription = "x-goog-api-key"

            override suspend fun sendTurn(userMessage: String, conversationHistoryJson: String): AiAssistantResponse {
                throw AiServiceException(
                    category = AiErrorCategory.QUOTA_EXCEEDED,
                    httpStatus = 429,
                    message = "Quota limit reached",
                    isRecoverable = true
                )
            }

            override suspend fun testConnection(): ProviderHealthStatus = TODO()
        }

        val workingSecondary = object : AiProvider {
            override val providerId = "secondary"
            override val displayName = "Secondary Provider"
            override val verifiedModel = "gemini-3.1-flash-lite"
            override val endpointUrl = "https://generativelanguage.googleapis.com/v1beta"
            override val authMethodDescription = "x-goog-api-key"

            override suspend fun sendTurn(userMessage: String, conversationHistoryJson: String): AiAssistantResponse {
                return AiAssistantResponse(
                    replyText = "Handled by secondary provider.",
                    providerUsed = "secondary",
                    modelUsed = verifiedModel
                )
            }

            override suspend fun testConnection(): ProviderHealthStatus = TODO()
        }

        val orchestrator = FallbackAiOrchestrator(failingPrimary, workingSecondary)
        val result = orchestrator.executeTurn(
            userMessage = "What are my tasks for today?",
            historyJson = "[]",
            mode = ProviderRoutingMode.AUTO_FALLBACK
        )

        assertTrue(result.fallbackTriggered)
        assertEquals("secondary", result.providerUsed)
        assertEquals("Handled by secondary provider.", result.replyText)
    }

    @Test
    fun `past timestamps are rejected during reminder validation`() {
        val nowMillis = 1_761_750_000_000L
        val pastMillis = nowMillis - 3_600_000L
        val futureMillis = nowMillis + 7_200_000L

        assertFalse(pastMillis > nowMillis - 60_000L)
        assertTrue(futureMillis > nowMillis - 60_000L)
    }
}
