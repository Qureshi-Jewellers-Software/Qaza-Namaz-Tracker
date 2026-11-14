package com.qazanamaz.tracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// App ke rang (designs ke mutabiq)
private val Green = Color(0xFF0E5A4A)
private val Ground = Color(0xFFF5F6F2)
private val Ink = Color(0xFF1A1F1C)

private val LightColors = lightColorScheme(
    primary = Green,
    onPrimary = Color.White,
    background = Ground,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF6FC2AC),
    onPrimary = Color(0xFF00382D),
    background = Color(0xFF111614),
    onBackground = Color(0xFFE2E7E4),
    surface = Color(0xFF1A201D),
    onSurface = Color(0xFFE2E7E4),
)

@Composable
fun QazaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            QazaTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    WelcomeScreen()
                }
            }
        }
    }
}

// Pehli screen: sirf yeh check karne ke liye ke APK sahih ban rahi hai.
@Composable
fun WelcomeScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(22.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text("☾", color = MaterialTheme.colorScheme.onPrimary, fontSize = 40.sp)
        }
        Text(
            text = "Qaza Namaz Tracker",
            modifier = Modifier.padding(top = 20.dp),
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = "Assalam-o-Alaikum!\nPehla version kamyabi se install ho gaya.",
            modifier = Modifier.padding(top = 12.dp),
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f),
        )
        Text(
            text = "Version 0.1.0",
            modifier = Modifier.padding(top = 24.dp),
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Preview(showBackground = true)
@Composable
fun WelcomePreview() {
    QazaTheme { WelcomeScreen() }
}
