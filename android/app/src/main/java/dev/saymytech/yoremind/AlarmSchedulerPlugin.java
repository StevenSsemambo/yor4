package dev.saymytech.yoremind;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS-callable bridge onto AlarmManager.setAlarmClock() — the same
 * delivery guarantee the phone's own Clock app gets (exempt from Doze /
 * app-standby deferral), which @capacitor/local-notifications' own
 * scheduling doesn't use. Paired with AlarmReceiver -> AlarmRingService
 * -> AlarmActivity, this is what actually rings and wakes the screen
 * with the app closed; see src/services/nativeAlarm.js for the JS side.
 */
@CapacitorPlugin(name = "AlarmScheduler")
public class AlarmSchedulerPlugin extends Plugin {

    private PendingIntent buildPendingIntent(int id, String title, String body, String soundFile, String reminderId, String category) {
        Intent intent = new Intent(getContext(), AlarmReceiver.class);
        intent.putExtra("notifId", id);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("soundFile", soundFile);
        intent.putExtra("reminderId", reminderId);
        intent.putExtra("category", category);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(getContext(), id, intent, flags);
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Integer id = readInt(call, "id");
        // "at" arrives as a string (see nativeAlarm.js) — a 13-digit millisecond
        // timestamp overflows a 32-bit int and Android's JSON layer stores it as
        // a Long, which call.getDouble() doesn't reliably recognize, so it was
        // coming through as silently missing. Read it as a string and parse
        // manually instead, with a numeric fallback just in case.
        Long atMillis = null;
        String atStr = call.getString("at");
        if (atStr != null) {
            try {
                atMillis = Long.parseLong(atStr);
            } catch (NumberFormatException ignored) { /* fall through to numeric fallback */ }
        }
        if (atMillis == null) {
            Double atDouble = call.getDouble("at");
            if (atDouble != null) atMillis = atDouble.longValue();
        }
        if (id == null || atMillis == null) {
            call.reject("Missing 'id' or 'at'");
            return;
        }
        String title = call.getString("title", "Reminder due");
        String body = call.getString("body", "");
        String soundFile = call.getString("soundFile", "alarm_classic");
        String reminderId = call.getString("reminderId", "");
        String category = call.getString("category", "");

        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("AlarmManager unavailable on this device");
            return;
        }

        PendingIntent pendingIntent = buildPendingIntent(id, title, body, soundFile, reminderId, category);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(atMillis, pendingIntent);
                alarmManager.setAlarmClock(info, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, atMillis, pendingIntent);
            }
        } catch (SecurityException e) {
            call.reject("Exact-alarm permission not granted: " + e.getMessage());
            return;
        }

        JSObject ret = new JSObject();
        ret.put("scheduled", true);
        call.resolve(ret);
    }

    /** Reads an int robustly regardless of which numeric type Android's JSON
     *  layer happened to box the JS number as (Integer/Long/Double all show
     *  up depending on magnitude) — the same class of bridge quirk that
     *  broke "at" above, worth guarding against everywhere an id crosses in. */
    private Integer readInt(PluginCall call, String key) {
        Integer direct = call.getInt(key);
        if (direct != null) return direct;
        Double asDouble = call.getDouble(key);
        if (asDouble != null) return asDouble.intValue();
        String asString = call.getString(key);
        if (asString != null) {
            try { return Integer.parseInt(asString); } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Integer id = readInt(call, "id");
        if (id == null) {
            call.reject("Missing 'id'");
            return;
        }
        PendingIntent pendingIntent = buildPendingIntent(id, null, null, null, null, null);
        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) alarmManager.cancel(pendingIntent);
        pendingIntent.cancel();
        call.resolve();
    }

    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(AlarmActivity.PREFS_NAME, Context.MODE_PRIVATE);
        String reminderId = prefs.getString("pending_reminder_id", null);
        String action = prefs.getString("pending_action", null);
        JSObject ret = new JSObject();
        if (reminderId != null && action != null) {
            ret.put("reminderId", reminderId);
            ret.put("action", action);
            prefs.edit().remove("pending_reminder_id").remove("pending_action").apply();
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void canUseFullScreenIntent(PluginCall call) {
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= 34) {
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            allowed = nm != null && nm.canUseFullScreenIntent();
        }
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) {
            Intent intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
            } catch (Exception ignored) { /* not all OEMs expose this screen */ }
        }
        call.resolve();
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoring);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
            } catch (Exception ignored) { /* OEM doesn't expose either screen */ }
        }
        call.resolve();
    }
}
