// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use tauri::{Manager, WindowEvent, Emitter, Listener};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::env;

fn main() {
    // 用于跟踪是否有未保存的更改
    let modified = Arc::new(AtomicBool::new(false));
    let modified_for_close = modified.clone();
    
    // 获取命令行参数中的文件路径（双击打开时传入）
    let cli_file_path: Arc<std::sync::Mutex<Option<String>>> = Arc::new(std::sync::Mutex::new(None));
    let args: Vec<String> = env::args().collect();
    // 参数1通常是程序路径，参数2（如果存在）是被打开的文件路径
    if args.len() > 1 {
        let file_path = args[1].clone();
        if std::path::Path::new(&file_path).exists() {
            *cli_file_path.lock().unwrap() = Some(file_path);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(modified)
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::save_file,
            commands::get_version_info,
            commands::search_text,
            commands::get_system_fonts,
            set_modified
        ])
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let is_modified = modified_for_close.load(Ordering::Relaxed);
                if is_modified {
                    // 阻止关闭，让前端处理确认对话框
                    api.prevent_close();
                    // 通知前端显示确认对话框
                    let _ = window.emit("request-close-confirmation", ());
                }
            }
        })
        .setup(move |app| {
            // 监听前端发来的关闭确认结果
            let app_handle = app.handle().clone();
            let modified: tauri::State<'_, Arc<AtomicBool>> = app.state();
            let modified = modified.inner().clone();
            
            app.listen("close-confirmed", move |event| {
                if let Ok(should_close) = event.payload().parse::<bool>() {
                    if should_close {
                        modified.store(false, Ordering::Relaxed);
                        // 获取主窗口并关闭
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.close();
                        }
                    }
                }
            });
            
            // 如果通过命令行传入了文件路径，通知前端打开
            let cli_path = cli_file_path.lock().unwrap().clone();
            if let Some(path) = cli_path {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // 等待前端加载完成后再发送文件路径
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    let _ = app_handle.emit("open-file-from-cli", path);
                });
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn set_modified(modified: bool, state: tauri::State<'_, Arc<AtomicBool>>) {
    state.store(modified, Ordering::Relaxed);
}
