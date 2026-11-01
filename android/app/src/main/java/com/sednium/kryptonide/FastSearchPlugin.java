package com.sednium.kryptonide;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "FastSearch")
public class FastSearchPlugin extends Plugin {

    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    @PluginMethod
    public void searchInFiles(PluginCall call) {
        String query = call.getString("query");
        JSArray fileContents = call.getArray("files");

        if (query == null || query.isEmpty() || fileContents == null) {
            call.reject("Query and files array are required");
            return;
        }

        executor.execute(() -> {
            try {
                JSArray results = new JSArray();
                Pattern pattern = Pattern.compile(query, Pattern.CASE_INSENSITIVE);

                for (int i = 0; i < fileContents.length(); i++) {
                    JSONObject fileObj = fileContents.getJSONObject(i);
                    String fileName = fileObj.optString("name");
                    String content = fileObj.optString("content");

                    if (content == null || fileName == null) continue;

                    String[] lines = content.split("\n");
                    for (int lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                        Matcher matcher = pattern.matcher(lines[lineIdx]);
                        if (matcher.find()) {
                            JSObject match = new JSObject();
                            match.put("file", fileName);
                            match.put("line", lineIdx + 1);
                            match.put("content", lines[lineIdx].trim());
                            results.put(match);
                        }
                    }
                }

                JSObject ret = new JSObject();
                ret.put("results", results);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Search error: " + e.getMessage());
            }
        });
    }
}
