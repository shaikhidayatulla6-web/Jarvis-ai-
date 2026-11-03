package com.jarvis.assistant.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.assistant.ai.ProviderRoutingMode
import com.jarvis.assistant.voice.VoiceState

private val ObsidianBg = Color(0xFF04070D)
private val SlateSurface = Color(0xFF0F172A)
private val CyanAccent = Color(0xFFF59E0B)
private val ElectricBlue = Color(0xFFFBBF24)
private val DeepAmber = Color(0xFFD97706)

@Composable
fun JarvisHudScreen(
    voiceState: VoiceState,
    rmsLevel: Float,
    routingMode: ProviderRoutingMode,
    activeProviderLabel: String,
    messages: List<Pair<String, String>>,
    onModeChange: (ProviderRoutingMode) -> Unit,
    onPushToTalkClick: () -> Unit,
    onSendTextCommand: (String) -> Unit
) {
    var inputText by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
    ) {
        // Header with AI Provider Routing Selector
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "JARVIS // COMMAND RECEIVER",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = activeProviderLabel,
                    color = ElectricBlue,
                    fontSize = 12.sp
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ProviderRoutingMode.entries.forEach { mode ->
                    FilterChip(
                        selected = routingMode == mode,
                        onClick = { onModeChange(mode) },
                        label = {
                            Text(
                                text = when (mode) {
                                    ProviderRoutingMode.AUTO_FALLBACK -> "Auto Fallback"
                                    ProviderRoutingMode.PRIMARY_ONLY -> "Primary"
                                    ProviderRoutingMode.SECONDARY_ONLY -> "Secondary"
                                },
                                fontSize = 11.sp
                            )
                        }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Central Multi-Axis Rotating JARVIS Command Receiver
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(240.dp),
            contentAlignment = Alignment.Center
        ) {
            JarvisVoiceOrb(
                voiceState = voiceState,
                rmsLevel = rmsLevel,
                onClick = onPushToTalkClick
            )
        }

        // Conversation & Action Result Feed
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(messages) { (role, text) ->
                Surface(
                    color = if (role == "user") Color(0xFF1E293B) else SlateSurface,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = if (role == "user") "YOU" else "JARVIS",
                            color = if (role == "user") ElectricBlue else CyanAccent,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = text,
                            color = Color(0xFFF1F5F9),
                            fontSize = 14.sp
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Command Input Bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = inputText,
                onValueChange = { inputText = it },
                placeholder = { Text("Speak or type any command for JARVIS...") },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
            Button(
                onClick = {
                    if (inputText.isNotBlank()) {
                        onSendTextCommand(inputText)
                        inputText = ""
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = CyanAccent, contentColor = ObsidianBg)
            ) {
                Text("Execute", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun JarvisVoiceOrb(
    voiceState: VoiceState,
    rmsLevel: Float,
    onClick: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "jarvisCommandReceiver")
    val outerClockwiseAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = if (voiceState == VoiceState.LISTENING) 7000 else 18000,
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "outerClockwiseRing"
    )

    val middleCounterClockwiseAngle by infiniteTransition.animateFloat(
        initialValue = 360f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = if (voiceState == VoiceState.LISTENING) 5500 else 13000,
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "middleCounterRing"
    )

    val innerGyroAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 9000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "innerGyroRing"
    )

    val reactiveScale = 1f + (rmsLevel.coerceIn(0f, 10f) / 30f)

    Box(contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(216.dp)) {
            val radius = size.minDimension / 2f

            // Ambient golden-amber neural glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        ElectricBlue.copy(alpha = 0.42f),
                        DeepAmber.copy(alpha = 0.18f),
                        Color.Transparent
                    )
                ),
                radius = radius * 0.88f * reactiveScale,
                center = Offset(size.width / 2f, size.height / 2f)
            )

            // Outer Clockwise Telemetry Ring
            rotate(outerClockwiseAngle) {
                drawArc(
                    color = ElectricBlue.copy(alpha = 0.85f),
                    startAngle = 0f,
                    sweepAngle = 110f,
                    useCenter = false,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                )
                drawArc(
                    color = CyanAccent.copy(alpha = 0.7f),
                    startAngle = 160f,
                    sweepAngle = 140f,
                    useCenter = false,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                )
            }

            // Middle Counter-Rotating Neural Matrix Ring
            rotate(middleCounterClockwiseAngle) {
                drawArc(
                    color = DeepAmber.copy(alpha = 0.9f),
                    startAngle = 35f,
                    sweepAngle = 190f,
                    useCenter = false,
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
                )
            }

            // Inner Gyroscopic Ring
            rotate(innerGyroAngle) {
                drawArc(
                    color = ElectricBlue.copy(alpha = 0.75f),
                    startAngle = 90f,
                    sweepAngle = 220f,
                    useCenter = false,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                )
            }
        }

        Button(
            onClick = onClick,
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                containerColor = if (voiceState == VoiceState.LISTENING) CyanAccent else ObsidianBg,
                contentColor = if (voiceState == VoiceState.LISTENING) ObsidianBg else ElectricBlue
            ),
            modifier = Modifier.size(92.dp)
        ) {
            Text(
                text = when (voiceState) {
                    VoiceState.IDLE -> "RECEIVE"
                    VoiceState.LISTENING -> "STOP"
                    VoiceState.PROCESSING -> "NEURAL"
                    VoiceState.SPEAKING -> "VOICE"
                    VoiceState.ERROR -> "RETRY"
                },
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )
        }
    }
}

