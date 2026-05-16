package com.aos.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * NFC transport is owned by {@link NativeNfcBridge}: <b>ReaderMode</b> (primary while resumed) +
 * <b>foreground dispatch</b> (fallback), same JS events.
 * NFC discovery intents are <b>not</b> forwarded to {@link BridgeActivity#onNewIntent} so no plugin
 * can re-open Android’s generic tag UI path.
 * <p>
 * Test matrix (hardware): blank NTAG215, fresh NDEF, corrupted tag, rapid taps, hold-to-phone,
 * fresh launch, resume from background, screen off/on, cold NFC launch, multiple tags, airplane/NFC toggles.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        NativeNfcBridge.onTrace(this, "onCreate_enter", null);
        super.onCreate(savedInstanceState);
        NativeNfcBridge.onActivityCreated(this);
        WebView.setWebContentsDebuggingEnabled(true);
        NativeNfcBridge.onTrace(this, "onCreate_exit", null);
    }

    @Override
    protected void onStart() {
        NativeNfcBridge.onTrace(this, "onStart_enter", null);
        super.onStart();
        NativeNfcBridge.onStart(this);
        NativeNfcBridge.onTrace(this, "onStart_exit", null);
    }

    /**
     * Foreground dispatch is registered <em>before</em> {@code super.onResume()} so capture is active
     * as early as possible relative to the Capacitor bridge resume pipeline.
     */
    @Override
    protected void onResume() {
        NativeNfcBridge.onTrace(this, "onResume_enter_pre_super", null);
        NativeNfcBridge.enableForegroundDispatchBeforeBridgeResume(this);
        super.onResume();
        NativeNfcBridge.onResumeAfterBridge(this);
        NativeNfcBridge.onTrace(this, "onResume_exit", "fd_active_probe=see_NFC_CAPTURE_logs");
    }

    @Override
    protected void onPause() {
        NativeNfcBridge.onTrace(this, "onPause_enter_pre_super", null);
        NativeNfcBridge.disableReaderModeOnPause(this);
        NativeNfcBridge.disableForegroundDispatchOnPause(this);
        super.onPause();
        NativeNfcBridge.onTrace(this, "onPause_exit", null);
    }

    /**
     * {@link #setIntent} first, then native transport. NFC intents do not call {@code super.onNewIntent}
     * so the bridge/plugin layer never observes raw tag intents (prevents duplicate + OS UI races).
     */
    @Override
    protected void onNewIntent(Intent intent) {
        NativeNfcBridge.onTrace(this, "onNewIntent_enter", intent != null ? intent.getAction() : null);
        setIntent(intent);
        if (intent != null && NativeNfcBridge.isNfcTagIntent(intent)) {
            NativeNfcBridge.handleNfcNewIntent(this, intent);
            NativeNfcBridge.onTrace(this, "onNewIntent_nfc_handled_skip_super", intent.getAction());
            return;
        }
        super.onNewIntent(intent);
    }
}
