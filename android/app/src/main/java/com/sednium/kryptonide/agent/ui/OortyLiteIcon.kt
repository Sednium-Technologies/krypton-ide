package com.sednium.kryptonide.agent.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.sednium.kryptonide.R

/**
 * Vector emblem used by the native Pocket Server screens. The raster asset is
 * also exposed for callers that prefer the shipped artwork.
 */
@Composable
fun OortyLiteIcon(
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.primary,
) {
    Canvas(modifier) {
        val side = minOf(size.width, size.height)
        val corner = CornerRadius(side * 0.28f, side * 0.28f)
        drawRoundRect(
            color = tint.copy(alpha = 0.14f),
            cornerRadius = corner,
        )
        drawRoundRect(
            color = tint,
            cornerRadius = corner,
            style = Stroke(width = side * 0.055f),
        )
        drawCircle(
            color = tint,
            radius = side * 0.21f,
            center = Offset(side * 0.44f, side * 0.54f),
            style = Stroke(width = side * 0.06f),
        )
        drawCircle(
            color = tint,
            radius = side * 0.055f,
            center = Offset(side * 0.72f, side * 0.30f),
        )
    }
}

@Composable
fun OortyBrandMark(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(id = R.drawable.oorty_icon),
        contentDescription = "Oorty Lite",
        modifier = modifier.size(40.dp),
    )
}
