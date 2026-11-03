package com.jarvis.assistant.actions

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Settings

data class AllowedAppEntry(
    val displayName: String,
    val packageName: String,
    val intentAction: String,
    val aliases: Set<String>
)

sealed class ActionExecutionResult {
    data class Success(val summary: String, val metadata: Map<String, String> = emptyMap()) : ActionExecutionResult()
    data class RequiresConfirmation(
        val summary: String,
        val recipientName: String,
        val phoneE164: String,
        val messageBody: String,
        val waIntentUri: String
    ) : ActionExecutionResult()
    data class ClarificationNeeded(val prompt: String, val options: List<String>) : ActionExecutionResult()
    data class Failure(val errorCode: String, val userMessage: String) : ActionExecutionResult()
}

/**
 * AndroidActionManager enforces an explicit allowlist of supported applications
 * and safe WhatsApp message preparation without AccessibilityService or hidden tap hacks.
 */
class AndroidActionManager(private val context: Context) {

    private val allowlistedApps = mutableListOf(
        AllowedAppEntry(
            displayName = "Instagram",
            packageName = "com.instagram.android",
            intentAction = Intent.ACTION_MAIN,
            aliases = setOf("instagram", "insta", "ig")
        ),
        AllowedAppEntry(
            displayName = "WhatsApp",
            packageName = "com.whatsapp",
            intentAction = Intent.ACTION_MAIN,
            aliases = setOf("whatsapp", "wa", "whats app")
        ),
        AllowedAppEntry(
            displayName = "YouTube",
            packageName = "com.google.android.youtube",
            intentAction = Intent.ACTION_MAIN,
            aliases = setOf("youtube", "yt")
        ),
        AllowedAppEntry(
            displayName = "Chrome",
            packageName = "com.android.chrome",
            intentAction = Intent.ACTION_MAIN,
            aliases = setOf("chrome", "google chrome", "browser")
        ),
        AllowedAppEntry(
            displayName = "Settings",
            packageName = "com.android.settings",
            intentAction = Settings.ACTION_SETTINGS,
            aliases = setOf("settings", "system settings", "phone settings")
        ),
        AllowedAppEntry(
            displayName = "Phone Dialer",
            packageName = "com.android.dialer",
            intentAction = Intent.ACTION_DIAL,
            aliases = setOf("dialer", "phone", "call")
        )
    )

    fun registerCustomAlias(packageName: String, alias: String) {
        val index = allowlistedApps.indexOfFirst { it.packageName == packageName }
        if (index >= 0) {
            val current = allowlistedApps[index]
            allowlistedApps[index] = current.copy(aliases = current.aliases + alias.lowercase().trim())
        }
    }

    /**
     * Validates and launches an allowlisted Android application.
     * Never claims success until startActivity() succeeds on the device.
     */
    fun openApp(requestedAppName: String): ActionExecutionResult {
        val query = requestedAppName.trim().lowercase()
        if (query.isEmpty()) {
            return ActionExecutionResult.Failure("EMPTY_APP_NAME", "Please specify which app to open.")
        }

        val matches = allowlistedApps.filter { entry ->
            entry.displayName.lowercase() == query ||
                entry.packageName.lowercase() == query ||
                entry.aliases.contains(query) ||
                entry.displayName.lowercase().contains(query)
        }

        if (matches.isEmpty()) {
            return ActionExecutionResult.Failure(
                "NOT_ALLOWLISTED",
                "\"$requestedAppName\" is not in JARVIS's allowlist. Configure app aliases in Settings."
            )
        }

        if (matches.size > 1) {
            return ActionExecutionResult.ClarificationNeeded(
                prompt = "Multiple apps match \"$requestedAppName\". Which one should I launch?",
                options = matches.map { it.displayName }
            )
        }

        val target = matches.first()
        return try {
            val launchIntent: Intent? = when (target.intentAction) {
                Settings.ACTION_SETTINGS -> Intent(Settings.ACTION_SETTINGS)
                Intent.ACTION_DIAL -> Intent(Intent.ACTION_DIAL)
                else -> context.packageManager.getLaunchIntentForPackage(target.packageName)
            }

            if (launchIntent == null) {
                return ActionExecutionResult.Failure(
                    "APP_NOT_INSTALLED",
                    "${target.displayName} (${target.packageName}) is not installed on this phone."
                )
            }

            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launchIntent)
            ActionExecutionResult.Success(
                summary = "Opened ${target.displayName}.",
                metadata = mapOf("packageName" to target.packageName)
            )
        } catch (e: Exception) {
            ActionExecutionResult.Failure(
                "LAUNCH_FAILED",
                "Failed to launch ${target.displayName}: ${e.localizedMessage}"
            )
        }
    }

    /**
     * Step 1-4 of Safe WhatsApp Workflow:
     * Resolves contact via ContactsContract (when READ_CONTACTS is granted), checks for ambiguity,
     * and returns RequiresConfirmation so the user reviews the exact recipient and message before opening WhatsApp.
     */
    fun prepareWhatsAppMessage(contactQuery: String, messageText: String): ActionExecutionResult {
        val cleanContact = contactQuery.trim()
        val cleanMessage = messageText.trim()

        if (cleanContact.isEmpty() || cleanMessage.isEmpty()) {
            return ActionExecutionResult.ClarificationNeeded(
                prompt = "Please provide both the recipient name and the message text for WhatsApp.",
                options = emptyList()
            )
        }

        val matchedContacts = queryVerifiedContacts(cleanContact)
        if (matchedContacts.isEmpty()) {
            return ActionExecutionResult.Failure(
                "MISSING_CONTACT",
                "Could not find a verified phone number for \"$cleanContact\". Please pick a contact or provide their number."
            )
        }

        if (matchedContacts.size > 1) {
            return ActionExecutionResult.ClarificationNeeded(
                prompt = "Multiple contacts match \"$cleanContact\". Please confirm which recipient you mean:",
                options = matchedContacts.map { "${it.first} (${it.second})" }
            )
        }

        val (resolvedName, phoneE164) = matchedContacts.first()
        val digitsOnly = phoneE164.replace("[^0-9]".toRegex(), "")
        val encodedText = Uri.encode(cleanMessage)
        val waUri = "https://wa.me/$digitsOnly?text=$encodedText"

        return ActionExecutionResult.RequiresConfirmation(
            summary = "Prepared WhatsApp message for $resolvedName ($phoneE164). Confirm to open WhatsApp with your message prefilled.",
            recipientName = resolvedName,
            phoneE164 = phoneE164,
            messageBody = cleanMessage,
            waIntentUri = waUri
        )
    }

    /**
     * Step 5-6 of Safe WhatsApp Workflow:
     * Executed only after explicit user confirmation in the UI. Opens WhatsApp with text prefilled so the user taps Send.
     */
    fun launchConfirmedWhatsAppDraft(waUri: String): ActionExecutionResult {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(waUri)).apply {
                setPackage("com.whatsapp")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val pm = context.packageManager
            if (intent.resolveActivity(pm) != null) {
                context.startActivity(intent)
                ActionExecutionResult.Success(
                    summary = "Opened WhatsApp conversation with prefilled message. Tap Send inside WhatsApp to deliver."
                )
            } else {
                // Fallback to browser wa.me link if standard package resolution is restricted
                val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(waUri)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(browserIntent)
                ActionExecutionResult.Success(
                    summary = "Opened WhatsApp link with prefilled message. Tap Send to deliver."
                )
            }
        } catch (e: Exception) {
            ActionExecutionResult.Failure(
                "WHATSAPP_OPEN_FAILED",
                "Unable to open WhatsApp: ${e.localizedMessage}"
            )
        }
    }

    private fun queryVerifiedContacts(nameQuery: String): List<Pair<String, String>> {
        val results = mutableListOf<Pair<String, String>>()
        val resolver = context.contentResolver
        val selection = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY} LIKE ?"
        val selectionArgs = arrayOf("%$nameQuery%")

        resolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            selection,
            selectionArgs,
            null
        )?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY)
            val numIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (cursor.moveToNext()) {
                val name = cursor.getString(nameIdx) ?: continue
                val number = cursor.getString(numIdx)?.replace("\\s+".toRegex(), "") ?: continue
                results.add(name to number)
            }
        }
        return results.distinctBy { it.first to it.second }
    }
}

/**
 * JARVIS 2.0 — Typed CommandRouter & Real Execution Statuses for Native Android
 */
enum class CommandExecutionStatus {
    SUCCESS,
    FAILED,
    UNSUPPORTED,
    PERMISSION_REQUIRED,
    CONFIRMATION_REQUIRED
}

sealed class JarvisCommand {
    data class AskAi(val prompt: String) : JarvisCommand()
    data class OpenApp(val appName: String) : JarvisCommand()
    data class OpenSettings(val section: String = "system") : JarvisCommand()
    object GetBattery : JarvisCommand()
    data class SetVolume(val levelPercent: Int? = null, val direction: String? = null) : JarvisCommand()
    data class CreateNote(val content: String) : JarvisCommand()
    data class Unknown(val reason: String) : JarvisCommand()
}

data class CommandExecutionOutcome(
    val command: JarvisCommand,
    val status: CommandExecutionStatus,
    val spokenResponse: String
)

object CommandRouter {
    fun route(rawInput: String): JarvisCommand {
        val cleaned = rawInput.trim()
            .replace(Regex("^(?:(?:hey|hi|ok)\\s+)?jarvis\\b[,:.!\\s]*", RegexOption.IGNORE_CASE), "")
            .trim()
        if (cleaned.isEmpty()) return JarvisCommand.Unknown("Empty command.")

        val noteMatch = Regex("^(?:create|save|add|take)\\s+(?:a\\s+)?note\\s*[:,-]?\\s*(.+)$", RegexOption.IGNORE_CASE)
            .find(cleaned)
        if (noteMatch != null) {
            return JarvisCommand.CreateNote(noteMatch.groupValues[1].trim())
        }

        if (Regex("^(?:open|launch)\\s+(?:android\\s+|system\\s+)?settings$", RegexOption.IGNORE_CASE).matches(cleaned)) {
            return JarvisCommand.OpenSettings()
        }

        val openMatch = Regex("^(?:open|launch)\\s+([a-zA-Z0-9\\s._-]+?)[.!?]*$", RegexOption.IGNORE_CASE).find(cleaned)
        if (openMatch != null) {
            return JarvisCommand.OpenApp(openMatch.groupValues[1].trim())
        }

        if (cleaned.contains("battery", ignoreCase = true)) {
            return JarvisCommand.GetBattery
        }

        val volMatch = Regex("set\\s+volume\\s+(?:to\\s+)?(\\d{1,3})%?", RegexOption.IGNORE_CASE).find(cleaned)
        if (volMatch != null) {
            return JarvisCommand.SetVolume(levelPercent = volMatch.groupValues[1].toIntOrNull())
        }

        return JarvisCommand.AskAi(cleaned)
    }
}

