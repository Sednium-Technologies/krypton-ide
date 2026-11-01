package com.sednium.kryptonide;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "StoragePermission",
    permissions = {
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        )
    }
)
public class StoragePermissionPlugin extends Plugin {

    private static final String TAG = "StoragePermission";

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean isGranted = isStoragePermissionGranted();
        ret.put("granted", isGranted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (isStoragePermissionGranted()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                startActivityForResult(call, intent, "allFilesPermissionResult");
            } catch (Exception e) {
                Log.w(TAG, "Failed to launch app-specific all files access settings, trying general settings", e);
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    startActivityForResult(call, intent, "allFilesPermissionResult");
                } catch (Exception ex) {
                    Log.w(TAG, "Failed to launch general all files access, falling back to app details", ex);
                    try {
                        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                        startActivityForResult(call, intent, "allFilesPermissionResult");
                    } catch (Exception e3) {
                        call.reject("Could not open settings for All Files Access: " + e3.getMessage());
                    }
                }
            }
        } else {
            // Android 10 and below
            requestPermissionForAlias("storage", call, "storagePermissionResult");
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                    startActivityForResult(call, intent, "allFilesPermissionResult");
                    return;
                } catch (Exception e1) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                        startActivityForResult(call, intent, "allFilesPermissionResult");
                        return;
                    } catch (Exception e2) {
                        // Fallback to app details
                    }
                }
            }
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "allFilesPermissionResult");
        } catch (Exception e) {
            Log.e(TAG, "Failed to open settings", e);
            call.reject("Failed to open settings: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void allFilesPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        boolean isGranted = isStoragePermissionGranted();
        ret.put("granted", isGranted);
        call.resolve(ret);
    }

    @ActivityCallback
    private void storagePermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        boolean isGranted = isStoragePermissionGranted();
        ret.put("granted", isGranted);
        call.resolve(ret);
    }

    private boolean isStoragePermissionGranted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        } else {
            int readPerm = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE);
            int writePerm = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE);
            return readPerm == PackageManager.PERMISSION_GRANTED && writePerm == PackageManager.PERMISSION_GRANTED;
        }
    }
}
