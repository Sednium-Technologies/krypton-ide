package com.sednium.kryptonide.agent.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.sednium.kryptonide.agent.hardware.HardwareTopology
import com.sednium.kryptonide.agent.oorty.SystemPrompt
import com.sednium.kryptonide.agent.pocket.PocketModels
import com.sednium.kryptonide.agent.pocket.PocketServerManager

/** Native Compose host for the Pocket Server screen. */
class PocketServerActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val initialHardware = HardwareTopology.scan(this)

        setContent {
            KryptonTheme {
                var running by remember { mutableStateOf(PocketServerManager.isRunning()) }
                var selectedModelId by remember { mutableStateOf(PocketServerManager.currentModelId()) }
                var hardware by remember { mutableStateOf(initialHardware) }
                var showWarning by remember { mutableStateOf(initialHardware.thermalWarning()) }

                if (showWarning) {
                    HardwareWarningDialog(
                        hardware = hardware,
                        onDismiss = { showWarning = false },
                        onProceed = { showWarning = false },
                    )
                }

                PocketServerScreen(
                    models = PocketModels.catalog,
                    selectedModelId = selectedModelId,
                    state = PocketServerManager.state().copy(
                        running = running,
                        selectedModelId = selectedModelId,
                    ),
                    hardware = hardware,
                    onSelectModel = { id ->
                        if (PocketServerManager.selectModel(id)) selectedModelId = id
                    },
                    onToggleServer = { enabled ->
                        if (enabled) {
                            PocketServerManager.start(this)
                        } else {
                            PocketServerManager.stop(this)
                        }
                        running = PocketServerManager.isRunning()
                        hardware = HardwareTopology.scan(this)
                    },
                    onOpenUpstream = { openUrl(SystemPrompt.UPSTREAM_URL) },
                    onBack = { finish() },
                )
            }
        }
    }

    private fun openUrl(url: String) {
        try {
            startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (_: Exception) {
        }
    }
}
