package com.sednium.kryptonide.agent.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import com.sednium.kryptonide.agent.hardware.HardwareSnapshot

@Composable
fun HardwareWarningDialog(
    hardware: HardwareSnapshot,
    onDismiss: () -> Unit,
    onProceed: () -> Unit,
) {
    val reasons = buildList {
        if (hardware.availableRamMb < 512) {
            add("Only ${hardware.availableRamMb} MB RAM is currently available.")
        }
        if (hardware.thermalCelsius >= 45f) {
            add("Device temperature is ${"%.1f".format(hardware.thermalCelsius)}°C.")
        }
        if (hardware.performanceCoreCount <= 1) {
            add("No dedicated performance cores were detected.")
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Hardware advisory") },
        text = {
            Text(
                buildString {
                    append("Running a local model may be slow or unstable right now:\n\n")
                    reasons.forEach { append("• ").append(it).append('\n') }
                    append("\nOorty Lite will fall back to the hosted endpoint if loading fails.")
                },
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        confirmButton = {
            TextButton(onClick = onProceed) { Text("Continue") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Not now") }
        },
    )
}
