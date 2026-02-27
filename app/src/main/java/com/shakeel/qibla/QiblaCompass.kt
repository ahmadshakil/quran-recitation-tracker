package com.shakeel.qibla

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat

@Composable
fun QiblaApp() {
    var hasLocationPermission by remember { mutableStateOf(false) }
    
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
    }

    val context = LocalContext.current
    
    LaunchedEffect(Unit) {
        val fineLocationGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        val coarseLocationGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        if (fineLocationGranted || coarseLocationGranted) {
            hasLocationPermission = true
        } else {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        if (hasLocationPermission) {
            QiblaCompassScreen()
        } else {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Text("Location permission is required to find the Qibla.", modifier = Modifier.padding(16.dp))
            }
        }
    }
}

@Composable
fun QiblaCompassScreen() {
    val context = LocalContext.current
    val textMeasurer = rememberTextMeasurer()
    var qiblaBearing by remember { mutableFloatStateOf(0f) }
    var currentAzimuth by remember { mutableFloatStateOf(0f) }
    var locationError by remember { mutableStateOf<String?>(null) }
    
    DisposableEffect(Unit) {
        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        
        val meccaLocation = Location("").apply {
            latitude = 21.422487
            longitude = 39.826206
        }

        val locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                qiblaBearing = location.bearingTo(meccaLocation)
            }
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        
        try {
            val provider = if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                LocationManager.GPS_PROVIDER
            } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                LocationManager.NETWORK_PROVIDER
            } else {
                null
            }
            
            if (provider != null) {
                try {
                    val location = locationManager.getLastKnownLocation(provider)
                    if (location != null) {
                        qiblaBearing = location.bearingTo(meccaLocation)
                    }
                } catch (e: SecurityException) {
                    locationError = "Location permission denied"
                }
                
                locationManager.requestLocationUpdates(
                    provider, 1000L, 10f, locationListener
                )
            } else {
                locationError = "Location providers are disabled. Please enable GPS."
            }
        } catch (e: SecurityException) {
            locationError = "Location permission denied"
        }

        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        
        var gravity: FloatArray? = null
        var geomagnetic: FloatArray? = null
        
        val sensorEventListener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                    gravity = event.values.clone()
                }
                if (event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
                    geomagnetic = event.values.clone()
                }
                
                if (gravity != null && geomagnetic != null) {
                    val R = FloatArray(9)
                    val I = FloatArray(9)
                    val success = SensorManager.getRotationMatrix(R, I, gravity, geomagnetic)
                    if (success) {
                        val orientation = FloatArray(3)
                        SensorManager.getOrientation(R, orientation)
                        val azimuthDegrees = Math.toDegrees(orientation[0].toDouble()).toFloat()
                        currentAzimuth = (azimuthDegrees + 360) % 360
                    }
                }
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }

        accelerometer?.let {
            sensorManager.registerListener(sensorEventListener, it, SensorManager.SENSOR_DELAY_UI)
        }
        magnetometer?.let {
            sensorManager.registerListener(sensorEventListener, it, SensorManager.SENSOR_DELAY_UI)
        }

        onDispose {
            locationManager.removeUpdates(locationListener)
            sensorManager.unregisterListener(sensorEventListener)
        }
    }

    if (locationError != null) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Text(locationError ?: "Unknown Error", color = MaterialTheme.colorScheme.error)
        }
        return
    }
    
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Qibla Compass",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 32.dp)
        )
        
        val directionDiff = ((qiblaBearing - currentAzimuth + 360) % 360)
        
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(300.dp)
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2, size.height / 2)
                val radius = size.width / 2

                drawCircle(
                    color = Color.LightGray,
                    radius = radius,
                    center = center
                )
                drawCircle(
                    color = Color.White,
                    radius = radius * 0.95f,
                    center = center
                )

                rotate(degrees = -currentAzimuth) {
                    val textStyle = TextStyle(color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 24.sp)
                    val nLayout = textMeasurer.measure("N", textStyle.copy(color = Color.Red))
                    val sLayout = textMeasurer.measure("S", textStyle)
                    val eLayout = textMeasurer.measure("E", textStyle)
                    val wLayout = textMeasurer.measure("W", textStyle)

                    drawLine(
                        color = Color.Red,
                        start = center,
                        end = Offset(center.x, 0f + nLayout.size.height + 5f),
                        strokeWidth = 4f
                    )
                    drawText(
                        textLayoutResult = nLayout,
                        topLeft = Offset(center.x - nLayout.size.width / 2, 5f)
                    )

                    drawLine(
                        color = Color.Black,
                        start = center,
                        end = Offset(center.x, size.height - sLayout.size.height - 5f),
                        strokeWidth = 2f
                    )
                    drawText(
                        textLayoutResult = sLayout,
                        topLeft = Offset(center.x - sLayout.size.width / 2, size.height - sLayout.size.height - 5f)
                    )

                    drawLine(
                        color = Color.Black,
                        start = center,
                        end = Offset(size.width - eLayout.size.width - 5f, center.y),
                        strokeWidth = 2f
                    )
                    drawText(
                        textLayoutResult = eLayout,
                        topLeft = Offset(size.width - eLayout.size.width - 5f, center.y - eLayout.size.height / 2)
                    )

                    drawLine(
                        color = Color.Black,
                        start = center,
                        end = Offset(0f + wLayout.size.width + 5f, center.y),
                        strokeWidth = 2f
                    )
                    drawText(
                        textLayoutResult = wLayout,
                        topLeft = Offset(5f, center.y - wLayout.size.height / 2)
                    )
                }
                
                rotate(degrees = -currentAzimuth + qiblaBearing) {
                    drawLine(
                        color = Color(0xFF008000),
                        start = center,
                        end = Offset(center.x, center.y - radius * 0.8f),
                        strokeWidth = 10f
                    )
                    drawCircle(
                        color = Color(0xFF008000),
                        radius = 20f,
                        center = Offset(center.x, center.y - radius * 0.8f)
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Text(
            text = "Heading to Mecca: ${qiblaBearing.toInt()}°",
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = "Current Azimuth: ${currentAzimuth.toInt()}°",
            style = MaterialTheme.typography.titleMedium
        )
        if (directionDiff < 5 || directionDiff > 355) {
            Text(
                text = "You are facing the Qibla!",
                color = Color(0xFF008000),
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(top = 16.dp)
            )
        } else {
            val turnText = if (directionDiff <= 180) {
                "Turn ${(directionDiff).toInt()}° Clockwise"
            } else {
                "Turn ${(360 - directionDiff).toInt()}° Anti-Clockwise"
            }
            Text(
                text = turnText,
                color = Color.DarkGray,
                fontWeight = FontWeight.Medium,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 16.dp)
            )
        }
    }
}
