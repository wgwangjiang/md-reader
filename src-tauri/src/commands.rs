use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub name: String,
}

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    pub line: usize,
    pub column: usize,
    pub text: String,
}

#[derive(Serialize, Deserialize)]
pub struct VersionInfo {
    pub app_name: String,
    pub version: String,
    pub author: String,
    pub description: String,
}

/// 打开文件
#[tauri::command]
pub fn open_file(path: String) -> Result<FileContent, String> {
    let file_path = Path::new(&path);
    
    if !file_path.exists() {
        return Err("文件不存在".to_string());
    }
    
    // 检查文件大小，限制为10MB
    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
    if let Ok(metadata) = fs::metadata(&path) {
        if metadata.len() > MAX_FILE_SIZE {
            return Err(format!("文件过大，最大支持{}MB", MAX_FILE_SIZE / 1024 / 1024));
        }
    }
    
    match fs::read_to_string(&path) {
        Ok(content) => {
            let name = file_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "未知文件".to_string());
            
            Ok(FileContent { path, content, name })
        }
        Err(e) => Err(format!("读取文件失败: {}", e)),
    }
}

/// 保存文件
#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    match fs::write(&path, &content) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("保存文件失败: {}", e)),
    }
}

/// 搜索文本
#[tauri::command]
pub fn search_text(content: String, keyword: String) -> Vec<SearchResult> {
    let mut results = Vec::new();
    
    if keyword.is_empty() {
        return results;
    }
    
    let keyword_lower = keyword.to_lowercase();
    
    for (line_num, line) in content.lines().enumerate() {
        let line_lower = line.to_lowercase();
        let mut start = 0;
        
        while let Some(pos) = line_lower[start..].find(&keyword_lower) {
            let actual_pos = start + pos;
            results.push(SearchResult {
                line: line_num + 1,
                column: actual_pos + 1,
                text: line.to_string(),
            });
            start = actual_pos + 1;
        }
    }
    
    results
}

/// 获取版本信息
#[tauri::command]
pub fn get_version_info() -> VersionInfo {
    VersionInfo {
        app_name: "Markdown 阅读器".to_string(),
        version: "1.4.1".to_string(),
        author: "WIND".to_string(),
        description: "一个使用 Rust 和 Tauri 构建的 Markdown 文件阅读和编辑器，支持GitHub Flavored Markdown扩展".to_string(),
    }
}

/// 获取系统字体列表
#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    vec![
        "微软雅黑".to_string(),
        "宋体".to_string(),
        "黑体".to_string(),
        "楷体".to_string(),
        "仿宋".to_string(),
        "Arial".to_string(),
        "Times New Roman".to_string(),
        "Consolas".to_string(),
        "Courier New".to_string(),
    ]
}
