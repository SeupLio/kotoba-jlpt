package io.github.seuplio.kotoba;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.webkit.JavascriptInterface;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 只暴露一个无副作用的主题接口：让底部系统导航栏跟随应用的和纸 / 墨色主题
        getBridge().getWebView().addJavascriptInterface(new NavThemeBridge(), "KotobaNav");
        applyNavBar(false);
    }

    private void applyNavBar(boolean dark) {
        Window window = getWindow();
        window.setNavigationBarColor(Color.parseColor(dark ? "#17181A" : "#F7F4EE"));
        WindowCompat.getInsetsController(window, window.getDecorView())
                .setAppearanceLightNavigationBars(!dark);
    }

    private class NavThemeBridge {
        @JavascriptInterface
        public void setDark(final boolean dark) {
            runOnUiThread(() -> applyNavBar(dark));
        }
    }
}
