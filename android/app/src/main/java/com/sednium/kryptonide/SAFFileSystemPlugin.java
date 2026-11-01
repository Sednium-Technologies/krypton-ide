package com.sednium.kryptonide;

import android.content.ContentResolver;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "SAFFileSystem")
public class SAFFileSystemPlugin extends Plugin {

    private final ConcurrentHashMap<String, String> fileCache = new ConcurrentHashMap<>();

    @PluginMethod
    public void readFile(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("URI is required");
            return;
        }

        if (fileCache.containsKey(uriString)) {
            JSObject ret = new JSObject();
            ret.put("content", fileCache.get(uriString));
            call.resolve(ret);
            return;
        }

        new Thread(() -> {
            try {
                Uri uri = Uri.parse(uriString);
                ContentResolver resolver = getContext().getContentResolver();
                InputStream is = resolver.openInputStream(uri);
                if (is == null) {
                    call.reject("Could not open input stream");
                    return;
                }
                BufferedReader reader = new BufferedReader(new InputStreamReader(is));
                StringBuilder builder = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    builder.append(line).append("\n");
                }
                reader.close();
                is.close();

                String content = builder.toString();
                fileCache.put(uriString, content);

                JSObject ret = new JSObject();
                ret.put("content", content);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Read error: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String uriString = call.getString("uri");
        String content = call.getString("content");
        if (uriString == null || content == null) {
            call.reject("URI and content are required");
            return;
        }

        new Thread(() -> {
            try {
                Uri uri = Uri.parse(uriString);
                ContentResolver resolver = getContext().getContentResolver();
                OutputStream os = resolver.openOutputStream(uri, "rwt");
                if (os == null) {
                    call.reject("Could not open output stream");
                    return;
                }
                os.write(content.getBytes());
                os.flush();
                os.close();

                fileCache.put(uriString, content);

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Write error: " + e.getMessage());
            }
        }).start();
    }
}
