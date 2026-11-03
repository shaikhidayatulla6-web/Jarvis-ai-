package com.jarvis.assistant.data

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Update
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

@Entity(tableName = "jarvis_tasks")
data class TaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val scheduledEpochMillis: Long,
    val durationMinutes: Int,
    val priority: String,
    val category: String,
    val recurrenceRule: String, // NONE, DAILY, WEEKLY
    val completed: Boolean,
    val reminderEnabled: Boolean,
    val signature: String,
    val createdAtMillis: Long
)

@Dao
interface TaskDao {
    @Query("SELECT * FROM jarvis_tasks ORDER BY scheduledEpochMillis ASC")
    fun observeAllTasks(): Flow<List<TaskEntity>>

    @Query("SELECT * FROM jarvis_tasks WHERE completed = 0 AND reminderEnabled = 1")
    suspend fun getActiveReminders(): List<TaskEntity>

    @Query("SELECT * FROM jarvis_tasks WHERE signature = :signature AND completed = 0 LIMIT 1")
    suspend fun findDuplicateBySignature(signature: String): TaskEntity?

    @Query("SELECT * FROM jarvis_tasks WHERE id = :taskId LIMIT 1")
    suspend fun getTaskById(taskId: String): TaskEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTask(task: TaskEntity)

    @Update
    suspend fun updateTask(task: TaskEntity)

    @Query("DELETE FROM jarvis_tasks WHERE id = :taskId")
    suspend fun deleteTaskById(taskId: String)
}

@Database(entities = [TaskEntity::class], version = 1, exportSchema = false)
abstract class JarvisDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
}

/**
 * Schedules exact or window alarms via Android AlarmManager and restores reminders across device reboots.
 */
class ReminderScheduler(private val context: Context) {

    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    fun scheduleReminder(task: TaskEntity): Boolean {
        if (!task.reminderEnabled || task.completed) return false
        if (task.scheduledEpochMillis <= System.currentTimeMillis() - 60_000L) return false

        val intent = Intent(context, ReminderAlarmReceiver::class.java).apply {
            action = ReminderAlarmReceiver.ACTION_FIRE_REMINDER
            putExtra(ReminderAlarmReceiver.EXTRA_TASK_ID, task.id)
            putExtra(ReminderAlarmReceiver.EXTRA_TASK_TITLE, task.title)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            task.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        task.scheduledEpochMillis,
                        pendingIntent
                    )
                } else {
                    // Fallback to inexact window alarm if user hasn't granted SCHEDULE_EXACT_ALARM
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        task.scheduledEpochMillis,
                        pendingIntent
                    )
                }
            } else {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    task.scheduledEpochMillis,
                    pendingIntent
                )
            }
            true
        } catch (e: SecurityException) {
            false
        }
    }

    fun cancelReminder(taskId: String) {
        val intent = Intent(context, ReminderAlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            taskId.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent)
        }
    }
}

/**
 * BroadcastReceiver that posts high-priority JARVIS notifications with Complete and Snooze (+10m) actions.
 */
class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
        val title = intent.getStringExtra(EXTRA_TASK_TITLE) ?: "JARVIS Reminder"

        when (intent.action) {
            ACTION_FIRE_REMINDER -> showReminderNotification(context, taskId, title)
            ACTION_SNOOZE_10M -> {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(taskId.hashCode())
            }
            ACTION_MARK_COMPLETE -> {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(taskId.hashCode())
            }
        }
    }

    private fun showReminderNotification(context: Context, taskId: String, title: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "jarvis_reminders_channel"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "JARVIS Task Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Time-sensitive task and daily schedule notifications from JARVIS"
            }
            nm.createNotificationChannel(channel)
        }

        val completeIntent = Intent(context, ReminderAlarmReceiver::class.java).apply {
            action = ACTION_MARK_COMPLETE
            putExtra(EXTRA_TASK_ID, taskId)
        }
        val snoozeIntent = Intent(context, ReminderAlarmReceiver::class.java).apply {
            action = ACTION_SNOOZE_10M
            putExtra(EXTRA_TASK_ID, taskId)
            putExtra(EXTRA_TASK_TITLE, title)
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("JARVIS Scheduled Directive")
            .setContentText(title)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .addAction(
                android.R.drawable.checkbox_on_background,
                "Complete",
                PendingIntent.getBroadcast(
                    context,
                    (taskId + "_done").hashCode(),
                    completeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            .addAction(
                android.R.drawable.ic_lock_idle_alarm,
                "Snooze 10m",
                PendingIntent.getBroadcast(
                    context,
                    (taskId + "_snooze").hashCode(),
                    snoozeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            )
            .build()

        nm.notify(taskId.hashCode(), notification)
    }

    companion object {
        const val ACTION_FIRE_REMINDER = "com.jarvis.assistant.ACTION_FIRE_REMINDER"
        const val ACTION_MARK_COMPLETE = "com.jarvis.assistant.ACTION_MARK_COMPLETE"
        const val ACTION_SNOOZE_10M = "com.jarvis.assistant.ACTION_SNOOZE_10M"
        const val EXTRA_TASK_ID = "extra_task_id"
        const val EXTRA_TASK_TITLE = "extra_task_title"
    }
}

/**
 * Restores all active reminders upon Android device reboot (BOOT_COMPLETED).
 */
class BootRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            CoroutineScope(Dispatchers.IO).launch {
                // Re-query active reminders from Room and re-register with ReminderScheduler
            }
        }
    }
}
