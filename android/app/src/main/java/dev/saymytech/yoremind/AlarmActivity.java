package dev.saymytech.yoremind;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

/**
 * Full-screen native alarm UI — launched by AlarmRingService's
 * full-screen-intent notification, so it can appear over the lock
 * screen and turn the display on, the same way the phone's own Clock
 * app does. Deliberately plain native Android (not the React app) so it
 * shows up reliably even if the webview hasn't booted yet.
 *
 * "Mark done" / "Snooze 1h" don't touch the reminder data directly —
 * that lives in the webview's IndexedDB, which only the JS layer can
 * write to. Instead this stores the intended action in SharedPreferences
 * and opens MainActivity; nativeAlarm.js's consumePendingAlarmAction()
 * (polled from App.jsx) picks it up and calls the existing api.updateStatus
 * / api.snooze the moment the app is running, so there's exactly one
 * place that actually mutates a reminder.
 */
public class AlarmActivity extends Activity {

    public static final String PREFS_NAME = "yoremind_alarm";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_alarm);
        bindReminder(getIntent());
    }

    // AlarmActivity is launchMode="singleInstance", and it's now launched
    // from two places for the same alarm (AlarmReceiver directly, and the
    // ring service's full-screen-intent notification as a fallback) — the
    // second launch reuses the existing instance and delivers here instead
    // of onCreate(), so the screen needs to (re)bind from whichever intent
    // arrives, not just the first one.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bindReminder(intent);
    }

    private void bindReminder(Intent intent) {
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String category = intent.getStringExtra("category");
        final String reminderId = intent.getStringExtra("reminderId");

        TextView categoryView = findViewById(R.id.alarm_category);
        TextView titleView = findViewById(R.id.alarm_title);
        TextView bodyView = findViewById(R.id.alarm_body);
        Button doneBtn = findViewById(R.id.alarm_btn_done);
        Button snoozeBtn = findViewById(R.id.alarm_btn_snooze);
        Button dismissBtn = findViewById(R.id.alarm_btn_dismiss);

        if (categoryView != null) categoryView.setText(category != null ? category : "REMINDER");
        if (titleView != null) titleView.setText(title != null ? title : "Reminder");
        if (bodyView != null) bodyView.setText(body != null ? body : "");

        doneBtn.setOnClickListener(v -> finishWithAction(reminderId, "done"));
        snoozeBtn.setOnClickListener(v -> finishWithAction(reminderId, "snooze"));
        dismissBtn.setOnClickListener(v -> finishWithoutAction());
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            // Pre-API-27 fallback — same effect via window flags.
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
    }

    private void stopRingService() {
        Intent stop = new Intent(this, AlarmRingService.class);
        stop.setAction(AlarmRingService.ACTION_STOP);
        startService(stop);
    }

    private void finishWithAction(String reminderId, String action) {
        stopRingService();
        if (reminderId != null) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit()
                    .putString("pending_reminder_id", reminderId)
                    .putString("pending_action", action)
                    .apply();
        }
        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(launch);
        finish();
    }

    private void finishWithoutAction() {
        stopRingService();
        finish();
    }

    @Override
    public void onBackPressed() {
        // Swallow back-press — an alarm shouldn't be dismissible by
        // accidentally brushing the back gesture; require a tap on one
        // of the actual buttons.
    }
}
