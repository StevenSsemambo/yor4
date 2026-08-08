package dev.saymytech.yoremind;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlarmSchedulerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
