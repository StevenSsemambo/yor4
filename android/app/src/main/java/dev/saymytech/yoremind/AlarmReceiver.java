package dev.saymytech.yoremind;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Woken directly by AlarmManager at the exact moment a reminder is due —
 * this runs even if the app process was killed and the phone is asleep,
 * because AlarmManager (via setAlarmClock, see AlarmSchedulerPlugin)
 * wakes the device and starts this receiver itself. A BroadcastReceiver
 * only gets a few seconds of guaranteed run time, so all it does is hand
 * off to AlarmRingService, which does the actual ringing / full-screen
 * work in a proper foreground service.
 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent serviceIntent = new Intent(context, AlarmRingService.class);
        serviceIntent.putExtras(intent);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
