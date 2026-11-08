package com.sednium.kryptonide;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.sednium.kryptonide.extensions.ExtensionHostPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(BackgroundModePlugin.class);
        registerPlugin(FolderPickerPlugin.class);
        registerPlugin(SAFFileSystemPlugin.class);
        registerPlugin(FastSearchPlugin.class);
        registerPlugin(StoragePermissionPlugin.class);
        registerPlugin(NativeTerminalPlugin.class);
        registerPlugin(KryptonCorePlugin.class);
        registerPlugin(ExtensionHostPlugin.class);
        registerPlugin(OortyLitePlugin.class);
        super.onCreate(savedInstanceState);

        // Ivory Mode Default Window Chrome & Status Bar (prevents cold/warm boot FOUC)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int flags = getWindow().getDecorView().getSystemUiVisibility();
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                getWindow().setNavigationBarColor(android.graphics.Color.parseColor("#f3f0e7"));
            }
            getWindow().getDecorView().setSystemUiVisibility(flags);
            getWindow().setStatusBarColor(android.graphics.Color.parseColor("#f3f0e7"));
        }

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, true);
            }
            WebSettings settings = webView.getSettings();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setOffscreenPreRaster(true);
            }
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
        }
    }
}
