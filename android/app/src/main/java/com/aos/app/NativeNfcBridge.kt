package com.aos.app

import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.nfc.FormatException
import android.nfc.NdefMessage
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NfcA
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.content.IntentCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeActivity
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.lang.ref.WeakReference
import java.security.MessageDigest
import java.util.Arrays
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.text.Charsets

/**
 * Native NFC transport: **ReaderMode** (primary while resumed) + **foreground dispatch** (fallback),
 * same canonical JS payload path, debounce, synthetic UID, queue + intent consume.
 */
object NativeNfcBridge {

    const val WINDOW_EVENT_TAG = "aosNativeNfcTag"
    const val WINDOW_EVENT_ERROR = "aosNativeNfcScanError"

    private const val L_TRACE = "NFC_TRACE"
    private const val L_CAPTURE = "NFC_CAPTURE"
    private const val L_DISPATCH = "NFC_DISPATCH"
    private const val L_SYSTEM = "NFC_SYSTEM_RACE"
    private const val L_ACTIVITY = "NFC_ACTIVITY"
    private const val L_CONSUME = "NFC_CONSUME"
    private const val L_READER = "NFC_READERMODE"

    private const val SCAN_DEBOUNCE_MS = 750L

    @Volatile
    private var foregroundDispatchRegistered = false

    @Volatile
    private var readerModeActive = false

    private var readerHost: WeakReference<BridgeActivity>? = null

    private val readerCallback = NfcAdapter.ReaderCallback { tag ->
        if (tag == null) {
            Log.w(L_READER, "[NFC_READERMODE] callback_null_tag")
            return@ReaderCallback
        }
        val act = readerHost?.get()
        if (act == null) {
            Log.w(L_READER, "[NFC_READERMODE] callback_dropped reason=no_host tagNull=${tag == null}")
            return@ReaderCallback
        }
        act.runOnUiThread {
            Log.i(
                L_READER,
                "[NFC_READERMODE] callback_fired uptimeMs=${SystemClock.elapsedRealtime()} tagNull=${tag == null} idLen=${tag?.id?.size ?: 0}"
            )
            try {
                handleReaderTag(act, tag)
            } catch (t: Throwable) {
                emitError(act, "reader_callback_fatal", "READER_FATAL", t.message ?: "error", t)
                Log.e(L_READER, "[NFC_READERMODE] callback_fatal ${t.javaClass.simpleName}", t)
            } finally {
                consumeActivityIntentToNeutral(act, "reader_mode_callback")
            }
        }
    }

    private val pendingJsPayloads = ConcurrentLinkedQueue<String>()
    private val gateLock = Any()
    private var lastGateUid = ""
    private var lastGateFingerprint = ""
    private var lastGateAt = 0L

    private var pendingIntent: PendingIntent? = null
    private var intentFilters: Array<IntentFilter>? = null

    @JvmStatic
    fun isNfcTagIntent(intent: Intent?): Boolean {
        val a = intent?.action ?: return false
        return a == NfcAdapter.ACTION_TAG_DISCOVERED ||
            a == NfcAdapter.ACTION_TECH_DISCOVERED ||
            a == NfcAdapter.ACTION_NDEF_DISCOVERED
    }

    @JvmStatic
    fun onTrace(activity: BridgeActivity, phase: String, extra: String?) {
        val t = SystemClock.elapsedRealtime()
        val resumed = (activity as LifecycleOwner).lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        Log.i(
            L_TRACE,
            "[NFC_TRACE] t=$t phase=$phase resumed=$resumed cls=${activity.javaClass.simpleName} extra=${extra ?: ""}"
        )
    }

    @JvmStatic
    fun onActivityCreated(activity: BridgeActivity) {
        onTrace(activity, "onCreate_post_super", null)
        logAdapter(activity, "onActivityCreated")
    }

    @JvmStatic
    fun onStart(activity: BridgeActivity) {
        onTrace(activity, "onStart", null)
    }

    /** Call before [BridgeActivity.onResume] so foreground dispatch wins ASAP. */
    @JvmStatic
    fun enableForegroundDispatchBeforeBridgeResume(activity: BridgeActivity) {
        onTrace(activity, "enableForegroundDispatch_before_super_onResume", null)
        val adapter = NfcAdapter.getDefaultAdapter(activity) ?: run {
            Log.w(L_CAPTURE, "[NFC_CAPTURE] no_adapter")
            return
        }
        if (!adapter.isEnabled) {
            Log.w(L_CAPTURE, "[NFC_CAPTURE] nfc_disabled")
            return
        }
        try {
            if (pendingIntent == null) {
                val launch = Intent(activity, activity.javaClass).apply {
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                }
                val flags =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                    } else {
                        PendingIntent.FLAG_UPDATE_CURRENT
                    }
                pendingIntent = PendingIntent.getActivity(activity, 0, launch, flags)
            }
            if (intentFilters == null) {
                val ndef = IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED).apply {
                    try {
                        addDataType("*/*")
                    } catch (_: IntentFilter.MalformedMimeTypeException) {
                        /* untyped NDEF filter */
                    }
                }
                intentFilters = arrayOf(
                    IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED),
                    IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED),
                    ndef
                )
            }
            adapter.enableForegroundDispatch(
                activity,
                pendingIntent,
                intentFilters,
                null
            )
            foregroundDispatchRegistered = true
            Log.i(
                L_CAPTURE,
                "[NFC_CAPTURE] foreground_dispatch_registered=1 techLists=null uptimeMs=${SystemClock.elapsedRealtime()}"
            )
        } catch (e: Exception) {
            foregroundDispatchRegistered = false
            Log.e(L_SYSTEM, "[NFC_SYSTEM_RACE] enableForegroundDispatch_failed msg=${e.message}", e)
        }
    }

    @JvmStatic
    fun onResumeAfterBridge(activity: BridgeActivity) {
        onTrace(activity, "onResume_after_super", "bridge=${activity.getBridge() != null}")
        flushPendingIfReady(activity)
        logFirstNfcIntentIfPresent(activity, "onResume_after_super")
        enableReaderModeAfterBridgeResume(activity)
    }

    @JvmStatic
    fun disableForegroundDispatchOnPause(activity: BridgeActivity) {
        onTrace(activity, "disableForegroundDispatch_onPause_enter", null)
        try {
            NfcAdapter.getDefaultAdapter(activity)?.disableForegroundDispatch(activity)
            foregroundDispatchRegistered = false
            Log.i(L_CAPTURE, "[NFC_CAPTURE] foreground_dispatch_disabled=1")
        } catch (e: Exception) {
            Log.w(L_SYSTEM, "[NFC_SYSTEM_RACE] disableForegroundDispatch_failed msg=${e.message}")
        }
    }

    /**
     * Deliver NFC to JS and neutralize activity intent. Does **not** call [BridgeActivity.onNewIntent]
     * so Capacitor plugins never see raw NFC intents (avoids duplicate / stale plugin paths).
     */
    @JvmStatic
    fun handleNfcNewIntent(activity: BridgeActivity, intent: Intent) {
        onTrace(activity, "nfc_intent_received", "action=${intent.action}")
        if (!isNfcTagIntent(intent)) return
        try {
            dispatchCanonical(activity, intent, null, "foreground_intent")
        } catch (t: Throwable) {
            emitError(activity, "dispatch_fatal", "DISPATCH_FATAL", t.message ?: "error", t)
            Log.e(L_DISPATCH, "[NFC_DISPATCH] fatal ${t.javaClass.simpleName}", t)
        } finally {
            consumeActivityIntentToNeutral(activity, "nfc_handled")
        }
    }

    private fun handleReaderTag(activity: BridgeActivity, tag: Tag) {
        dispatchCanonical(activity, null, tag, "reader_mode")
    }

    /**
     * Single canonical pipeline for foreground NFC intents and ReaderMode [Tag] delivery.
     */
    private fun dispatchCanonical(
        activity: BridgeActivity,
        intent: Intent?,
        tagOverride: Tag?,
        transportPath: String
    ) {
        val tag = tagOverride ?: intent?.let { readTagExtra(it) }
        val uidKey = resolveUidKey(intent, tag)
        val fp = fingerprint(intent, tag, uidKey)
        val now = SystemClock.elapsedRealtime()
        if (!shouldDeliver(uidKey, fp, now)) {
            Log.d(L_DISPATCH, "[NFC_DISPATCH] debounced_skip transport=$transportPath uid=$uidKey fp=$fp")
            return
        }
        recordGate(uidKey, fp, now)

        val root = JSONObject()
        root.put("intentAction", intent?.action ?: "READER_MODE")
        root.put("dispatchSource", "NativeNfcBridge:$transportPath")
        root.put("uptimeMs", now)
        root.put(
            "foregroundResumed",
            (activity as LifecycleOwner).lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        )
        root.put("readerModeActive", readerModeActive)

        val messages = JSONArray()
        if (intent != null) {
            try {
                val arr = IntentCompat.getParcelableArrayExtra(intent, NfcAdapter.EXTRA_NDEF_MESSAGES, NdefMessage::class.java)
                if (arr != null && arr.isNotEmpty()) {
                    for (m in arr) {
                        if (m != null) messages.put(ndefMessageToJson(m))
                    }
                }
            } catch (e: Exception) {
                Log.w(L_DISPATCH, "[NFC_DISPATCH] ndef_extra_read transport=$transportPath msg=${e.message}")
                emitError(activity, "ndef_extra", "NDEF_EXTRA", e.message ?: "extra", e)
            }
        }

        if (messages.length() == 0 && tag != null) {
            val ndef = try {
                Ndef.get(tag)
            } catch (_: Exception) {
                null
            }
            if (ndef != null) {
                try {
                    ndef.connect()
                    val msg: NdefMessage? = ndef.cachedNdefMessage ?: try {
                        ndef.ndefMessage
                    } catch (_: IOException) {
                        null
                    } catch (_: FormatException) {
                        null
                    }
                    if (msg != null) messages.put(ndefMessageToJson(msg))
                } catch (e: Exception) {
                    emitError(activity, "ndef_io", "NDEF_IO", e.message ?: "io", e)
                } finally {
                    try {
                        ndef.close()
                    } catch (_: Exception) {
                    }
                }
            }
            if (messages.length() == 0) {
                val tagId = intent?.getByteArrayExtra(NfcAdapter.EXTRA_ID) ?: tag.id
                val uidAscii = if (tagId != null && tagId.isNotEmpty()) {
                    bytesToHex(tagId)
                } else {
                    syntheticUid(tag)
                }
                val idMsg = JSONObject()
                val rec = JSONObject()
                rec.put("type", "ID")
                rec.put("payload", android.util.Base64.encodeToString(uidAscii.toByteArray(Charsets.UTF_8), android.util.Base64.NO_WRAP))
                val recs = JSONArray().put(rec)
                idMsg.put("records", recs)
                messages.put(idMsg)
            }
        }

        if (tag == null && messages.length() == 0) {
            emitError(activity, "no_tag", "NO_TAG", "No Tag from reader or intent", null)
            Log.w(L_DISPATCH, "[NFC_DISPATCH] no_tag transport=$transportPath")
        }

        root.put("messages", messages)
        tag?.let {
            try {
                root.put("tagInfo", extractTagInfoJson(it))
            } catch (e: Exception) {
                val fb = JSONObject()
                fb.put("uid", syntheticUid(it))
                fb.put("techTypes", JSONArray())
                root.put("tagInfo", fb)
                emitError(activity, "tag_info_partial", "TAG_INFO_PARTIAL", e.message ?: "partial", e)
            }
        }

        emitToJs(activity, WINDOW_EVENT_TAG, root)
        Log.i(
            L_DISPATCH,
            "[NFC_DISPATCH] emitted event=$WINDOW_EVENT_TAG transport=$transportPath uid=$uidKey msgs=${messages.length()} readerModeActive=$readerModeActive"
        )
    }

    @JvmStatic
    fun enableReaderModeAfterBridgeResume(activity: BridgeActivity) {
        val owner = activity as LifecycleOwner
        if (!owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            Log.w(
                L_READER,
                "[NFC_READERMODE] skip_enable not_resumed state=${owner.lifecycle.currentState}"
            )
            return
        }
        val adapter = NfcAdapter.getDefaultAdapter(activity) ?: run {
            Log.w(L_READER, "[NFC_READERMODE] skip_enable no_adapter")
            return
        }
        if (!adapter.isEnabled) {
            Log.w(L_READER, "[NFC_READERMODE] skip_enable nfc_disabled")
            return
        }
        readerHost = WeakReference(activity)
        val flags = readerModeFlags()
        try {
            adapter.enableReaderMode(activity, readerCallback, flags, null)
            readerModeActive = true
            Log.i(
                L_READER,
                "[NFC_READERMODE] enabled=1 flags=$flags fd_fallback=${foregroundDispatchRegistered} uptimeMs=${SystemClock.elapsedRealtime()} sdk=${Build.VERSION.SDK_INT} overlay_probe=watch_system_ui_after_tap"
            )
        } catch (e: Exception) {
            readerModeActive = false
            Log.e(L_READER, "[NFC_READERMODE] enable_failed msg=${e.message}", e)
        }
    }

    private fun readerModeFlags(): Int {
        var f = 0
        f = f or NfcAdapter.FLAG_READER_NFC_A
        f = f or NfcAdapter.FLAG_READER_NFC_B
        f = f or NfcAdapter.FLAG_READER_NFC_F
        f = f or NfcAdapter.FLAG_READER_NFC_V
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            f = f or NfcAdapter.FLAG_READER_NFC_BARCODE
        }
        f = f or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
        return f
    }

    @JvmStatic
    fun disableReaderModeOnPause(activity: BridgeActivity) {
        try {
            val adapter = NfcAdapter.getDefaultAdapter(activity)
            val was = readerModeActive
            adapter?.disableReaderMode(activity)
            readerModeActive = false
            readerHost = null
            Log.i(L_READER, "[NFC_READERMODE] disabled wasActive=$was")
        } catch (e: Exception) {
            Log.w(L_READER, "[NFC_READERMODE] disable_failed msg=${e.message}")
        }
    }

    private fun readTagExtra(intent: Intent): Tag? {
        return try {
            IntentCompat.getParcelableExtra(intent, NfcAdapter.EXTRA_TAG, Tag::class.java)
        } catch (e: Exception) {
            null
        }
    }

    private fun emitToJs(activity: BridgeActivity, eventName: String, payload: JSONObject) {
        val json = payload.toString()
        val bridge = activity.getBridge()
        if (bridge == null) {
            pendingJsPayloads.add(json)
            Log.w(L_SYSTEM, "[NFC_SYSTEM_RACE] bridge_null_queued len=${pendingJsPayloads.size}")
            return
        }
        postJs(bridge, eventName, json)
    }

    private fun emitError(activity: BridgeActivity, phase: String, code: String, message: String, cause: Throwable?) {
        val o = JSONObject()
        o.put("phase", phase)
        o.put("code", code)
        o.put("message", message)
        o.put("recoverable", true)
        if (cause != null) o.put("cause", cause.javaClass.simpleName)
        emitToJs(activity, WINDOW_EVENT_ERROR, o)
    }

    private fun postJs(bridge: Bridge, eventName: String, jsonObjectLiteral: String) {
        try {
            bridge.triggerWindowJSEvent(eventName, jsonObjectLiteral)
        } catch (t: Throwable) {
            Log.e(L_SYSTEM, "[NFC_SYSTEM_RACE] triggerWindowJSEvent_failed event=$eventName msg=${t.message}", t)
        }
    }

    @JvmStatic
    fun flushPendingIfReady(activity: BridgeActivity) {
        val bridge = activity.getBridge() ?: return
        var n = 0
        while (true) {
            val json = pendingJsPayloads.poll() ?: break
            postJs(bridge, WINDOW_EVENT_TAG, json)
            n++
        }
        if (n > 0) {
            Log.i(L_DISPATCH, "[NFC_DISPATCH] flushed_pending count=$n")
        }
    }

    private fun logFirstNfcIntentIfPresent(activity: BridgeActivity, where: String) {
        val i = activity.intent ?: return
        if (!isNfcTagIntent(i)) return
        Log.i(L_ACTIVITY, "[NFC_ACTIVITY] initial_intent_is_nfc where=$where action=${i.action}")
    }

    private fun consumeActivityIntentToNeutral(activity: BridgeActivity, reason: String) {
        try {
            val neutral = Intent(activity, activity.javaClass).apply {
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            activity.intent = neutral
            Log.i(L_CONSUME, "[NFC_CONSUME] intent_neutralized reason=$reason")
        } catch (t: Throwable) {
            Log.w(L_CONSUME, "[NFC_CONSUME] neutralize_failed reason=$reason msg=${t.message}")
        }
    }

    private fun logAdapter(activity: BridgeActivity, hook: String) {
        val a = NfcAdapter.getDefaultAdapter(activity)
        Log.i(
            L_TRACE,
            "[NFC_TRACE] adapter hook=$hook present=${a != null} enabled=${a?.isEnabled == true}"
        )
    }

    private fun shouldDeliver(uidKey: String, fingerprint: String, now: Long): Boolean {
        synchronized(gateLock) {
            val dt = now - lastGateAt
            if (dt < SCAN_DEBOUNCE_MS) {
                if (uidKey.isNotEmpty() && uidKey == lastGateUid) return false
                if (fingerprint == lastGateFingerprint) return false
            }
            return true
        }
    }

    private fun recordGate(uidKey: String, fingerprint: String, now: Long) {
        synchronized(gateLock) {
            lastGateUid = uidKey
            lastGateFingerprint = fingerprint
            lastGateAt = now
        }
    }

    private fun resolveUidKey(intent: Intent?, tag: Tag?): String {
        val extra = intent?.getByteArrayExtra(NfcAdapter.EXTRA_ID)
        val raw = when {
            extra != null && extra.isNotEmpty() -> extra
            tag?.id != null && tag.id.isNotEmpty() -> tag.id
            else -> null
        }
        return if (raw != null) bytesToHex(raw) else syntheticUid(tag)
    }

    private fun fingerprint(intent: Intent?, tag: Tag?, uidResolved: String): String {
        val actionPart = intent?.action ?: "reader_mode"
        val idh = when {
            intent != null -> Arrays.hashCode(intent.getByteArrayExtra(NfcAdapter.EXTRA_ID)).toString()
            tag?.id != null -> Arrays.hashCode(tag.id).toString()
            else -> "0"
        }
        val th = tag?.techList?.contentHashCode()?.toString() ?: "notag"
        val nd = StringBuilder()
        if (intent != null) {
            val arr = try {
                IntentCompat.getParcelableArrayExtra(intent, NfcAdapter.EXTRA_NDEF_MESSAGES, NdefMessage::class.java)
            } catch (_: Exception) {
                null
            }
            if (arr != null) {
                nd.append(arr.size)
                for (m in arr) {
                    nd.append(":").append(ndefHash(m))
                }
            }
        }
        return listOf(actionPart, uidResolved, idh, th, nd.toString()).joinToString("|")
    }

    private fun ndefHash(m: NdefMessage?): Int {
        if (m == null) return 0
        return try {
            var h = 0
            for (r in m.records) {
                h = 31 * h + Arrays.hashCode(r.type)
                h = 31 * h + Arrays.hashCode(r.payload)
            }
            h
        } catch (_: Exception) {
            0
        }
    }

    private fun extractTagInfoJson(tag: Tag): JSONObject {
        val o = JSONObject()
        val uidBytes = tag.id
        o.put("uid", if (uidBytes != null && uidBytes.isNotEmpty()) bytesToHex(uidBytes) else syntheticUid(tag))
        val techs = JSONArray()
        try {
            for (t in tag.techList) techs.put(t)
        } catch (_: Exception) {
        }
        o.put("techTypes", techs)
        val ndef = try {
            Ndef.get(tag)
        } catch (_: Exception) {
            null
        }
        if (ndef != null) {
            try {
                ndef.connect()
                o.put("maxSize", ndef.maxSize)
                o.put("isWritable", ndef.isWritable)
                o.put("type", ndef.type)
            } catch (_: Exception) {
            } finally {
                try {
                    ndef.close()
                } catch (_: Exception) {
                }
            }
        }
        return o
    }

    private fun ndefMessageToJson(message: NdefMessage): JSONObject {
        val records = JSONArray()
        for (record in message.records) {
            val rec = JSONObject()
            try {
                rec.put("type", String(record.type, Charsets.UTF_8))
            } catch (_: Exception) {
                rec.put("type", "")
            }
            try {
                rec.put("payload", android.util.Base64.encodeToString(record.payload, android.util.Base64.NO_WRAP))
            } catch (_: Exception) {
                rec.put("payload", "")
            }
            records.put(rec)
        }
        val msg = JSONObject()
        msg.put("records", records)
        return msg
    }

    private fun syntheticUid(tag: Tag?): String {
        if (tag == null) return ""
        val nfcA = try {
            NfcA.get(tag)
        } catch (_: Exception) {
            null
        }
        if (nfcA != null) {
            try {
                nfcA.connect()
                val id = nfcA.tag?.id
                if (id != null && id.isNotEmpty()) return bytesToHex(id)
            } catch (_: Exception) {
            } finally {
                try {
                    nfcA.close()
                } catch (_: Exception) {
                }
            }
        }
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest((tag.hashCode().toString() + "\u0000" + tag.toString()).toByteArray(Charsets.UTF_8))
        return bytesToColon(Arrays.copyOfRange(digest, 0, 7))
    }

    private fun bytesToColon(bytes: ByteArray): String =
        bytes.joinToString(":") { b -> String.format("%02X", b.toInt() and 0xff) }

    private fun bytesToHex(bytes: ByteArray): String {
        val hex = charArrayOf('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F')
        val out = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val v = b.toInt() and 0xff
            out.append(hex[v shr 4]).append(hex[v and 0x0f])
        }
        return out.toString()
    }
}
