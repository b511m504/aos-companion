package com.example.rebuildapp;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;
import androidx.core.content.IntentCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginMethodHandle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * NFC foreground dispatch + Capacitor window events. Logs use prefix SPEARHEAD_NFC for adb grep.
 */
public class MainActivity extends BridgeActivity {
    private static final String LOG_TAG = "SPEARHEAD_NFC";

    /** Matches {@code @capacitor/android} in {@code RebuildApp/package.json} (diagnostic only). */
    private static final String SPEARHEAD_EXPECTED_CAPACITOR_ANDROID = "8.3.1";

    /** Grep: adb logcat -s SPEARHEAD_NFC_DIAG */
    private static final String DIAG_TAG = "SPEARHEAD_NFC_DIAG";

    /** Grep: adb logcat -s SPEARHEAD_WEBVIEW_CONTEXT */
    private static final String WEBVIEW_CTX_TAG = "SPEARHEAD_WEBVIEW_CONTEXT";

    /**
     * Temporary: pass null tech lists to foreground dispatch so every tag can surface TECH/TAG intents.
     * Helps distinguish OS tech mismatch (no intent when false) vs bridge issues (intent when true).
     * Remove after field diagnosis.
     */
    private static final boolean TEMP_DIAG_RELAX_FOREGROUND_TECH_FILTERS = true;

    /**
     * Temporary: {@link #enableForegroundDispatch} registers only ACTION_TAG_DISCOVERED.
     * Pair with TECH_DISCOVERED commented out in AndroidManifest.xml for cold-launch triage.
     * Revert after diagnosis.
     */
    private static final boolean TEMP_DIAG_FOREGROUND_TAG_DISCOVERED_ONLY = true;

    /** Dedupe rapid duplicate dispatches (many readers fire twice). */
    private static final long DEDUP_MS = 420;

    private NfcAdapter nfcAdapter;
    private PendingIntent pendingIntent;
    private IntentFilter[] intentFiltersArray;
    private String[][] techListsArray;

    private String lastDedupeTag = "";
    private long lastDedupeAt = 0;

    /** Latest NFC payload not yet delivered (bridge or WebView not ready while SPA runtime ready). */
    private String pendingNfcPayloadJson;

    /** SPA has called {@link SpearheadBridge#notifyRuntimeReady} — unblock native NFC injection. */
    private volatile boolean spearheadRuntimeReady = false;

    /** Set on main thread when {@link #spearheadRuntimeReady} first becomes true (diagnostic). */
    private volatile long runtimeReadyConfirmedAt = 0L;

    /** NFC payloads held until {@link #spearheadRuntimeReady}; flushed when JS confirms readiness. */
    private final List<String> pendingNfcPayloads = new ArrayList<>();

    /** Collapse multiple flush schedules from rapid lifecycle callbacks into one runnable. */
    private final Handler nfcFlushHandler = new Handler(Looper.getMainLooper());
    private final Runnable nfcFlushRunnable = this::flushPendingNfcToBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        spearheadRuntimeReady = false;
        runtimeReadyConfirmedAt = 0L;
        pendingNfcPayloads.clear();
        pendingNfcPayloadJson = null;
        /*
         * Capacitor 8 {@link BridgeActivity}: {@code registerPlugin} mutates {@code bridgeBuilder} before
         * {@code super.onCreate} runs {@code PluginManager} + {@code load()} + {@link Bridge#create()}.
         * App-local Java plugins are not listed in {@code capacitor.plugins.json} (CLI only scans npm packages);
         * manual registration here is the supported path.
         */
        logDiagCapacitorPluginRegistry("onCreate_before_super");
        registerPlugin(SpearheadBridge.class);
        logDiagCapacitorPluginRegistry("onCreate_after_registerPlugin_before_super");
        super.onCreate(savedInstanceState);
        logDiagCapacitorPluginsJsonAsset();
        logDiagCapacitorFrameworkVersion();
        logDiagCapacitorPluginRegistry("onCreate_after_super");
        Log.d(LOG_TAG, "SPEARHEAD_NFC lifecycle=on_create");
        Log.i(DIAG_TAG, "phase=lifecycle_onCreate ts=" + System.currentTimeMillis());
        initNfcAdapterAndFilters();
        logDiagNfcEnvironment("onCreate_post_init");
        logDiagManifestTechFilterOnce();
        handleNfcIntent(getIntent());
        sendMainActivityAliveEvent("ON_CREATE");
        scheduleFlushPendingNfc(120);
        resolveActiveWebViewForNfc("lifecycle_onCreate_post");
    }

    /**
     * Called from {@link SpearheadBridge#notifyRuntimeReady} when the bundled JS app is ready to receive NFC.
     */
    public void onSpearheadRuntimeReady(String runtimeId, String href) {
        Log.i(DIAG_TAG, "phase=runtime_ready_callback_enter runtime_id=" + runtimeId + " ts=" + System.currentTimeMillis());
        runOnUiThread(
            () -> {
                spearheadRuntimeReady = true;
                runtimeReadyConfirmedAt = System.currentTimeMillis();
                Log.i(DIAG_TAG, "phase=runtime_ready_state_true ts=" + System.currentTimeMillis());
                Log.i(
                    DIAG_TAG,
                    "phase=runtime_ready_native_state runtimeReadyConfirmedAt="
                        + runtimeReadyConfirmedAt
                );
                Log.i(
                    DIAG_TAG,
                    "phase=runtime_ready_confirmed runtime_id="
                        + runtimeId
                        + " href="
                        + href
                        + " pending_count="
                        + pendingNfcPayloads.size()
                        + " ts="
                        + System.currentTimeMillis()
                );
                flushPendingNfcToBridge();
            });
    }

    /**
     * Resolve Capacitor {@link Bridge} at call time — avoids stale references after WebView recreate / reload.
     */
    private Bridge getCapacitorBridgeNow() {
        try {
            Bridge b = getBridge();
            if (b != null) {
                return b;
            }
        } catch (Throwable ignored) {
            // Fallback for Capacitor versions without public getBridge()
        }
        return bridge;
    }

    /**
     * Packaged asset written by {@code npx cap sync} — npm Capacitor plugins only; app-local classes use
     * {@link #registerPlugin(Class)} and do not appear here.
     */
    private void logDiagCapacitorPluginsJsonAsset() {
        try (InputStream is = getAssets().open("capacitor.plugins.json");
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            String body = sb.toString();
            if (body.length() > 2400) {
                body = body.substring(0, 2400) + "...(truncated)";
            }
            Log.i(DIAG_TAG, "phase=capacitor_plugins_json_asset chars=" + sb.length() + " body=" + body);
        } catch (Throwable t) {
            Log.e(DIAG_TAG, "phase=capacitor_plugins_json_asset_read_err", t);
        }
    }

    private void logDiagCapacitorFrameworkVersion() {
        Log.i(
            DIAG_TAG,
            "phase=bridge_diag_framework Bridge_class="
                + Bridge.class.getName()
                + " expected_dependency_capacitor_android="
                + SPEARHEAD_EXPECTED_CAPACITOR_ANDROID
                + " Bridge_pkg="
                + (Bridge.class.getPackage() != null ? Bridge.class.getPackage().toString() : "(null)")
        );
    }

    /**
     * Native Capacitor plugin registry: Capacitor 8 {@link Bridge} exposes {@link Bridge#getPlugin(String)}; it does
     * not provide {@code getPlugins()}. Optional reflection dumps private {@code plugins} map for adb parity with
     * older diagnostic expectations.
     */
    private void logDiagCapacitorPluginRegistry(String hook) {
        try {
            Bridge b = getCapacitorBridgeNow();
            if (b == null) {
                Log.i(
                    DIAG_TAG,
                    "phase=bridge_registry_diag hook=" + hook + " bridge=null (expected before_super until load completes)"
                );
                return;
            }
            PluginHandle spearhead = b.getPlugin("SpearheadBridge");
            Log.i(
                DIAG_TAG,
                "phase=bridge_registry_spearhead exists="
                    + (spearhead != null)
                    + " hook="
                    + hook
                    + " handle_class="
                    + (spearhead != null ? spearhead.getClass().getName() : "(n/a)")
            );
            if (spearhead != null) {
                StringBuilder methods = new StringBuilder();
                for (PluginMethodHandle mh : spearhead.getMethods()) {
                    if (methods.length() > 0) methods.append(',');
                    methods.append(mh.getName());
                }
                Log.i(
                    DIAG_TAG,
                    "phase=bridge_registry_spearhead_detail plugin_id="
                        + spearhead.getId()
                        + " native_class="
                        + spearhead.getPluginClass().getName()
                        + " exported_methods="
                        + methods
                );
            }
            logDiagBridgePluginMapReflection(b, hook);
        } catch (Throwable t) {
            Log.e(DIAG_TAG, "phase=bridge_registry_check_err hook=" + hook, t);
        }
    }

    @SuppressWarnings("unchecked")
    private void logDiagBridgePluginMapReflection(Bridge b, String hook) {
        try {
            Field f = Bridge.class.getDeclaredField("plugins");
            f.setAccessible(true);
            Object raw = f.get(b);
            if (!(raw instanceof Map)) {
                Log.w(
                    DIAG_TAG,
                    "phase=bridge_registry_reflect_map unexpected_type="
                        + (raw == null ? "null" : raw.getClass().getName())
                        + " hook="
                        + hook
                );
                return;
            }
            Map<String, PluginHandle> map = (Map<String, PluginHandle>) raw;
            Log.i(DIAG_TAG, "phase=bridge_registry_reflect_plugin_ids hook=" + hook + " ids=" + map.keySet());
            StringBuilder classes = new StringBuilder();
            for (Map.Entry<String, PluginHandle> e : map.entrySet()) {
                if (classes.length() > 0) classes.append(" | ");
                classes.append(e.getKey()).append("=").append(e.getValue().getPluginClass().getName());
                if (classes.length() > 3500) {
                    classes.append(" ...(truncated)");
                    break;
                }
            }
            Log.i(DIAG_TAG, "phase=bridge_registry_reflect_id_to_class hook=" + hook + " " + classes);
        } catch (NoSuchFieldException e) {
            Log.w(DIAG_TAG, "phase=bridge_registry_reflect_no_plugins_field hook=" + hook + " msg=" + e.getMessage());
        } catch (Throwable t) {
            Log.w(DIAG_TAG, "phase=bridge_registry_reflect_err hook=" + hook, t);
        }
    }

    private static String safeOneLineLog(String s) {
        if (s == null) {
            return "(null)";
        }
        return s.replace('\n', ' ').replace('\r', ' ').trim();
    }

    private void logSpearheadWebViewContext(WebView webView, String hook) {
        if (webView == null) {
            Log.i(WEBVIEW_CTX_TAG, "phase=webview_snapshot hook=" + hook + " webview=null ts=" + System.currentTimeMillis());
            return;
        }
        CharSequence rawTitle = webView.getTitle();
        String title = rawTitle != null ? rawTitle.toString() : "(null)";
        if (title.length() > 160) {
            title = title.substring(0, 160) + "…";
        }
        Log.i(
            WEBVIEW_CTX_TAG,
            "phase=webview_snapshot hook="
                + hook
                + " hashCode="
                + webView.hashCode()
                + " url="
                + safeOneLineLog(webView.getUrl())
                + " title="
                + safeOneLineLog(title)
                + " isAttachedToWindow="
                + webView.isAttachedToWindow()
                + " hasWindowFocus="
                + webView.hasWindowFocus()
                + " bridgeIdentity="
                + System.identityHashCode(getCapacitorBridgeNow())
                + " ts="
                + System.currentTimeMillis()
        );
    }

    /**
     * Current active WebView for JS delivery — never use a cached field across lifecycle.
     */
    private WebView resolveActiveWebViewForNfc(String hook) {
        Bridge b = getCapacitorBridgeNow();
        if (b == null) {
            Log.i(WEBVIEW_CTX_TAG, "phase=resolve_webview bridge=null hook=" + hook + " ts=" + System.currentTimeMillis());
            return null;
        }
        WebView w = b.getWebView();
        logSpearheadWebViewContext(w, hook);
        return w;
    }

    private void initNfcAdapterAndFilters() {
        nfcAdapter = NfcAdapter.getDefaultAdapter(this);
        if (nfcAdapter == null) {
            Log.w(LOG_TAG, "SPEARHEAD_NFC adapter=nfc_unavailable");
        } else {
            Log.d(LOG_TAG, "SPEARHEAD_NFC adapter=present enabled=" + nfcAdapter.isEnabled());
        }

        Intent intent = new Intent(this, getClass()).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE;
        pendingIntent = PendingIntent.getActivity(this, 0, intent, piFlags);

        IntentFilter tagDiscovered = new IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED);
        if (TEMP_DIAG_FOREGROUND_TAG_DISCOVERED_ONLY) {
            intentFiltersArray = new IntentFilter[]{tagDiscovered};
            Log.i(DIAG_TAG, "TEMP foreground_intent_filters=TAG_DISCOVERED_only count=1");
        } else {
            IntentFilter techDiscovered = new IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED);
            IntentFilter ndefDiscovered = new IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED);
            try {
                ndefDiscovered.addDataType("*/*");
            } catch (IntentFilter.MalformedMimeTypeException e) {
                Log.w(LOG_TAG, "SPEARHEAD_NFC filter_error=mime msg=" + e.getMessage());
            }
            intentFiltersArray = new IntentFilter[]{ndefDiscovered, techDiscovered, tagDiscovered};
        }

        // Valid android.nfc.tech.* classes only — Tag.class is NOT a tech and breaks matching.
        techListsArray = new String[][]{
            new String[]{android.nfc.tech.IsoDep.class.getName()},
            new String[]{android.nfc.tech.NfcA.class.getName()},
            new String[]{android.nfc.tech.NfcB.class.getName()},
            new String[]{android.nfc.tech.NfcF.class.getName()},
            new String[]{android.nfc.tech.NfcV.class.getName()},
            new String[]{android.nfc.tech.MifareClassic.class.getName()},
            new String[]{android.nfc.tech.MifareUltralight.class.getName()},
            new String[]{android.nfc.tech.Ndef.class.getName()},
            new String[]{android.nfc.tech.NdefFormatable.class.getName()},
        };
    }

    /** Manifest NFC intent filters — TECH_DISCOVERED may be commented out during TEMP diag (see manifest). */
    private void logDiagManifestTechFilterOnce() {
        Log.i(
            DIAG_TAG,
            "manifest_note=nfc_tech_filter.xml applies_when_TECH_DISCOVERED_intent_filter_present "
                + "TEMP_manifest_TAG_only_mode=" + TEMP_DIAG_FOREGROUND_TAG_DISCOVERED_ONLY
                + " (if true, TECH_DISCOVERED block should be commented in AndroidManifest for cold-launch test)"
        );
    }

    private static String launchModeLabel(int mode) {
        switch (mode) {
            case ActivityInfo.LAUNCH_MULTIPLE:
                return "standard";
            case ActivityInfo.LAUNCH_SINGLE_TOP:
                return "singleTop";
            case ActivityInfo.LAUNCH_SINGLE_TASK:
                return "singleTask";
            case ActivityInfo.LAUNCH_SINGLE_INSTANCE:
                return "singleInstance";
            default:
                return "unknown";
        }
    }

    /**
     * Adapter + hardware + activity registration snapshot (classify A adapter off, B no detection,
     * C manifest mismatch vs intents never arriving).
     */
    private void logDiagNfcEnvironment(String hook) {
        long ts = System.currentTimeMillis();
        PackageManager pm = getPackageManager();
        boolean supportsNfc = pm.hasSystemFeature(PackageManager.FEATURE_NFC);
        boolean adapterPresent = nfcAdapter != null;
        boolean adapterEnabled = adapterPresent && nfcAdapter.isEnabled();
        String launchInfo = "unspecified";
        try {
            ActivityInfo ai = pm.getActivityInfo(getComponentName(), PackageManager.GET_META_DATA);
            launchInfo = launchModeLabel(ai.launchMode) + "(" + ai.launchMode + ")";
        } catch (Exception e) {
            launchInfo = "read_error:" + e.getMessage();
        }
        Log.i(
            DIAG_TAG,
            "phase=nfc_environment hook=" + hook
                + " adapter_present=" + adapterPresent
                + " adapter_enabled=" + adapterEnabled
                + " device_supports_nfc_feature=" + supportsNfc
                + " activity_launchMode=" + launchInfo
                + " ts=" + ts
        );
    }

    private void logDiagBeforeForegroundDispatch(String[][] techsForDispatch) {
        String techMode =
            techsForDispatch == null ? "tech_lists_null_match_all" : ("tech_lists_populated_rows=" + techListsArray.length);
        Log.i(
            DIAG_TAG,
            "phase=before_enable_foreground_dispatch"
                + " pending_intent_target_class=" + getClass().getName()
                + " pending_intent_flags=FLAG_ACTIVITY_SINGLE_TOP"
                + " intent_filter_count=" + intentFiltersArray.length
                + " " + techMode
                + " relaxed_null_tech=" + TEMP_DIAG_RELAX_FOREGROUND_TECH_FILTERS
                + " tag_discovered_only_filters=" + TEMP_DIAG_FOREGROUND_TAG_DISCOVERED_ONLY
                + " ts=" + System.currentTimeMillis()
        );
    }

    /**
     * First-line tracing: any NFC intent that reaches the activity, before dedupe/JSON/bridge.
     * Helps separate A) no OS intent B) intent shape C) bridge vs D) JS/store (use WebView logs).
     */
    private void logDiagNfcIntentRaw(Intent intent, String action) {
        if (action == null || !action.startsWith("android.nfc.action.")) {
            return;
        }
        long ts = System.currentTimeMillis();
        int uidBytes = -1;
        int tagIdHexLen = 0;
        int techCount = 0;
        String techPreview = "";
        String pathHint = "nfc_other";
        if (NfcAdapter.ACTION_TECH_DISCOVERED.equals(action)) {
            pathHint = "TECH_DISCOVERED foreground_or_manifest_tech_path";
        } else if (NfcAdapter.ACTION_TAG_DISCOVERED.equals(action)) {
            pathHint = "TAG_DISCOVERED tag_level_fallback_path";
        } else if (NfcAdapter.ACTION_NDEF_DISCOVERED.equals(action)) {
            pathHint = "NDEF_DISCOVERED mime_path";
        }

        try {
            Tag tag = IntentCompat.getParcelableExtra(intent, NfcAdapter.EXTRA_TAG, Tag.class);
            if (tag != null) {
                byte[] idBytes = tag.getId();
                if (idBytes != null) {
                    uidBytes = idBytes.length;
                    tagIdHexLen = idBytes.length * 2;
                }
                String[] tl = tag.getTechList();
                if (tl != null) {
                    techCount = tl.length;
                    if (tl.length > 0) {
                        techPreview = tl[0];
                        if (tl.length > 1) {
                            techPreview += ",+" + (tl.length - 1);
                        }
                    }
                }
            }
        } catch (Throwable t) {
            Log.i(DIAG_TAG, "phase=intent_received_parse_error msg=" + t.getMessage() + " ts=" + ts);
            return;
        }

        Log.i(
            DIAG_TAG,
            "phase=intent_received action=" + action
                + " tag_uid_bytes=" + uidBytes
                + " tag_id_hex_len=" + tagIdHexLen
                + " tech_count=" + techCount
                + " tech_preview=" + techPreview
                + " path_hint=" + pathHint
                + " ts=" + ts
        );
    }

    @Override
    public void onResume() {
        super.onResume();
        Bridge bResume = getCapacitorBridgeNow();
        WebView wResume = bResume != null ? bResume.getWebView() : null;
        Log.i(
            DIAG_TAG,
            "phase=webview_resume_context url=" + (wResume != null ? safeOneLineLog(wResume.getUrl()) : "null")
                + " ts="
                + System.currentTimeMillis()
        );
        logDiagCapacitorPluginRegistry("onResume");
        Log.d(LOG_TAG, "SPEARHEAD_NFC lifecycle=on_resume");
        Log.i(DIAG_TAG, "phase=lifecycle_onResume ts=" + System.currentTimeMillis());
        logDiagNfcEnvironment("onResume_pre_foreground_dispatch");
        resolveActiveWebViewForNfc("lifecycle_onResume_refresh");
        enableForegroundDispatch();
        handleNfcIntent(getIntent());
        sendMainActivityAliveEvent("ON_RESUME");
        scheduleFlushPendingNfc(0);
    }

    @Override
    public void onPause() {
        super.onPause();
        Log.i(DIAG_TAG, "phase=lifecycle_onPause ts=" + System.currentTimeMillis());
        disableForegroundDispatch();
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Log.d(LOG_TAG, "SPEARHEAD_NFC lifecycle=on_new_intent");
        Log.i(DIAG_TAG, "phase=lifecycle_onNewIntent ts=" + System.currentTimeMillis());
        resolveActiveWebViewForNfc("lifecycle_onNewIntent_refresh");
        Log.i(DIAG_TAG, "phase=intent_delivery route=on_new_intent action=" + (intent != null ? intent.getAction() : "null"));
        handleNfcIntent(intent);
        scheduleFlushPendingNfc(0);
    }

    private void scheduleFlushPendingNfc(long delayMs) {
        nfcFlushHandler.removeCallbacks(nfcFlushRunnable);
        long d = Math.max(0, delayMs);
        if (d == 0) {
            nfcFlushHandler.post(nfcFlushRunnable);
        } else {
            nfcFlushHandler.postDelayed(nfcFlushRunnable, d);
        }
    }

    /**
     * Clear sticky NFC intent so {@link #onResume} does not re-dispatch the same discovery
     * after background/foreground (verified lifecycle failure mode on singleTask activities).
     */
    private void consumeHandledNfcIntent() {
        Intent neutral = new Intent(this, getClass());
        neutral.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        setIntent(neutral);
        Log.d(LOG_TAG, "SPEARHEAD_NFC intent_consumed=1");
    }

    private void enableForegroundDispatch() {
        if (nfcAdapter == null) {
            Log.w(LOG_TAG, "SPEARHEAD_NFC foreground_dispatch=skipped reason=no_adapter");
            Log.i(DIAG_TAG, "phase=foreground_dispatch_attempted ok=false reason=no_adapter ts=" + System.currentTimeMillis());
            return;
        }
        if (!nfcAdapter.isEnabled()) {
            Log.w(LOG_TAG, "SPEARHEAD_NFC foreground_dispatch=skipped reason=nfc_disabled");
            Log.i(DIAG_TAG, "phase=foreground_dispatch_attempted ok=false reason=nfc_disabled ts=" + System.currentTimeMillis());
            return;
        }
        try {
            String[][] techsForDispatch = TEMP_DIAG_RELAX_FOREGROUND_TECH_FILTERS ? null : techListsArray;
            logDiagBeforeForegroundDispatch(techsForDispatch);
            nfcAdapter.enableForegroundDispatch(this, pendingIntent, intentFiltersArray, techsForDispatch);
            Log.d(LOG_TAG, "SPEARHEAD_NFC foreground_dispatch=enabled");
            Log.i(DIAG_TAG, "phase=foreground_dispatch_attempted ok=true ts=" + System.currentTimeMillis());
            Log.i(
                DIAG_TAG,
                "phase=foreground_dispatch_registered relaxed_all_tech="
                    + TEMP_DIAG_RELAX_FOREGROUND_TECH_FILTERS
                    + " filter_count=" + intentFiltersArray.length
                    + " tech_matrix_rows="
                    + (techsForDispatch == null ? "null_match_all" : String.valueOf(techListsArray.length))
                    + " (null tech list = OS accepts any tag technology for these filters)"
            );
        } catch (Exception e) {
            Log.e(LOG_TAG, "SPEARHEAD_NFC foreground_dispatch=failed msg=" + e.getMessage());
            Log.i(
                DIAG_TAG,
                "phase=foreground_dispatch_attempted ok=false reason=exception msg=" + e.getMessage()
                    + " ts=" + System.currentTimeMillis()
            );
            Log.i(DIAG_TAG, "phase=foreground_dispatch_register_failed msg=" + e.getMessage());
        }
    }

    private void disableForegroundDispatch() {
        if (nfcAdapter == null) return;
        try {
            nfcAdapter.disableForegroundDispatch(this);
            Log.d(LOG_TAG, "SPEARHEAD_NFC foreground_dispatch=disabled");
        } catch (Exception e) {
            Log.e(LOG_TAG, "SPEARHEAD_NFC foreground_dispatch_disable_failed msg=" + e.getMessage());
        }
    }

    private boolean shouldDedupe(String tagId) {
        if (tagId == null || tagId.isEmpty()) return false;
        long now = System.currentTimeMillis();
        if (tagId.equals(lastDedupeTag) && (now - lastDedupeAt) < DEDUP_MS) {
            Log.d(LOG_TAG, "SPEARHEAD_NFC dedupe=skip tagId=" + tagId);
            return true;
        }
        lastDedupeTag = tagId;
        lastDedupeAt = now;
        return false;
    }

    private void handleNfcIntent(Intent intent) {
        if (intent == null) {
            Log.d(LOG_TAG, "SPEARHEAD_NFC intent=null");
            Log.i(DIAG_TAG, "phase=intent_null ts=" + System.currentTimeMillis());
            return;
        }
        String action = intent.getAction();
        Log.d(LOG_TAG, "SPEARHEAD_NFC intent_action=" + (action != null ? action : "null"));
        logDiagNfcIntentRaw(intent, action);
        if (action == null) return;
        if (!action.startsWith("android.nfc.action.")) return;

        boolean nfcDisabled = nfcAdapter != null && !nfcAdapter.isEnabled();
        if (nfcDisabled) {
            Log.w(LOG_TAG, "SPEARHEAD_NFC error=nfc_disabled");
        }

        String tagId = "";
        JSONArray techJson = new JSONArray();
        try {
            Tag tag = IntentCompat.getParcelableExtra(intent, NfcAdapter.EXTRA_TAG, Tag.class);
            if (tag != null) {
                byte[] idBytes = tag.getId();
                if (idBytes != null && idBytes.length > 0) {
                    StringBuilder sb = new StringBuilder();
                    for (byte b : idBytes) sb.append(String.format("%02X", b));
                    tagId = sb.toString();
                    Log.d(LOG_TAG, "SPEARHEAD_NFC raw_tag_id=" + tagId);
                } else {
                    Log.w(LOG_TAG, "SPEARHEAD_NFC raw_tag_id=empty (tag without hardware uid)");
                }
                String[] techList = tag.getTechList();
                if (techList != null) {
                    for (String t : techList) techJson.put(t);
                }
                Log.d(LOG_TAG, "SPEARHEAD_NFC raw_tag_tech=" + Arrays.toString(techList));
            } else {
                Log.w(LOG_TAG, "SPEARHEAD_NFC tag_extra=null");
            }
        } catch (Exception e) {
            Log.e(LOG_TAG, "SPEARHEAD_NFC tag_parse_error msg=" + e.getMessage());
        }

        if (tagId.isEmpty() && !nfcDisabled) {
            Log.w(LOG_TAG, "SPEARHEAD_NFC skip_dispatch reason=no_tag_uid");
        }

        if (!tagId.isEmpty() && shouldDedupe(tagId)) {
            Log.i(DIAG_TAG, "phase=dedupe_skip_same_tag ts=" + System.currentTimeMillis());
            consumeHandledNfcIntent();
            return;
        }

        JSONObject json = new JSONObject();
        try {
            json.put("action", action);
            json.put("tagId", tagId);
            json.put("techList", techJson);
            json.put("nfcDisabled", nfcDisabled);
            if (nfcDisabled) json.put("nfcError", "nfc_disabled");
            if (tagId.isEmpty() && !nfcDisabled) json.put("nfcError", "no_tag_uid");
        } catch (Exception e) {
            Log.e(LOG_TAG, "SPEARHEAD_NFC json_build_error msg=" + e.getMessage());
            Log.i(DIAG_TAG, "phase=json_build_abort msg=" + e.getMessage() + " ts=" + System.currentTimeMillis());
            consumeHandledNfcIntent();
            return;
        }

        String payload = json.toString();
        Log.d(LOG_TAG, "SPEARHEAD_NFC dispatch_prepare bytes=" + payload.getBytes(StandardCharsets.UTF_8).length);
        Log.i(DIAG_TAG, "phase=native_dispatch_commit action=" + action + " tag_id_hex_len=" + tagId.length() + " ts=" + System.currentTimeMillis());
        queueOrDeliverNfc(payload);
        consumeHandledNfcIntent();
    }

    private void queueOrDeliverNfc(String jsonPayload) {
        if (!spearheadRuntimeReady) {
            pendingNfcPayloads.add(jsonPayload);
            Log.i(
                DIAG_TAG,
                "phase=nfc_queued_waiting_for_runtime_ready pending_count="
                    + pendingNfcPayloads.size()
                    + " ts="
                    + System.currentTimeMillis()
            );
            return;
        }
        WebView w = resolveActiveWebViewForNfc("queueOrDeliverNfc");
        if (w == null) {
            pendingNfcPayloadJson = jsonPayload;
            Log.w(LOG_TAG, "SPEARHEAD_NFC bridge_queue=1 no_active_webview");
            Log.i(
                DIAG_TAG,
                "phase=bridge_deferred webview_or_bridge_not_ready bridge="
                    + (getCapacitorBridgeNow() != null)
                    + " ts="
                    + System.currentTimeMillis()
            );
            return;
        }
        deliverNfcToBridge(jsonPayload, w);
    }

    private void flushPendingNfcToBridge() {
        Log.i(
            DIAG_TAG,
            "phase=flush_pending_enter ready="
                + spearheadRuntimeReady
                + " pending_count="
                + pendingNfcPayloads.size()
                + " ts="
                + System.currentTimeMillis()
        );
        if (!spearheadRuntimeReady) {
            return;
        }
        WebView w = resolveActiveWebViewForNfc("flushPendingNfcToBridge");
        if (w == null) {
            Log.w(DIAG_TAG, "phase=flush_pending_no_webview ts=" + System.currentTimeMillis());
            return;
        }
        List<String> copy = new ArrayList<>(pendingNfcPayloads);
        pendingNfcPayloads.clear();
        if (pendingNfcPayloadJson != null) {
            copy.add(pendingNfcPayloadJson);
            pendingNfcPayloadJson = null;
        }
        if (copy.isEmpty()) {
            return;
        }
        Log.d(LOG_TAG, "SPEARHEAD_NFC bridge_flush_pending count=" + copy.size());
        Log.i(DIAG_TAG, "phase=flush_pending_nfc count=" + copy.size() + " ts=" + System.currentTimeMillis());
        for (String payload : copy) {
            deliverNfcToBridge(payload, w);
        }
    }

    private void deliverNfcToBridge(String jsonPayload, WebView webViewForPost) {
        if (!spearheadRuntimeReady) {
            pendingNfcPayloads.add(jsonPayload);
            Log.w(DIAG_TAG, "phase=nfc_delivery_blocked_runtime_not_ready pending_count=" + pendingNfcPayloads.size());
            return;
        }
        if (webViewForPost == null) {
            pendingNfcPayloadJson = jsonPayload;
            Log.w(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=fail reason=no_webview_arg");
            Log.i(DIAG_TAG, "phase=bridge_abort_no_webview queue_pending=1 ts=" + System.currentTimeMillis());
            return;
        }

        webViewForPost.post(
            () -> {
                WebView wEval = resolveActiveWebViewForNfc("nfc_postedRunnable_before_dispatch");
                if (wEval == null) {
                    pendingNfcPayloadJson = jsonPayload;
                    Log.w(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=defer reason=webview_null_inside_post");
                    return;
                }
                if (!spearheadRuntimeReady) {
                    pendingNfcPayloads.add(jsonPayload);
                    Log.w(DIAG_TAG, "phase=nfc_delivery_blocked_runtime_not_ready pending_count=" + pendingNfcPayloads.size());
                    return;
                }
                if (wEval != webViewForPost) {
                    Log.w(
                        WEBVIEW_CTX_TAG,
                        "phase=webview_replaced_between_post_and_runnable posted_hash="
                            + System.identityHashCode(webViewForPost)
                            + " current_hash="
                            + System.identityHashCode(wEval)
                            + " ts="
                            + System.currentTimeMillis()
                    );
                }
                try {
                    Log.i(
                        DIAG_TAG,
                        "phase=native_nfc_dispatch method=evaluateJavascript"
                            + " target=window.SPEARHEAD_NFC_NATIVE_RECEIVE(json)"
                            + " webview_hash="
                            + wEval.hashCode()
                            + " ts="
                            + System.currentTimeMillis()
                    );
                    deliverSpearheadNativeNfc(jsonPayload, wEval);
                    Log.d(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=ok method=native_receive_eval");
                    Log.i(DIAG_TAG, "phase=bridge_native_callback_ok len=" + jsonPayload.length() + " ts=" + System.currentTimeMillis());
                } catch (Throwable t) {
                    Log.e(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=fail method=native_receive err=" + t.getMessage());
                    Log.i(DIAG_TAG, "phase=bridge_native_callback_failed err=" + t.getMessage());
                    fallbackDispatchNfcJson(jsonPayload);
                }
            });
    }

    /**
     * Direct JS callback — avoids Capacitor {@code triggerWindowJSEvent} / DOM CustomEvent realm mismatch.
     */
    private void deliverSpearheadNativeNfc(String jsonPayload, WebView webView) {
        if (webView == null) {
            return;
        }
        String quoted = JSONObject.quote(jsonPayload);
        String js =
            "(function(){try{var p=JSON.parse(" + quoted + ");"
                + "if(typeof window.SPEARHEAD_NFC_NATIVE_RECEIVE==='function'){"
                + "window.SPEARHEAD_NFC_NATIVE_RECEIVE(p);"
                + "}else{console.warn('SPEARHEAD_NATIVE_CALLBACK_MISSING');}"
                + "}catch(e){console.error('SPEARHEAD_NATIVE_CALLBACK_ERR',e);}"
                + "})();";
        Log.d(DIAG_TAG, "phase=native_nfc_eval chars=" + js.length());
        webView.evaluateJavascript(js, null);
    }

    /** Retry same path as primary if the posted runnable throws before eval. */
    private void fallbackDispatchNfcJson(String jsonPayload) {
        try {
            if (!spearheadRuntimeReady) {
                pendingNfcPayloads.add(jsonPayload);
                Log.w(DIAG_TAG, "phase=nfc_delivery_blocked_runtime_not_ready pending_count=" + pendingNfcPayloads.size());
                return;
            }
            WebView w = resolveActiveWebViewForNfc("fallbackDispatchNfcJson");
            if (w == null) {
                return;
            }
            Log.i(DIAG_TAG, "phase=native_nfc_fallback_retry len=" + jsonPayload.length() + " ts=" + System.currentTimeMillis());
            deliverSpearheadNativeNfc(jsonPayload, w);
            Log.d(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=ok method=native_receive_fallback");
            Log.i(DIAG_TAG, "phase=bridge_evaljs_fallback_ok len=" + jsonPayload.length() + " ts=" + System.currentTimeMillis());
        } catch (Throwable t2) {
            Log.e(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=fail method=fallback err=" + t2.getMessage());
            Log.i(DIAG_TAG, "phase=bridge_evaljs_fallback_failed err=" + t2.getMessage());
        }
    }

    private void sendMainActivityAliveEvent(String source) {
        String adapterState = "unknown";
        if (nfcAdapter == null) {
            adapterState = "adapter_null";
        } else {
            adapterState = nfcAdapter.isEnabled() ? "adapter_enabled" : "adapter_disabled";
        }

        Bridge bNow = getCapacitorBridgeNow();
        boolean bridgePresent = bNow != null;
        WebView wNow = bNow != null ? bNow.getWebView() : null;
        boolean webViewPresent = wNow != null;
        resolveActiveWebViewForNfc("sendMainActivityAliveEvent_" + source);
        Log.d(LOG_TAG, "SPEARHEAD_NFC alive_check bridge=" + bridgePresent + " webview=" + webViewPresent);

        try {
            JSONObject payload = new JSONObject();
            payload.put("alive", true);
            payload.put("source", source);
            payload.put("adapterState", adapterState);
            payload.put("bridgePresent", bridgePresent);
            payload.put("webViewPresent", webViewPresent);
            String json = payload.toString();

            if (bNow != null) {
                bNow.triggerWindowJSEvent("main-activity-alive", json);
                Log.d(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=ok event=main-activity-alive");
                if (wNow != null) {
                    JSONObject detail = new JSONObject();
                    detail.put("alive", true);
                    detail.put("source", source);
                    detail.put("adapterState", adapterState);
                    detail.put("bridgePresent", true);
                    detail.put("webViewPresent", true);
                    final String js =
                        "window.dispatchEvent(new CustomEvent('main-activity-test',{detail:"
                            + detail.toString()
                            + "}));";
                    final WebView wPost = resolveActiveWebViewForNfc("main_activity_alive_js_post_" + source);
                    if (wPost != null) {
                        wPost.post(() -> {
                            WebView wInner = resolveActiveWebViewForNfc("main_activity_test_eval_inner");
                            if (wInner != null) {
                                wInner.evaluateJavascript(js, null);
                            }
                        });
                    }
                }
            } else {
                Log.w(LOG_TAG, "SPEARHEAD_NFC bridge_dispatch=skip event=main-activity-alive reason=no_bridge");
            }
        } catch (Exception e) {
            Log.e(LOG_TAG, "SPEARHEAD_NFC alive_event_error msg=" + e.getMessage());
        }
    }
}
