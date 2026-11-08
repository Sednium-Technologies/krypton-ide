package com.sednium.kryptonide.agent.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sednium.kryptonide.agent.hardware.HardwareSnapshot
import com.sednium.kryptonide.agent.oorty.SystemPrompt
import com.sednium.kryptonide.agent.pocket.PocketModelSpec
import com.sednium.kryptonide.agent.pocket.PocketServerManager

private val Ivory = lightColorScheme(
    primary = Color(0xFF2A2529),
    onPrimary = Color(0xFFF3F0E7),
    background = Color(0xFFF3F0E7),
    onBackground = Color(0xFF2A2529),
    surface = Color(0xFFF8F5EE),
    onSurface = Color(0xFF2A2529),
    surfaceVariant = Color(0xFFECE8DC),
    onSurfaceVariant = Color(0xFF5A5358),
    secondary = Color(0xFF7C9B79),
)

private val Charcoal = darkColorScheme(
    primary = Color(0xFFF3F0E7),
    onPrimary = Color(0xFF2A2529),
    background = Color(0xFF231E22),
    onBackground = Color(0xFFF3F0E7),
    surface = Color(0xFF2A2529),
    onSurface = Color(0xFFF3F0E7),
    surfaceVariant = Color(0xFF342F33),
    onSurfaceVariant = Color(0xFFCFC9CE),
    secondary = Color(0xFF7C9B79),
)

@Composable
fun KryptonTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) Charcoal else Ivory, content = content)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PocketServerScreen(
    models: List<PocketModelSpec>,
    selectedModelId: String,
    state: PocketServerManager.ServerState,
    hardware: HardwareSnapshot,
    onSelectModel: (String) -> Unit,
    onToggleServer: (Boolean) -> Unit,
    onOpenUpstream: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OortyLiteIcon(modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text("Oorty Lite", fontWeight = FontWeight.SemiBold)
                            Text(
                                "Pocket Server",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("Back") }
                },
                actions = {
                    TextButton(onClick = onOpenUpstream) { Text("Upstream") }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    shape = RoundedCornerShape(20.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Pocket Server", fontWeight = FontWeight.SemiBold)
                            Text(
                                if (state.running) "Running with foreground protection" else "Stopped",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            state.lastError?.let {
                                Text(it, style = MaterialTheme.typography.bodySmall, color = Color(0xFFB3261E))
                            }
                        }
                        Switch(
                            checked = state.running,
                            onCheckedChange = onToggleServer,
                        )
                    }
                }
            }

            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Hardware telemetry", fontWeight = FontWeight.SemiBold)
                        TelemetryRow("RAM", "${hardware.availableRamMb} MB free / ${hardware.totalRamMb} MB")
                        TelemetryRow("CPU cores", "${hardware.performanceCoreCount} performance / ${hardware.cores.size} total")
                        TelemetryRow("Peak frequency", "${hardware.peakFrequencyKhz / 1000} MHz")
                        TelemetryRow("GPU", hardware.gpuVendor)
                        TelemetryRow("Thermal", "${"%.1f".format(hardware.thermalCelsius)}°C")
                        TelemetryRow("Inference threads", hardware.optimalThreadCount.toString())
                    }
                }
            }

            item {
                Text(
                    "Models",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            items(models, key = { it.id }) { model ->
                val selected = model.id == selectedModelId
                val fits = hardware.canHostModel(model.sizeBytes)
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelectModel(model.id) },
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (selected) {
                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)
                        } else {
                            MaterialTheme.colorScheme.surface
                        },
                    ),
                    border = if (selected) {
                        BorderStroke(1.dp, MaterialTheme.colorScheme.secondary)
                    } else {
                        null
                    },
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(model.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            Text(model.sizeLabel, style = MaterialTheme.typography.labelMedium)
                        }
                        Text(
                            "${model.quantization} · ${model.contextLength} ctx · ${model.type}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(model.description, style = MaterialTheme.typography.bodySmall)
                        if (!fits) {
                            Text(
                                "Low memory for this model on the current device.",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFFB3261E),
                            )
                        }
                    }
                }
            }

            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Immutable system prompt", fontWeight = FontWeight.SemiBold)
                        Text(
                            SystemPrompt.IMMUTABLE.take(220) + "…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        OutlinedButton(onClick = onOpenUpstream) {
                            Text("github.com/Sednium-Technologies/OORTY")
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun TelemetryRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(140.dp),
        )
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}
