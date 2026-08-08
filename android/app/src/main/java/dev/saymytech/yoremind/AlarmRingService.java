package dev.saymytech.yoremind;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

/**
 * The piece @capacitor/local-notifications never had: a foreground
 * service that actually RINGS — loops an alarm tone via MediaPlayer,
 * vibrates in a repeating pattern, holds a wake lock so the CPU doesn't
 * doze mid-ring, and posts a full-screen-intent notification that
 * launches AlarmActivity over the lock screen. Runs independently of
 * the JS/webview layer, so it works with the app fully closed.
 *
 * Auto-stops itself after RING_TIMEOUT_MS as a battery-safety net if the
 * person never interacts with it — same behaviour real alarm-clock apps
 * use so a missed alarm can't ring forever in someone's pocket.
 */
public class AlarmRingService extends Service {

    public static final String ACTION_STOP = "dev.saymytech.yoremind.action.STOP_RING";
    private static final String CHANNEL_ID = "alarm_ring_channel";
    private static final int NOTIF_ID = 999001;
    private static final long RING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::stopRinging;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopRinging();
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra("title") : null;
        String body = intent != null ? intent.getStringExtra("body") : null;
        String soundFile = intent != null ? intent.getStringExtra("soundFile") : null;
        String reminderId = intent != null ? intent.getStringExtra("reminderId") : null;
        String category = intent != null ? intent.getStringExtra("category") : null;

        if (title == null) title = "Reminder due";
        if (body == null) body = "";
        if (soundFile == null) soundFile = "alarm_classic";

        acquireWakeLock();
        startForeground(NOTIF_ID, buildNotification(title, body, reminderId, category));
        startRingingSound(soundFile);
        startVibration();

        timeoutHandler.removeCallbacks(timeoutRunnable);
        timeoutHandler.postDelayed(timeoutRunnable, RING_TIMEOUT_MS);

        return START_NOT_STICKY;
    }

    private Notification buildNotification(String title, String body, String reminderId, String category) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(CHANNEL_ID, "Alarm ringing", NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("Shown while a reminder alarm is actively ringing");
                // The channel itself stays silent — MediaPlayer below handles the
                // looping tone, so we don't want Android layering its own
                // one-shot channel sound on top of it.
                channel.setSound(null, null);
                channel.enableVibration(false);
                nm.createNotificationChannel(channel);
            }
        }

        Intent fullScreenIntent = new Intent(this, AlarmActivity.class);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("body", body);
        fullScreenIntent.putExtra("reminderId", reminderId);
        fullScreenIntent.putExtra("category", category);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, NOTIF_ID, fullScreenIntent, piFlags);

        Intent stopIntent = new Intent(this, AlarmRingService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, NOTIF_ID + 1, stopIntent, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_yoremind)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .addAction(0, "Dismiss", stopPendingIntent)
                .build();
    }

    private void startRingingSound(String soundFile) {
        try {
            int resId = getResources().getIdentifier(soundFile, "raw", getPackageName());
            if (resId == 0) resId = getResources().getIdentifier("alarm_classic", "raw", getPackageName());
            if (resId == 0) return; // no bundled tones — ring silently rather than crash

            mediaPlayer = MediaPlayer.create(this, resId);
            if (mediaPlayer == null) return;
            mediaPlayer.setLooping(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                mediaPlayer.setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build()
                );
            } else {
                mediaPlayer.setAudioStreamType(android.media.AudioManager.STREAM_ALARM);
            }
            // Belt-and-suspenders on top of setLooping(true): our bundled
            // tones are all under ~1.2s, and MediaPlayer's native loop flag
            // is known to silently stop looping short clips on a chunk of
            // real devices/decoders (plays once, goes quiet, throws no
            // error, nothing left to catch). An explicit completion
            // listener that manually rewinds and restarts guarantees the
            // alarm actually keeps ringing even where the flag alone fails.
            mediaPlayer.setOnCompletionListener(mp -> {
                try {
                    mp.seekTo(0);
                    mp.start();
                } catch (Exception ignored) {
                    // Player was mid-teardown (stopRinging() racing this
                    // callback) — nothing to restart.
                }
            });
            mediaPlayer.start();
        } catch (Exception e) {
            // A missing/corrupt sound file shouldn't stop the alarm from
            // showing and vibrating — degrade to silent + vibrate.
        }
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 800, 400, 800, 400};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "YoRemind:AlarmRingWakeLock"
        );
        wakeLock.acquire(RING_TIMEOUT_MS + 5000);
    }

    private void stopRinging() {
        timeoutHandler.removeCallbacks(timeoutRunnable);
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopRinging();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
