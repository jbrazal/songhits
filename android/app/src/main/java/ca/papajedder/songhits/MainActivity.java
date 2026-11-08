package ca.papajedder.songhits;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowManager;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOST = "songhits.local";
    private static final String BASE = "https://" + HOST + "/songhits/";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 17, 16));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new Bridge(), "SongHitsAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                String scheme = uri.getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost()) || !"https".equals(uri.getScheme())) return blocked();
                String path = uri.getPath();
                if (path == null || !path.startsWith("/songhits/")) return blocked();
                String relative = path.substring("/songhits/".length());
                if (relative.isEmpty() || relative.endsWith("/")) relative += "index.html";
                if (relative.startsWith("/") || relative.contains("..") || relative.contains("\\")) return blocked();
                try {
                    InputStream stream = getAssets().open("songhits/" + relative);
                    return new WebResourceResponse(mime(relative), "UTF-8", 200, "OK", Collections.emptyMap(), stream);
                } catch (IOException error) {
                    return blocked();
                }
            }
        });
        setContentView(webView);
        webView.loadUrl(BASE);
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Unavailable offline",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    public final class Bridge {
        @JavascriptInterface public void setStageMode(boolean active) {
            runOnUiThread(() -> {
                if (active) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
                }
            });
        }

        @JavascriptInterface public void printChart() {
            runOnUiThread(() -> {
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (manager != null) manager.print("SongHits chart", webView.createPrintDocumentAdapter("SongHits chart"), null);
            });
        }
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("document.body.classList.contains('prompter')", value -> {
            if ("true".equals(value)) {
                webView.evaluateJavascript("document.querySelector('[data-prompter=exit]')?.click()", null);
            } else if (webView.canGoBack()) {
                webView.goBack();
            } else {
                MainActivity.super.onBackPressed();
            }
        });
    }

    @Override protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
