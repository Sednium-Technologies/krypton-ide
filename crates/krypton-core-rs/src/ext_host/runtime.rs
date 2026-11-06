#[cfg(not(target_arch = "wasm32"))]
pub mod runtime_impl {
    use rquickjs::{Context, Function, Runtime, Value};
    use std::sync::{Arc, Mutex};

    pub struct ExtensionRuntime {
        runtime: Runtime,
        context: Context,
        logs: Arc<Mutex<Vec<String>>>,
    }

    impl ExtensionRuntime {
        pub fn new() -> Result<Self, String> {
            let runtime = Runtime::new().map_err(|e| format!("Failed to create QuickJS runtime: {e}"))?;
            runtime.set_memory_limit(16 * 1024 * 1024);
            runtime.set_max_stack_size(1024 * 1024);

            let context = Context::full(&runtime).map_err(|e| format!("Failed to create QuickJS context: {e}"))?;
            let logs = Arc::new(Mutex::new(Vec::new()));

            // Inject console object
            let logs_clone = logs.clone();
            context.with(|ctx| -> Result<(), rquickjs::Error> {
                let globals = ctx.globals();
                let console = rquickjs::Object::new(ctx.clone())?;

                let l_log = logs_clone.clone();
                console.set(
                    "log",
                    Function::new(ctx.clone(), move |msg: String| {
                        let line = format!("[ext log] {}", msg);
                        println!("{}", line);
                        if let Ok(mut lock) = l_log.lock() {
                            lock.push(line);
                        }
                    })?,
                )?;

                let l_warn = logs_clone.clone();
                console.set(
                    "warn",
                    Function::new(ctx.clone(), move |msg: String| {
                        let line = format!("[ext warn] {}", msg);
                        eprintln!("{}", line);
                        if let Ok(mut lock) = l_warn.lock() {
                            lock.push(line);
                        }
                    })?,
                )?;

                let l_err = logs_clone.clone();
                console.set(
                    "error",
                    Function::new(ctx.clone(), move |msg: String| {
                        let line = format!("[ext error] {}", msg);
                        eprintln!("{}", line);
                        if let Ok(mut lock) = l_err.lock() {
                            lock.push(line);
                        }
                    })?,
                )?;

                globals.set("console", console)?;
                Ok(())
            }).map_err(|e| format!("Failed to setup console in QuickJS: {e}"))?;

            Ok(Self {
                runtime,
                context,
                logs,
            })
        }

        pub fn pump_jobs(&self) -> Result<(), String> {
            while self.runtime.is_job_pending() {
                self.runtime.execute_pending_job().map_err(|e| format!("Job execution error: {e}"))?;
            }
            Ok(())
        }

        pub fn eval_string(&self, code: &str) -> Result<String, String> {
            let res = self.context.with(|ctx| -> Result<String, rquickjs::Error> {
                let val: Value = ctx.eval(code)?;
                if let Some(s) = val.as_string() {
                    s.to_string()
                } else if val.is_null() {
                    Ok("null".to_string())
                } else if val.is_undefined() {
                    Ok("undefined".to_string())
                } else if val.is_bool() {
                    Ok(val.as_bool().unwrap_or(false).to_string())
                } else if val.is_number() {
                    Ok(val.as_number().unwrap_or(0.0).to_string())
                } else {
                    // Fallback to JSON.stringify
                    let globals = ctx.globals();
                    let json_obj: rquickjs::Object = globals.get("JSON")?;
                    let stringify_fn: Function = json_obj.get("stringify")?;
                    let json_str: String = stringify_fn.call((val,))?;
                    Ok(json_str)
                }
            }).map_err(|e| format!("Evaluation error: {e}"))?;

            self.pump_jobs()?;
            Ok(res)
        }

        pub fn eval_json(&self, code: &str) -> Result<serde_json::Value, String> {
            let json_str = self.context.with(|ctx| -> Result<String, rquickjs::Error> {
                let wrapped = format!("JSON.stringify((function() {{ return ({}); }})())", code);
                let res: Value = ctx.eval(wrapped)?;
                if let Some(s) = res.as_string() {
                    s.to_string()
                } else {
                    Ok("null".to_string())
                }
            }).map_err(|e| format!("Eval JSON error: {e}"))?;

            self.pump_jobs()?;
            serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON result: {e}"))
        }

        pub fn get_logs(&self) -> Vec<String> {
            self.logs.lock().map(|l| l.clone()).unwrap_or_default()
        }

        pub fn context(&self) -> &Context {
            &self.context
        }

        pub fn runtime(&self) -> &Runtime {
            &self.runtime
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use runtime_impl::*;
