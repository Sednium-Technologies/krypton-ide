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
            let res = self.context.with(|ctx| -> Result<String, String> {
                let val: Value = match ctx.eval(code) {
                    Ok(v) => v,
                    Err(rquickjs::Error::Exception) => {
                        let exc = ctx.catch();
                        let msg = if let Some(e) = exc.as_exception() {
                            e.message().unwrap_or_else(|| "Unknown JS exception".to_string())
                        } else {
                            format!("{:?}", exc)
                        };
                        return Err(format!("JS Exception: {}", msg));
                    }
                    Err(e) => return Err(format!("Evaluation error: {e}")),
                };
                if let Some(s) = val.as_string() {
                    s.to_string().map_err(|e| format!("String conversion error: {e}"))
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
                    let json_obj: rquickjs::Object = globals.get("JSON").map_err(|e| e.to_string())?;
                    let stringify_fn: Function = json_obj.get("stringify").map_err(|e| e.to_string())?;
                    let json_str: String = stringify_fn.call((val,)).map_err(|e| e.to_string())?;
                    Ok(json_str)
                }
            })?;

            self.pump_jobs()?;
            Ok(res)
        }

        pub fn eval_json(&self, code: &str) -> Result<serde_json::Value, String> {
            let json_str = self.context.with(|ctx| -> Result<String, String> {
                let wrapped = format!("JSON.stringify((function() {{ return ({}); }})())", code);
                let res: Value = match ctx.eval(wrapped) {
                    Ok(v) => v,
                    Err(rquickjs::Error::Exception) => {
                        let exc = ctx.catch();
                        let msg = if let Some(e) = exc.as_exception() {
                            e.message().unwrap_or_else(|| "Unknown JS exception".to_string())
                        } else {
                            format!("{:?}", exc)
                        };
                        return Err(format!("JS Exception: {}", msg));
                    }
                    Err(e) => return Err(format!("Eval JSON error: {e}")),
                };
                if let Some(s) = res.as_string() {
                    s.to_string().map_err(|e| format!("String conversion error: {e}"))
                } else {
                    Ok("null".to_string())
                }
            })?;

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

#[cfg(not(target_arch = "wasm32"))]
unsafe impl Send for runtime_impl::ExtensionRuntime {}
