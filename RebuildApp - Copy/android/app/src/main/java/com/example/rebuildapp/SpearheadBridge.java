package com.example.rebuildapp;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * SPA ↔ native handshake (runtime readiness before NFC injection).
 */
@CapacitorPlugin(name = "SpearheadBridge")
public class SpearheadBridge extends Plugin {

    private static final String DIAG_TAG = "SPEARHEAD_NFC_DIAG";

    @PluginMethod
    public void notifyRuntimeReady(PluginCall call) {
        String runtimeId = call.getString("runtimeId", "(missing)");
        String href = call.getString("href", "(missing)");

        Log.i(DIAG_TAG, "phase=plugin_notify_runtime_ready_smoke_or_real runtime_id=" + runtimeId);

        Log.i(
            DIAG_TAG,
            "phase=plugin_notify_runtime_ready_called runtime_id="
                + runtimeId
                + " href="
                + href
                + " ts="
                + System.currentTimeMillis()
        );

        if (getActivity() == null) {
            Log.w(DIAG_TAG, "phase=plugin_notify_runtime_ready_activity_null ts=" + System.currentTimeMillis());
        } else if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).onSpearheadRuntimeReady(runtimeId, href);
        }

        Log.i(DIAG_TAG, "phase=plugin_notify_runtime_ready_resolve ts=" + System.currentTimeMillis());

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
