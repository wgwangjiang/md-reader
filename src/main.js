// Markdown 阅读器 - 前端主逻辑

// 全局状态
let currentFile = {
    path: '',
    name: '',
    content: '',
    modified: false
};
let isEditMode = false;

// DOM 元素
const elements = {
    welcomeScreen: document.getElementById('welcome-screen'),
    editorContainer: document.getElementById('editor-container'),
    previewContainer: document.getElementById('preview-container'),
    editor: document.getElementById('editor'),
    preview: document.getElementById('preview'),
    searchPanel: document.getElementById('search-panel'),
    searchInput: document.getElementById('search-input'),
    replaceInput: document.getElementById('replace-input'),
    searchCount: document.getElementById('search-count'),
    searchResults: document.getElementById('search-results'),
    searchDropdown: document.getElementById('search-dropdown'),
    searchDropdownMenu: document.getElementById('search-dropdown-menu'),
    fontPanel: document.getElementById('font-panel'),
    fontFamily: document.getElementById('font-family'),
    fontSize: document.getElementById('font-size'),
    fontSizeValue: document.getElementById('font-size-value'),
    infoPanel: document.getElementById('info-panel'),
    statusFile: document.getElementById('status-file'),
    statusMode: document.getElementById('status-mode'),
    mainContent: document.querySelector('.main-content'),
    toolbarTitle: document.getElementById('toolbar-title'),
    formatToolbar: document.getElementById('format-toolbar'),
    headingMenu: document.getElementById('heading-menu'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo')
};

// 搜索状态
let searchMatches = [];
let currentMatchIndex = -1;

// 历史记录状态（撤销/重做）
const historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 100;
let isHistoryAction = false; // 标记是否为历史操作，避免重复记录

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadVersionInfo();
    loadFontSettings();
    initPreviewLinkHandler();

    // 窗口关闭前检查未保存更改（Tauri 桌面应用）
    initWindowCloseHandler();

    // 监听通过命令行传入的文件路径（双击打开文件）
    initCliFileHandler();
});

// 监听命令行文件打开事件
async function initCliFileHandler() {
    try {
        // 等待 Tauri API 加载
        if (!window.__TAURI__) {
            setTimeout(initCliFileHandler, 100);
            return;
        }

        const { listen } = window.__TAURI__.event || {};
        if (!listen) {
            setTimeout(initCliFileHandler, 100);
            return;
        }

        // 监听后端发来的文件路径
        await listen('open-file-from-cli', async (event) => {
            const filePath = event.payload;
            if (filePath) {
                await openFileByPath(filePath);
            }
        });
    } catch (error) {
        console.error('初始化命令行文件处理器失败:', error);
    }
}

// 通过路径打开文件
async function openFileByPath(filePath) {
    try {
        const { invoke } = window.__TAURI__.core || {};
        if (!invoke) {
            console.error('Tauri invoke API 不可用');
            return;
        }

        const result = await invoke('open_file', { path: filePath });
        currentFile = {
            path: result.path,
            name: result.name,
            content: result.content,
            modified: false
        };

        // 通知后端文件已打开（未修改状态）
        await invoke('set_modified', { modified: false });

        elements.editor.value = currentFile.content;
        updatePreview();
        showEditorView();
        updateStatusBar();

        // 启用编辑按钮和查找按钮
        document.getElementById('btn-edit').disabled = false;
        document.getElementById('btn-search').disabled = false;
    } catch (error) {
        console.error('打开文件失败:', error);
        alert('打开文件失败: ' + error);
    }
}

// 初始化窗口关闭处理
async function initWindowCloseHandler() {
    try {
        // 等待 Tauri API 加载
        if (!window.__TAURI__) {
            setTimeout(initWindowCloseHandler, 100);
            return;
        }

        const { listen, emit } = window.__TAURI__.event || {};
        const { ask } = window.__TAURI__.dialog || {};
        const { invoke } = window.__TAURI__.core || {};

        if (!listen || !ask || !invoke) {
            setTimeout(initWindowCloseHandler, 100);
            return;
        }

        // 监听后端发来的关闭确认请求
        await listen('request-close-confirmation', async () => {
            const result = await ask('当前文档有未保存的更改，是否保存？', {
                title: 'Markdown 阅读器',
                kind: 'info',
                okLabel: '是',
                cancelLabel: '取消',
                noLabel: '否'
            });

            if (result === true) {
                // 用户选择"是" - 保存后关闭
                await saveFile(false);
                await emit('close-confirmed', true);
            } else if (result === false) {
                // 用户选择"否" - 直接关闭
                await emit('close-confirmed', true);
            } else {
                // 用户选择"取消" - 不关闭
                await emit('close-confirmed', false);
            }
        });
    } catch (error) {
        console.error('初始化窗口关闭处理失败:', error);
    }
}

// 事件监听器初始化
function initEventListeners() {
    // 工具栏按钮
    document.getElementById('btn-new').addEventListener('click', newFile);
    document.getElementById('btn-open').addEventListener('click', openFile);
    document.getElementById('btn-edit').addEventListener('click', toggleEditMode);
    document.getElementById('btn-search').addEventListener('click', toggleSearchPanel);
    document.getElementById('btn-font').addEventListener('click', showFontPanel);
    document.getElementById('btn-pdf').addEventListener('click', exportToPdf);
    document.getElementById('btn-html').addEventListener('click', exportToHtml);
    document.getElementById('btn-info').addEventListener('click', showInfoPanel);

    // 搜索面板
    document.getElementById('search-close').addEventListener('click', () => toggleSearchPanel(false));
    document.getElementById('search-dropdown').addEventListener('click', toggleDropdownMenu);
    document.getElementById('replace-all-btn').addEventListener('click', replaceAll);

    // 撤销/重做按钮
    elements.btnUndo.addEventListener('click', undo);
    elements.btnRedo.addEventListener('click', redo);

    // 只在按回车时搜索，支持中文输入
    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                navigateSearch(-1);
            } else {
                if (searchMatches.length === 0) {
                    performSearch();
                } else {
                    navigateSearch(1);
                }
            }
        }
    });

    // 点击外部关闭下拉菜单和标题菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-container')) {
            elements.searchDropdownMenu?.classList.add('hidden');
        }
        if (!e.target.closest('.heading-dropdown')) {
            elements.headingMenu?.classList.add('hidden');
        }
    });

    // 字体面板
    document.getElementById('font-close').addEventListener('click', () => elements.fontPanel.classList.add('hidden'));
    document.getElementById('font-apply').addEventListener('click', applyFontSettings);
    elements.fontSize.addEventListener('input', (e) => {
        elements.fontSizeValue.textContent = e.target.value + 'px';
    });

    // 信息面板
    document.getElementById('info-close').addEventListener('click', () => elements.infoPanel.classList.add('hidden'));

    // 格式工具栏按钮
    document.getElementById('fmt-bold').addEventListener('click', () => formatWrap('**'));
    document.getElementById('fmt-italic').addEventListener('click', () => formatWrap('*'));
    document.getElementById('fmt-code').addEventListener('click', () => formatWrap('`'));
    document.getElementById('fmt-heading').addEventListener('click', toggleHeadingMenu);
    document.getElementById('fmt-quote').addEventListener('click', () => formatLinePrefix('> '));
    document.getElementById('fmt-ul').addEventListener('click', () => formatLinePrefix('- '));
    document.getElementById('fmt-ol').addEventListener('click', formatOrderedList);
    document.getElementById('fmt-link').addEventListener('click', formatLink);
    document.getElementById('fmt-image').addEventListener('click', formatImage);
    document.getElementById('fmt-table').addEventListener('click', formatTable);
    document.getElementById('fmt-hr').addEventListener('click', formatHorizontalRule);

    // 标题下拉菜单项点击事件
    elements.headingMenu.querySelectorAll('.heading-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const level = parseInt(item.dataset.level);
            formatHeadingLevel(level);
            elements.headingMenu.classList.add('hidden');
            e.stopPropagation();
        });
    });

    // 编辑器内容变化
    elements.editor.addEventListener('input', async () => {
        // 记录历史（如果不是撤销/重做操作）
        if (!isHistoryAction) {
            pushHistory();
        }
        
        currentFile.content = elements.editor.value;
        currentFile.modified = true;
        updatePreview();
        updateStatusBar();
        // 通知后端文件已修改
        try {
            const { invoke } = window.__TAURI__.core || {};
            if (invoke) {
                await invoke('set_modified', { modified: true });
            }
        } catch (e) {
            console.error('通知后端修改状态失败:', e);
        }
    });

    // 同步滚动：编辑器滚动时同步预览区域
    elements.editor.addEventListener('scroll', syncScroll);
    elements.previewContainer.addEventListener('scroll', syncScrollReverse);

    // 快捷键
    document.addEventListener('keydown', handleKeydown);
}

// 快捷键处理
function handleKeydown(e) {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
            case 'n':
                e.preventDefault();
                newFile();
                break;
            case 'o':
                e.preventDefault();
                openFile();
                break;
            case 's':
                e.preventDefault();
                saveFile();
                break;
            case 'f':
                e.preventDefault();
                toggleSearchPanel(true);
                break;
            case 'z':
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
                break;
            case 'y':
                e.preventDefault();
                redo();
                break;
            case 'b':
                if (isEditMode) {
                    e.preventDefault();
                    formatWrap('**');
                }
                break;
            case 'i':
                if (isEditMode) {
                    e.preventDefault();
                    formatWrap('*');
                }
                break;
        }
    }
    if (e.key === 'Escape') {
        elements.searchPanel.classList.add('hidden');
        elements.fontPanel.classList.add('hidden');
        elements.infoPanel.classList.add('hidden');
    }
}

// 新建文件
async function newFile() {
    // 检查未保存的更改
    if (currentFile.modified) {
        const { ask } = window.__TAURI__.dialog || {};
        if (ask) {
            const result = await ask('当前文档有未保存的更改，是否保存？', {
                title: 'Markdown 阅读器',
                kind: 'info',
                okLabel: '是',
                cancelLabel: '取消',
                noLabel: '否'
            });

            if (result === true) {
                // 用户选择"是" - 保存后继续
                await saveFile(false);
            } else if (result === false) {
                // 用户选择"否" - 不保存，继续新建
            } else {
                // 用户选择"取消" - 不新建
                return;
            }
        } else {
            const result = window.confirm('当前文档有未保存的更改，是否保存？\n\n确定=保存，取消=不保存');
            if (result) {
                await saveFile(false);
            }
        }
    }

    // 重置文件状态
    currentFile = {
        path: '',
        name: '新建文档.md',
        content: '',
        modified: false
    };

    // 通知后端重置修改状态
    try {
        const { invoke } = window.__TAURI__.core || {};
        if (invoke) await invoke('set_modified', { modified: false });
    } catch (e) {}

    // 更新 UI
    elements.editor.value = '';
    updatePreview();
    showEditorView();
    updateStatusBar();

    // 启用按钮
    document.getElementById('btn-edit').disabled = false;
    document.getElementById('btn-search').disabled = false;

    // 直接进入编辑模式
    if (!isEditMode) {
        toggleEditMode();
    }

    // 初始化历史记录
    initHistory();
}

// 打开文件
async function openFile() {
    try {
        // 检查未保存的更改
        if (currentFile.modified) {
            const { ask } = window.__TAURI__.dialog || {};
            if (!ask) {
                // 如果 Tauri ask 不可用，使用原生 confirm
                const result = window.confirm('当前文档有未保存的更改，是否保存？\n\n确定=保存，取消=不保存');
                if (result) {
                    await saveFile(false);
                }
                // 无论确定还是取消，都继续打开文件
            } else {
                // 使用 Tauri 的 ask API（支持是/否/取消三个选项）
                const result = await ask('当前文档有未保存的更改，是否保存？', {
                    title: 'Markdown 阅读器',
                    kind: 'info',
                    okLabel: '是',
                    cancelLabel: '取消',
                    noLabel: '否'
                });

                if (result === true) {
                    // 用户选择"是" - 保存后继续
                    await saveFile(false);
                } else if (result === false) {
                    // 用户选择"否" - 不保存，继续打开文件
                    // 什么都不做，继续执行
                } else {
                    // 用户选择"取消" 或关闭对话框 - 不打开文件
                    return;
                }
            }
        }

        // 检查 Tauri API 是否可用
        if (!window.__TAURI__) {
            alert('Tauri API 未加载，请确保在 Tauri 环境中运行');
            return;
        }

        const { open } = window.__TAURI__.dialog || {};
        const { invoke } = window.__TAURI__.core || {};

        if (!open) {
            alert('Dialog API 未加载');
            console.error('window.__TAURI__:', window.__TAURI__);
            return;
        }

        const selected = await open({
            multiple: false,
            title: '打开 Markdown 文件',
            filters: [{
                name: 'Markdown 文件',
                extensions: ['md', 'markdown', 'txt']
            }]
        });

        if (selected) {
            const result = await invoke('open_file', { path: selected });
            currentFile = {
                path: result.path,
                name: result.name,
                content: result.content,
                modified: false
            };
            // 通知后端文件已打开（未修改状态）
            await invoke('set_modified', { modified: false });

            elements.editor.value = currentFile.content;
            updatePreview();
            showEditorView();
            updateStatusBar();

            // 启用编辑按钮和查找按钮
            document.getElementById('btn-edit').disabled = false;
            document.getElementById('btn-search').disabled = false;
        }
    } catch (error) {
        console.error('打开文件失败:', error);
        alert('打开文件失败: ' + error);
    }
}

// 保存文件
async function saveFile(showAlert = true) {
    if (!currentFile.path) {
        // 新文件：弹出确认对话框，点"是"后弹出选择目录保存
        try {
            const { ask } = window.__TAURI__.dialog || {};
            if (ask) {
                const result = await ask('是否保存当前文件？', {
                    title: 'Markdown 阅读器',
                    kind: 'info',
                    okLabel: '是',
                    cancelLabel: '否'
                });
                if (result) {
                    await saveFileAs();
                }
            } else {
                if (window.confirm('是否保存当前文件？')) {
                    await saveFileAs();
                }
            }
        } catch (e) {
            console.error('保存失败:', e);
        }
        return;
    }

    try {
        const { invoke } = window.__TAURI__.core;
        await invoke('save_file', {
            path: currentFile.path,
            content: currentFile.content
        });
        currentFile.modified = false;
        // 通知后端文件已保存
        await invoke('set_modified', { modified: false });
        updateStatusBar();
        if (showAlert) {
            alert('文件保存成功！');
        }
    } catch (error) {
        console.error('保存文件失败:', error);
        alert('保存文件失败: ' + error);
    }
}

// 另存为
async function saveFileAs() {
    try {
        const { save } = window.__TAURI__.dialog;
        const { invoke } = window.__TAURI__.core;

        const filePath = await save({
            title: '保存 Markdown 文件',
            filters: [{
                name: 'Markdown 文件',
                extensions: ['md']
            }]
        });

        if (filePath) {
            await invoke('save_file', {
                path: filePath,
                content: currentFile.content
            });
            currentFile.path = filePath;
            currentFile.name = filePath.split(/[/\\]/).pop();
            currentFile.modified = false;
            // 通知后端文件已保存
            await invoke('set_modified', { modified: false });
            updateStatusBar();
            alert('文件保存成功！');
        }
    } catch (error) {
        console.error('保存文件失败:', error);
        alert('保存文件失败: ' + error);
    }
}

// === 格式工具栏功能 ===

// 保存编辑器滚动位置
let savedEditorScrollTop = 0;

function saveEditorScroll() {
    savedEditorScrollTop = elements.editor.scrollTop;
}

function restoreEditorScroll() {
    elements.editor.scrollTop = savedEditorScrollTop;
}

// 在选中文本前后包裹标记符号（粗体、斜体、行内代码）
function formatWrap(marker) {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selected = text.substring(start, end);

    let newText, cursorPos;
    if (selected) {
        newText = text.substring(0, start) + marker + selected + marker + text.substring(end);
        cursorPos = end + marker.length * 2;
    } else {
        newText = text.substring(0, start) + marker + marker + text.substring(end);
        cursorPos = start + marker.length;
    }

    editor.value = newText;
    editor.focus();
    editor.setSelectionRange(cursorPos, cursorPos);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 在行首添加前缀（引用、无序列表）
function formatLinePrefix(prefix) {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;

    // 找到选中区域涉及的行
    const beforeStart = text.lastIndexOf('\n', start - 1) + 1;
    const afterEnd = text.indexOf('\n', end);
    const lineEnd = afterEnd === -1 ? text.length : afterEnd;
    const lines = text.substring(beforeStart, lineEnd).split('\n');

    const newLines = lines.map(line => prefix + line);
    const newText = text.substring(0, beforeStart) + newLines.join('\n') + text.substring(lineEnd);

    editor.value = newText;
    editor.focus();
    const newCursorPos = beforeStart + newLines.join('\n').length;
    editor.setSelectionRange(newCursorPos, newCursorPos);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 标题：切换下拉菜单显示
function toggleHeadingMenu(e) {
    e.stopPropagation();
    elements.headingMenu.classList.toggle('hidden');
}

// 标题：设置指定级别的标题 (level: 0-6, 0 表示普通文本)
function formatHeadingLevel(level) {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const text = editor.value;

    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? text.length : lineEnd;
    const line = text.substring(lineStart, lineEndPos);

    // 移除现有的标题标记
    const cleanLine = line.replace(/^#{1,6}\s/, '');
    
    let newLine;
    if (level === 0) {
        // 普通文本：移除标题标记
        newLine = cleanLine;
    } else {
        // 设置指定级别的标题
        const prefix = '#'.repeat(level) + ' ';
        newLine = prefix + cleanLine;
    }

    editor.value = text.substring(0, lineStart) + newLine + text.substring(lineEndPos);
    editor.focus();
    const newCursorPos = lineStart + newLine.length;
    editor.setSelectionRange(newCursorPos, newCursorPos);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 标题：循环 # ~ ###### (保留原函数供快捷键使用)
function formatHeading() {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const text = editor.value;

    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', start);
    const lineEndPos = lineEnd === -1 ? text.length : lineEnd;
    const line = text.substring(lineStart, lineEndPos);

    const match = line.match(/^(#{1,6})\s/);
    let newLine;
    if (match) {
        const level = match[1].length;
        if (level >= 6) {
            newLine = line.replace(/^#{1,6}\s/, '');
        } else {
            newLine = '#' + line;
        }
    } else {
        newLine = '# ' + line;
    }

    editor.value = text.substring(0, lineStart) + newLine + text.substring(lineEndPos);
    editor.focus();
    const newCursorPos = lineStart + newLine.length;
    editor.setSelectionRange(newCursorPos, newCursorPos);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 有序列表
function formatOrderedList() {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;

    const beforeStart = text.lastIndexOf('\n', start - 1) + 1;
    const afterEnd = text.indexOf('\n', end);
    const lineEnd = afterEnd === -1 ? text.length : afterEnd;
    const lines = text.substring(beforeStart, lineEnd).split('\n');

    const newLines = lines.map((line, i) => `${i + 1}. ${line}`);
    const newText = text.substring(0, beforeStart) + newLines.join('\n') + text.substring(lineEnd);

    editor.value = newText;
    editor.focus();
    const newCursorPos = beforeStart + newLines.join('\n').length;
    editor.setSelectionRange(newCursorPos, newCursorPos);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 链接
function formatLink() {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selected = text.substring(start, end);

    const linkText = selected || '链接文本';
    const insert = `[${linkText}](url)`;
    editor.value = text.substring(0, start) + insert + text.substring(end);
    editor.focus();
    // 选中 url 部分方便替换
    const urlStart = start + linkText.length + 3;
    editor.setSelectionRange(urlStart, urlStart + 3);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 图片
function formatImage() {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selected = text.substring(start, end);

    const altText = selected || '图片描述';
    const insert = `![${altText}](url)`;
    editor.value = text.substring(0, start) + insert + text.substring(end);
    editor.focus();
    const urlStart = start + altText.length + 4;
    editor.setSelectionRange(urlStart, urlStart + 3);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 表格
function formatTable() {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const text = editor.value;

    const table = '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n';
    editor.value = text.substring(0, start) + table + text.substring(start);
    editor.focus();
    const newPos = start + table.length;
    editor.setSelectionRange(newPos, newPos);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 分隔线
function formatHorizontalRule() {
    const editor = elements.editor;
    const scrollTop = editor.scrollTop;
    const start = editor.selectionStart;
    const text = editor.value;

    const insert = '\n---\n';
    editor.value = text.substring(0, start) + insert + text.substring(start);
    editor.focus();
    const newPos = start + insert.length;
    editor.setSelectionRange(newPos, newPos);
    editor.scrollTop = scrollTop;
    triggerEditorInput();
}

// 触发编辑器 input 事件以更新预览
function triggerEditorInput() {
    // 保存滚动位置
    const scrollTop = elements.editor.scrollTop;
    const previewScrollTop = elements.previewContainer.scrollTop;
    
    currentFile.content = elements.editor.value;
    currentFile.modified = true;
    updatePreview();
    updateStatusBar();
    
    // 恢复滚动位置
    elements.editor.scrollTop = scrollTop;
    elements.previewContainer.scrollTop = previewScrollTop;
    
    // 异步通知后端
    try {
        const { invoke } = window.__TAURI__?.core || {};
        if (invoke) invoke('set_modified', { modified: true });
    } catch (e) {}

    // 记录历史（用于撤销/重做）
    pushHistory();
}

// 切换编辑模式
function toggleEditMode() {
    // 未打开文件且未新建文件时，编辑按钮不可用
    if (!currentFile.path && !currentFile.name) {
        return;
    }

    isEditMode = !isEditMode;

    // 更新按钮图标和标题
    const btnEdit = document.getElementById('btn-edit');
    const btnEditIcon = document.getElementById('btn-edit-icon');

    if (isEditMode) {
        // 当前是编辑模式，按钮显示"预览"图标
        elements.mainContent.classList.remove('preview-only');
        elements.mainContent.classList.add('split-mode');
        elements.editorContainer.classList.remove('hidden');
        elements.previewContainer.classList.remove('hidden');
        elements.formatToolbar.classList.remove('hidden');
        elements.statusMode.textContent = '编辑模式';
        btnEdit.title = '进入阅读模式';
        btnEditIcon.innerHTML = '<path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
    } else {
        // 当前是阅读模式，按钮显示"编辑"图标
        elements.mainContent.classList.remove('split-mode');
        elements.mainContent.classList.add('preview-only');
        elements.editorContainer.classList.add('hidden');
        elements.previewContainer.classList.remove('hidden');
        elements.formatToolbar.classList.add('hidden');
        elements.statusMode.textContent = '阅读模式';
        btnEdit.title = '进入编辑模式';
        btnEditIcon.innerHTML = '<path fill="currentColor" d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"/>';
    }
}

// 显示编辑器视图
function showEditorView() {
    elements.welcomeScreen.classList.add('hidden');
    elements.editorContainer.classList.add('hidden');
    elements.previewContainer.classList.remove('hidden');
    elements.mainContent.classList.add('preview-only');
    elements.formatToolbar.classList.add('hidden');
    isEditMode = false;
    elements.statusMode.textContent = '阅读模式';
    
    // 启用撤销/重做按钮
    elements.btnUndo.disabled = false;
    elements.btnRedo.disabled = false;
    
    // 初始化历史记录
    initHistory();
}

// 更新预览
function updatePreview() {
    const html = parseMarkdown(currentFile.content);
    elements.preview.innerHTML = html;

    // 应用代码高亮
    if (window.hljs) {
        elements.preview.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
}

// 在预览区域拦截链接点击，使用默认浏览器打开
function initPreviewLinkHandler() {
    elements.preview.addEventListener('click', async (e) => {
        const link = e.target.closest('a');
        if (link && link.href) {
            e.preventDefault();
            e.stopPropagation();
            // 使用原始 href 属性值，避免浏览器解析为 tauri.localhost 相对路径
            let url = link.getAttribute('href') || link.href;
            // 如果链接没有协议前缀（如 www.baidu.com），补全 https://
            if (url && !url.match(/^[a-zA-Z]+:\/\//) && !url.startsWith('#') && !url.startsWith('/')) {
                url = 'https://' + url;
            }
            try {
                if (window.__TAURI__ && window.__TAURI__.shell) {
                    await window.__TAURI__.shell.open(url);
                } else {
                    window.open(url, '_blank');
                }
            } catch (err) {
                console.error('打开链接失败:', err);
                window.open(url, '_blank');
            }
        }
    });
}

// 简单的 Markdown 解析器
function parseMarkdown(text) {
    if (!text) return '';

    let html = text;

    // 统一换行符为 \n
    html = html.replace(/\r\n/g, '\n');
    html = html.replace(/\r/g, '\n');

    // 先保存代码块，避免被其他规则影响
    const codeBlocks = [];
    // 匹配 ```语言名 或 ``` 开头的代码块
    html = html.replace(/(```|~~~)(\w*)\n?([\s\S]*?)\1/g, (match, fence, lang, code) => {
        // 移除代码末尾多余的换行
        const trimmedCode = code.replace(/\n$/, '');
        const escaped = trimmedCode
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const langClass = lang ? `language-${lang}` : '';
        codeBlocks.push(`<pre><code class="${langClass}">${escaped}</code></pre>`);
        return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
    });

    // 保存反斜杠转义字符，避免被其他规则影响
    const escapeTokens = [];
    html = html.replace(/\\([\\`*_{}\[\]()#+\-.!~|>])/g, (match, char) => {
        escapeTokens.push(char);
        return `\x00ESCAPE${escapeTokens.length - 1}\x00`;
    });

    // 提取引用式链接定义 [id]: url "title"
    const refLinks = {};
    html = html.replace(/^\[([^\]]+)\]:\s+<?([^\s>]+)>?(?:\s+["'(]([^"')]+)["')])?$/gm, (match, id, url, title) => {
        refLinks[id.toLowerCase()] = { url, title: title || '' };
        return '';
    });

    // 保存安全的 HTML 标签（GitHub 兼容白名单）
    const safeHtmlBlocks = [];

    // 允许的 HTML 标签名
    const allowedTags = new Set([
        'p', 'br', 'hr', 'div', 'span', 'center',
        'a', 'img',
        'b', 'i', 'em', 'strong', 'del', 'ins', 's',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'pre', 'code',
        'blockquote',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'details', 'summary',
        'sub', 'sup',
        'kbd', 'var', 'samp', 'abbr', 'mark',
        'ruby', 'rt', 'rp',
        'picture', 'source',
        'figure', 'figcaption',
        'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
    ]);

    // 允许的属性名
    const allowedAttrs = new Set([
        'align', 'valign', 'href', 'src', 'alt', 'title',
        'width', 'height', 'style', 'class', 'id', 'name',
        'target', 'rel', 'colspan', 'rowspan', 'scope',
        'start', 'type', 'value', 'open',
        'disabled', 'checked', 'referrerpolicy',
    ]);

    // 匹配所有 HTML 标签，保留白名单中的标签
    html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g, (match, isClosing, tagName, attrStr, isSelfClosing) => {
        const tag = tagName.toLowerCase();
        if (!allowedTags.has(tag)) return match;

        // 闭合标签
        if (isClosing) {
            safeHtmlBlocks.push(`</${tag}>`);
            return `\x00SAFEHTML${safeHtmlBlocks.length - 1}\x00`;
        }

        // 解析并过滤属性
        let safeAttrs = '';
        const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
        let m;
        while ((m = attrRegex.exec(attrStr)) !== null) {
            const name = m[1].toLowerCase();
            const value = m[2] ?? m[3] ?? m[4] ?? null;
            if (!allowedAttrs.has(name)) continue;
            // 阻止 javascript: URL
            if ((name === 'href' || name === 'src') && value && /^\s*javascript:/i.test(value)) continue;
            if (value !== null) {
                safeAttrs += ` ${name}="${value}"`;
            } else {
                safeAttrs += ` ${name}`;
            }
        }

        // 对 <a> 标签添加安全属性
        if (tag === 'a') {
            if (!safeAttrs.includes('target=')) safeAttrs += ' target="_blank"';
            if (!safeAttrs.includes('rel=')) safeAttrs += ' rel="noopener noreferrer"';
        }
        // 对 <img> 标签添加安全属性
        if (tag === 'img') {
            if (!safeAttrs.includes('referrerpolicy=')) safeAttrs += ' referrerpolicy="no-referrer"';
            if (!safeAttrs.includes('style=')) safeAttrs += ' style="max-width:100%;"';
        }

        const closingSlash = isSelfClosing ? ' /' : '';
        safeHtmlBlocks.push(`<${tag}${safeAttrs}${closingSlash}>`);
        return `\x00SAFEHTML${safeHtmlBlocks.length - 1}\x00`;
    });

    // 转义剩余的 HTML（不在白名单中的标签）
    html = html.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Setext 风格标题 (文字行下方用 === 或 --- 下划线)
    html = html.replace(/^(.+)\n={2,}\s*$/gm, '<h1>$1</h1>');
    html = html.replace(/^(.+)\n-{2,}\s*$/gm, '<h2>$1</h2>');

    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 标题 (从多#到少#的顺序匹配)
    html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 删除线 ~~text~~
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // 高亮文本 ==text==
    html = html.replace(/==(.+?)==/g, '<mark>$1</mark>');

    // 上标 ^text^
    html = html.replace(/\^([^\^]+)\^/g, '<sup>$1</sup>');

    // 下标 ~text~ (单个波浪号，注意不要和删除线冲突)
    html = html.replace(/~([^~]+)~/g, '<sub>$1</sub>');

    // 粗体和斜体 (支持 * 和 _ 两种方式)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // GFM 提示块 (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION])
    html = html.replace(/^&gt; \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n((?:&gt;(?: [^\n]*)?\n?)*)/gim, (match, type, content) => {
        const cleanContent = content.replace(/^&gt; ?/gm, '').trim();
        const typeLower = type.toLowerCase();
        const labels = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
        return `<div class="markdown-alert markdown-alert-${typeLower}">` +
            `<p class="markdown-alert-title">${labels[typeLower]}</p>` +
            `<p>${cleanContent}</p></div>\n`;
    });

    // 多行引用块
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // 合并连续的引用块
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // 链接 (先处理图片，再处理普通链接)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        const escapedAlt = alt.replace(/"/g, '&quot;');
        return `<img src="${src}" alt="${escapedAlt}" referrerpolicy="no-referrer" style="max-width:100%;">`;
    });
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 引用式图片 ![alt][id]
    html = html.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (match, alt, id) => {
        const key = (id || alt).toLowerCase();
        const ref = refLinks[key];
        if (!ref) return match;
        const escapedAlt = alt.replace(/"/g, '&quot;');
        const titleAttr = ref.title ? ` title="${ref.title}"` : '';
        return `<img src="${ref.url}" alt="${escapedAlt}"${titleAttr} referrerpolicy="no-referrer" style="max-width:100%;">`;
    });

    // 引用式链接 [text][id] 和 [text][]
    html = html.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, id) => {
        const key = (id || text).toLowerCase();
        const ref = refLinks[key];
        if (!ref) return match;
        const titleAttr = ref.title ? ` title="${ref.title}"` : '';
        return `<a href="${ref.url}"${titleAttr} target="_blank">${text}</a>`;
    });

    // 快捷引用式链接 [text] 和单独方括号引用（无匹配时显示为文件引用样式）
    html = html.replace(/\[([^\]]+)\](?!\[|\()/g, (match, text) => {
        const key = text.toLowerCase();
        const ref = refLinks[key];
        if (ref) {
            const titleAttr = ref.title ? ` title="${ref.title}"` : '';
            return `<a href="${ref.url}"${titleAttr} target="_blank">${text}</a>`;
        }
        return `<code class="file-ref">[${text}]</code>`;
    });

    // 自动链接
    html = html.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1" target="_blank">$1</a>');
    html = html.replace(/&lt;([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})&gt;/g, '<a href="mailto:$1">$1</a>');

    // 裸露 URL 自动链接 (GFM 扩展)
    html = html.replace(/(?<![="'\/])https?:\/\/[^\s<>\[\]"'`)\x00]+/g, (url) => {
        const cleaned = url.replace(/[.,;:!?]+$/, '');
        return `<a href="${cleaned}" target="_blank">${cleaned}</a>`;
    });

    // 水平线 (支持 ---, ***, ___)
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^\*\*\*$/gm, '<hr>');
    html = html.replace(/^___$/gm, '<hr>');

    // 表格解析
    html = html.replace(/^(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/gm, (match, header, separator, body) => {
        // 解析对齐方式
        const alignments = separator.split('|').filter(cell => cell.trim() !== '').map(cell => {
            const trimmed = cell.trim();
            if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
            if (trimmed.endsWith(':')) return 'right';
            return 'left';
        });

        // 解析表头
        const headerCells = header.split('|').slice(1, -1);
        const headerHtml = headerCells.map((cell, i) =>
            `<th style="text-align:${alignments[i] || 'left'}">${cell.trim()}</th>`
        ).join('');

        // 解析表体
        const bodyRows = body.trim().split('\n');
        const bodyHtml = bodyRows.map(row => {
            const cells = row.split('|').slice(1, -1);
            return '<tr>' + cells.map((cell, i) =>
                `<td style="text-align:${alignments[i] || 'left'}">${cell.trim()}</td>`
            ).join('') + '</tr>';
        }).join('');

        return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
    });

    // 任务列表 (必须在普通列表之前处理)
    html = html.replace(/^- \[x\] (.+)$/gim, '<taskli class="task-item"><input type="checkbox" checked disabled> $1</taskli>');
    html = html.replace(/^- \[ \] (.+)$/gm, '<taskli class="task-item"><input type="checkbox" disabled> $1</taskli>');

    // 无序列表 (支持 *, -, + 三种标记)
    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\+ (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^(\t| {2,})[\*\-\+] (.+)$/gm, '<li class="nested">$2</li>');

    // 有序列表 (保留原始编号)
    html = html.replace(/^(\d+)\. (.+)$/gm, '<oli value="$1">$2</oli>');

    // 包装任务列表
    html = html.replace(/((?:<taskli[^>]*>.*<\/taskli>\n?)+)/g, '<ul class="task-list">$1</ul>');
    html = html.replace(/<taskli/g, '<li');
    html = html.replace(/<\/taskli>/g, '</li>');

    // 包装普通列表
    html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/((?:<oli[^>]*>.*<\/oli>\n?)+)/g, '<ol>$1</ol>');
    html = html.replace(/<oli value="(\d+)">/g, '<li value="$1">');
    html = html.replace(/<\/oli>/g, '</li>');

    // 脚注引用
    html = html.replace(/\[\^(\d+)\]/g, '<sup class="footnote-ref"><a href="#fn$1" id="fnref$1">[$1]</a></sup>');

    // 脚注定义
    html = html.replace(/^\[\^(\d+)\]: (.+)$/gm, '<div class="footnote" id="fn$1"><sup>$1</sup> $2 <a href="#fnref$1">↩</a></div>');

    // 定义列表
    html = html.replace(/^(.+)\n: (.+)$/gm, '<dl><dt>$1</dt><dd>$2</dd></dl>');

    // 段落（两个换行符）
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // 换行：单个换行符也转换为 <br>（更符合用户直觉）
    html = html.replace(/([^>\n])\n([^<\n])/g, '$1<br>\n$2');

    // 清理空段落和嵌套问题
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul|<ol)/g, '$1');
    html = html.replace(/(<\/ul>|<\/ol>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<hr>)/g, '$1');
    html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<table>)/g, '$1');
    html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<dl>)/g, '$1');
    html = html.replace(/(<\/dl>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<div[\s>])/g, '$1');
    html = html.replace(/(<\/div>)\s*<\/p>/g, '$1');

    // 移除连续安全 HTML 占位符之间的 <br>（raw HTML 块内的换行不应变为 <br>）
    html = html.replace(/(\x00SAFEHTML\d+\x00)(?:\s*<br>\s*\n?\s*)+(?=\x00SAFEHTML)/g, '$1\n');

    // 恢复安全的 HTML 标签
    safeHtmlBlocks.forEach((block, index) => {
        html = html.replace(`\x00SAFEHTML${index}\x00`, block);
    });

    // 移除连续 <img> 标签之间的 <br>，使图片并排显示
    html = html.replace(/(<img[^>]*>)\s*<br>\s*\n?\s*(?=<img)/g, '$1 ');

    // 移除连续链接图片（badge）之间的 <br>，使其并排显示
    html = html.replace(/(<\/a>)\s*<br>\s*\n?\s*(?=<a[^>]*>\s*<img)/g, '$1 ');

    // 清理块级 HTML 元素周围的段落标签
    const blockElements = ['div', 'p', 'center', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
        'figure', 'figcaption', 'details', 'summary', 'blockquote', 'pre', 'table', 'ul', 'ol', 'dl',
        'hr', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'picture'];
    for (const tag of blockElements) {
        html = html.replace(new RegExp(`<p>\\s*(<${tag}[\\s>])`, 'gi'), '$1');
        html = html.replace(new RegExp(`(</${tag}>)\\s*</p>`, 'gi'), '$1');
        html = html.replace(new RegExp(`<p>\\s*(</${tag}>)`, 'gi'), '$1');
        html = html.replace(new RegExp(`(<${tag}[\\s>][^<]*>|<${tag}>)\\s*</p>`, 'gi'), '$1');
    }

    // 为标题添加自动 ID（用于锚点链接）
    html = html.replace(/<h([1-6])>(.*?)<\/h\1>/g, (match, level, content) => {
        const text = content.replace(/<[^>]+>/g, '').trim();
        const id = text.toLowerCase()
            .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return `<h${level} id="${id}">${content}</h${level}>`;
    });

    // 恢复代码块
    codeBlocks.forEach((block, index) => {
        html = html.replace(`\x00CODEBLOCK${index}\x00`, block);
    });

    // 恢复反斜杠转义字符
    escapeTokens.forEach((char, index) => {
        const escaped = char.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(`\x00ESCAPE${index}\x00`, escaped);
    });

    return html;
}

// 搜索面板切换
function toggleSearchPanel(show) {
    if (typeof show === 'boolean') {
        elements.searchPanel.classList.toggle('hidden', !show);
    } else {
        elements.searchPanel.classList.toggle('hidden');
    }

    if (!elements.searchPanel.classList.contains('hidden')) {
        elements.searchInput.focus();
        elements.searchInput.select();
    }
}

// 切换下拉菜单显示
function toggleDropdownMenu(e) {
    e.stopPropagation();
    elements.searchDropdownMenu.classList.toggle('hidden');
    if (!elements.searchDropdownMenu.classList.contains('hidden')) {
        elements.replaceInput.focus();
    }
}

// 执行搜索
function performSearch() {
    const keyword = elements.searchInput.value;
    searchMatches = [];
    currentMatchIndex = -1;

    if (!keyword || !currentFile.content) {
        elements.searchCount.textContent = '';
        elements.searchResults.innerHTML = '';
        return;
    }

    // 查找所有匹配位置
    const content = elements.editor.value;
    const lines = content.split('\n');
    const regex = new RegExp(escapeRegExp(keyword), 'gi');

    let charIndex = 0;
    lines.forEach((line, lineIndex) => {
        let match;
        const lineRegex = new RegExp(escapeRegExp(keyword), 'gi');
        while ((match = lineRegex.exec(line)) !== null) {
            searchMatches.push({
                start: charIndex + match.index,
                end: charIndex + match.index + match[0].length,
                line: lineIndex + 1,
                column: match.index + 1,
                text: line,
                matchText: match[0]
            });
        }
        charIndex += line.length + 1; // +1 for newline
    });

    if (searchMatches.length > 0) {
        currentMatchIndex = 0;
        elements.searchCount.textContent = `1/${searchMatches.length}`;
        displaySearchResults(keyword);
        highlightCurrentMatch();
    } else {
        elements.searchCount.textContent = '无结果';
        elements.searchResults.innerHTML = '<div class="no-results">未找到匹配结果</div>';
    }
}

// 显示搜索结果列表
function displaySearchResults(keyword) {
    const html = searchMatches.map((r, index) => {
        const highlightedText = r.text.replace(
            new RegExp(`(${escapeRegExp(keyword)})`, 'gi'),
            '<mark>$1</mark>'
        );
        return `
            <div class="search-result-item ${index === currentMatchIndex ? 'active' : ''}" data-index="${index}">
                <div class="search-result-line">第 ${r.line} 行，第 ${r.column} 列</div>
                <div class="search-result-text">${highlightedText}</div>
            </div>
        `;
    }).join('');

    elements.searchResults.innerHTML = html;

    // 点击结果跳转
    elements.searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            currentMatchIndex = parseInt(item.dataset.index);
            highlightCurrentMatch();
            updateSearchResultsActive();
            elements.searchCount.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
        });
    });
}

// 更新搜索结果高亮
function updateSearchResultsActive() {
    elements.searchResults.querySelectorAll('.search-result-item').forEach((item, index) => {
        item.classList.toggle('active', index === currentMatchIndex);
    });

    // 滚动到当前结果
    const activeItem = elements.searchResults.querySelector('.search-result-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
    }
}

// 切换替换行显示
function toggleReplaceRow() {
    const isHidden = elements.replaceRow.classList.toggle('hidden');
    elements.toggleReplaceBtn.classList.toggle('expanded', !isHidden);
    elements.toggleReplaceBtn.textContent = isHidden ? '▶' : '▼';
}

// 导航到上一个/下一个匹配
function navigateSearch(direction) {
    if (searchMatches.length === 0) {
        performSearch();
        return;
    }

    currentMatchIndex += direction;

    if (currentMatchIndex < 0) {
        currentMatchIndex = searchMatches.length - 1;
    } else if (currentMatchIndex >= searchMatches.length) {
        currentMatchIndex = 0;
    }

    highlightCurrentMatch();
    updateSearchResultsActive();
    elements.searchCount.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
}

// 高亮当前匹配
function highlightCurrentMatch() {
    if (currentMatchIndex < 0 || currentMatchIndex >= searchMatches.length) return;

    const match = searchMatches[currentMatchIndex];

    // 确保在编辑模式
    if (!isEditMode) {
        toggleEditMode();
    }

    // 选中匹配文本
    elements.editor.focus();
    elements.editor.setSelectionRange(match.start, match.end);

    // 滚动到可见位置
    const lineHeight = parseInt(getComputedStyle(elements.editor).lineHeight) || 20;
    const linesBeforeMatch = elements.editor.value.substring(0, match.start).split('\n').length - 1;
    elements.editor.scrollTop = linesBeforeMatch * lineHeight - elements.editor.clientHeight / 2;
}

// 替换所有匹配
async function replaceAll() {
    const keyword = elements.searchInput.value;
    const replaceText = elements.replaceInput.value;

    if (!keyword) return;

    const content = elements.editor.value;
    const regex = new RegExp(escapeRegExp(keyword), 'gi');
    const newContent = content.replace(regex, replaceText);

    if (newContent !== content) {
        elements.editor.value = newContent;
        currentFile.content = newContent;
        currentFile.modified = true;
        updatePreview();
        updateStatusBar();

        // 通知后端文件已修改
        try {
            const { invoke } = window.__TAURI__.core || {};
            if (invoke) {
                await invoke('set_modified', { modified: true });
            }
        } catch (e) {
            console.error('通知后端修改状态失败:', e);
        }

        // 重新搜索（应该没有匹配了）
        performSearch();
        alert(`已替换所有匹配项`);
    }
}

// 转义正则特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 跳转到指定行
function jumpToLine(lineNumber) {
    if (!isEditMode) {
        toggleEditMode();
    }

    const lines = elements.editor.value.split('\n');
    let position = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
        position += lines[i].length + 1;
    }

    elements.editor.focus();
    elements.editor.setSelectionRange(position, position + (lines[lineNumber - 1]?.length || 0));
}

// 显示字体设置面板
function showFontPanel() {
    elements.fontPanel.classList.remove('hidden');
}

// 应用字体设置
function applyFontSettings() {
    const fontFamily = elements.fontFamily.value;
    const fontSize = elements.fontSize.value + 'px';

    elements.preview.style.fontFamily = fontFamily;
    elements.preview.style.fontSize = fontSize;
    elements.editor.style.fontFamily = fontFamily;
    elements.editor.style.fontSize = fontSize;

    // 保存字体设置到 localStorage
    localStorage.setItem('mdreader_fontFamily', fontFamily);
    localStorage.setItem('mdreader_fontSize', elements.fontSize.value);

    elements.fontPanel.classList.add('hidden');
}

// 加载保存的字体设置
function loadFontSettings() {
    const savedFontFamily = localStorage.getItem('mdreader_fontFamily');
    const savedFontSize = localStorage.getItem('mdreader_fontSize');

    if (savedFontFamily) {
        elements.fontFamily.value = savedFontFamily;
        elements.preview.style.fontFamily = savedFontFamily;
        elements.editor.style.fontFamily = savedFontFamily;
    }

    if (savedFontSize) {
        elements.fontSize.value = savedFontSize;
        elements.fontSizeValue.textContent = savedFontSize + 'px';
        elements.preview.style.fontSize = savedFontSize + 'px';
        elements.editor.style.fontSize = savedFontSize + 'px';
    } else {
        // 默认字体大小 14px
        elements.preview.style.fontSize = '14px';
        elements.editor.style.fontSize = '14px';
    }
}

// 导出为 PDF
async function exportToPdf() {
    if (!currentFile.content) {
        alert('请先打开一个文件');
        return;
    }

    // 创建打印专用的 iframe
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'absolute';
    printFrame.style.top = '-9999px';
    printFrame.style.left = '-9999px';
    document.body.appendChild(printFrame);

    const printDoc = printFrame.contentDocument || printFrame.contentWindow.document;

    // 获取当前预览的 HTML 内容
    const previewHtml = elements.preview.innerHTML;

    // 生成默认的 PDF 文件名（去掉 .md 后缀）
    const pdfFileName = currentFile.name 
        ? currentFile.name.replace(/\.md$/i, '') + '.pdf'
        : 'document.pdf';
    
    // 保存原始标题，稍后恢复
    const originalTitle = document.title;
    
    // 写入打印内容
    printDoc.open();
    printDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${pdfFileName}</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
            <style>
                /* 彻底重置所有边距 */
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                /* 页面设置 */
                @page {
                    margin: 8mm;
                    padding: 0;
                    size: auto;
                }
                
                html {
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    padding: 0;
                    overflow-x: hidden;
                }
                
                body {
                    width: 100%;
                    min-height: 100%;
                    margin: 0;
                    padding: 0;
                    font-family: '微软雅黑', 'Microsoft YaHei', sans-serif;
                    font-size: 14px;
                    line-height: 1.8;
                    overflow-x: hidden;
                }
                
                /* 打印时样式 */
                @media print {
                    @page {
                        margin: 8mm;
                        padding: 0;
                    }
                    
                    html { 
                        width: 100%;
                        margin: 0;
                        padding: 0;
                    }
                    
                    body {
                        width: 100%;
                        margin: 0;
                        padding: 0;
                    }
                }
                h1 { font-size: 1.9em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
                h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
                h3 { font-size: 1.3em; }
                h4 { font-size: 1.1em; }
                h5 { font-size: 1em; }
                h6 { font-size: 0.9em; }
                code {
                    background: #f4f4f4;
                    padding: 1px 3px;
                    border-radius: 3px;
                    font-family: 'Consolas', 'Monaco', monospace;
                }
                pre {
                    background: #f6f8fa;
                    padding: 4px 6px;
                    border-radius: 6px;
                    overflow-x: auto;
                    border: 1px solid #e1e4e8;
                    margin: 0.3em 0;
                }
                pre code { background: transparent; padding: 0; font-size: 14px; }
                blockquote {
                    border-left: 3px solid #ddd;
                    padding-left: 8px;
                    color: #666;
                    margin: 0.3em 0;
                }
                /* 表格样式 - 使用 separate 模式确保边框显示完整 */
                table {
                    border-collapse: separate;
                    border-spacing: 0;
                    width: 100%;
                    margin: 1em 0;
                    border: 2px solid #999;
                    border-radius: 4px;
                    overflow: hidden;
                }
                th, td {
                    border: 1px solid #999;
                    border-bottom: none;
                    border-right: none;
                    padding: 1px 1px;
                    text-align: left;
                }
                th {
                    background: #f0f0f0;
                    border-top: none;
                    font-weight: 600;
                }
                th:first-child { border-left: none; }
                th:last-child { border-right: none; }
                td:first-child { border-left: none; }
                td:last-child { border-right: none; }
                tr:last-child td { border-bottom: none; }
                img { max-width: 100%; }
                ul, ol { padding-left: 2em; }
                .task-list { list-style: none; padding-left: 0; }
                .task-item { display: flex; align-items: flex-start; gap: 8px; }
                mark { background-color: #fff3cd; padding: 0.1em 0.3em; }
                del { color: #999; }
                @media print {
                    body { padding: 0; margin: 0; }
                    pre { white-space: pre-wrap; word-wrap: break-word; }
                }
            </style>
        </head>
        <body>
            ${previewHtml}
        </body>
        </html>
    `);
    printDoc.close();

    // 等待内容加载完成后打印
    printFrame.onload = () => {
        setTimeout(() => {
            // 临时修改主窗口标题为 PDF 文件名（浏览器打印对话框会使用这个标题作为默认文件名）
            document.title = pdfFileName;
            
            printFrame.contentWindow.print();
            
            // 打印对话框关闭后恢复原始标题并移除 iframe
            setTimeout(() => {
                document.title = originalTitle;
                document.body.removeChild(printFrame);
            }, 1000);
        }, 500);
    };
}

// 导出为 HTML 网页
async function exportToHtml() {
    if (!currentFile.content) {
        alert('请先打开一个文件');
        return;
    }

    try {
        const { save } = window.__TAURI__.dialog || {};
        const { invoke } = window.__TAURI__.core || {};
        const { writeTextFile, BaseDirectory } = window.__TAURI__.fs || {};

        if (!save) {
            alert('对话框 API 未加载');
            return;
        }

        // 弹出保存对话框
        const filePath = await save({
            title: '导出为 HTML 网页',
            defaultPath: currentFile.name ? currentFile.name.replace(/\.md$/i, '.html') : 'document.html',
            filters: [{
                name: 'HTML 文件',
                extensions: ['html']
            }]
        });

        if (!filePath) {
            return; // 用户取消
        }

        // 获取当前预览的 HTML 内容
        const previewHtml = elements.preview.innerHTML;

        // 构建完整的 HTML 文档
        const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${currentFile.name || 'Markdown Document'}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            font-family: '微软雅黑', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 16px;
            line-height: 1.8;
            color: #333;
            background: #fff;
        }
        
        h1 { 
            font-size: 2em; 
            border-bottom: 2px solid #eee; 
            padding-bottom: 0.3em; 
            margin: 0.67em 0;
        }
        h2 { 
            font-size: 1.5em; 
            border-bottom: 1px solid #eee; 
            padding-bottom: 0.3em; 
            margin: 0.83em 0;
        }
        h3 { 
            font-size: 1.25em; 
            margin: 1em 0;
        }
        h4, h5, h6 { 
            font-size: 1em; 
            margin: 1em 0;
        }
        
        p { margin: 1em 0; }
        
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
        }
        
        pre {
            background: #f6f8fa;
            padding: 4px 6px;
            border-radius: 6px;
            overflow-x: auto;
            border: 1px solid #e1e4e8;
            margin: 0.5em 0;
        }
        pre code { 
            background: transparent; 
            padding: 0; 
            font-size: 15px;
            line-height: 1.5;
        }
        
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 16px;
            color: #666;
            margin: 1em 0;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        th { 
            background: #f4f4f4; 
            font-weight: 600;
        }
        
        img { 
            max-width: 100%; 
            height: auto;
            border-radius: 4px;
        }
        
        ul, ol { 
            padding-left: 2em; 
            margin: 1em 0;
        }
        li { margin: 0.5em 0; }
        
        .task-list { 
            list-style: none; 
            padding-left: 0; 
        }
        .task-item { 
            display: flex; 
            align-items: flex-start; 
            gap: 8px; 
        }
        .task-item input[type="checkbox"] {
            margin-top: 5px;
        }
        
        mark { 
            background-color: #fff3cd; 
            padding: 0.1em 0.3em; 
            border-radius: 3px;
        }
        del { color: #999; }
        
        a { 
            color: #0366d6; 
            text-decoration: none; 
        }
        a:hover { text-decoration: underline; }
        
        hr {
            border: none;
            border-top: 1px solid #e1e4e8;
            margin: 2em 0;
        }
        
        .footnote {
            font-size: 0.9em;
            color: #666;
            border-top: 1px solid #e1e4e8;
            padding-top: 1em;
            margin-top: 2em;
        }
        .footnote-ref a {
            color: #0366d6;
            text-decoration: none;
        }
        
        @media (max-width: 768px) {
            body {
                padding: 20px 15px;
                font-size: 15px;
            }
            h1 { font-size: 1.75em; }
            h2 { font-size: 1.4em; }
            h3 { font-size: 1.15em; }
        }
    </style>
</head>
<body>
${previewHtml}
</body>
</html>`;

        // 使用后端命令保存文件
        if (invoke) {
            await invoke('save_file', {
                path: filePath,
                content: htmlContent
            });
            alert('网页导出成功！');
        } else {
            alert('保存 API 未加载');
        }
    } catch (error) {
        console.error('导出网页失败:', error);
        alert('导出网页失败: ' + error);
    }
}

// 显示版本信息面板
function showInfoPanel() {
    elements.infoPanel.classList.remove('hidden');
}

// 加载版本信息
async function loadVersionInfo() {
    try {
        const { invoke } = window.__TAURI__.core;
        const info = await invoke('get_version_info');

        document.getElementById('app-name').textContent = info.app_name;
        document.getElementById('app-version').textContent = info.version;
        document.getElementById('app-author').textContent = info.author;
        document.getElementById('app-description').textContent = info.description;
    } catch (error) {
        console.error('加载版本信息失败:', error);
    }
}

// 更新状态栏和标题栏
function updateStatusBar() {
    // 更新状态栏：只保留模式信息
    elements.statusMode.textContent = isEditMode ? '编辑模式' : '阅读模式';

    // 更新标题栏：显示文件名或"未打开文件"
    elements.toolbarTitle.textContent = currentFile.name || '未打开文件';

    // 更新窗口标题：显示 "Markdown 阅读器 - 文件名"
    const appTitle = 'Markdown 阅读器';
    const windowTitle = currentFile.name ? `${appTitle} - ${currentFile.name}` : appTitle;
    try {
        const { getCurrentWindow } = window.__TAURI__.window;
        getCurrentWindow().setTitle(windowTitle);
    } catch (e) {
        document.title = windowTitle;
    }
}

// 同步滚动状态
let isSyncingScroll = false;

// 编辑器滚动时同步预览区域
function syncScroll() {
    if (isSyncingScroll || !isEditMode) return;

    isSyncingScroll = true;
    const editor = elements.editor;
    const previewContainer = elements.previewContainer;

    // 计算滚动百分比
    const scrollPercent = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);

    // 应用到预览区域
    const targetScrollTop = scrollPercent * (previewContainer.scrollHeight - previewContainer.clientHeight);
    previewContainer.scrollTop = targetScrollTop;

    setTimeout(() => { isSyncingScroll = false; }, 50);
}

// 预览区域滚动时同步编辑器（可选的反向同步）
function syncScrollReverse() {
    if (isSyncingScroll || !isEditMode) return;

    isSyncingScroll = true;
    const editor = elements.editor;
    const previewContainer = elements.previewContainer;

    // 计算滚动百分比
    const scrollPercent = previewContainer.scrollTop / (previewContainer.scrollHeight - previewContainer.clientHeight);

    // 应用到编辑器
    const targetScrollTop = scrollPercent * (editor.scrollHeight - editor.clientHeight);
    editor.scrollTop = targetScrollTop;

    setTimeout(() => { isSyncingScroll = false; }, 50);
}

// 检查未保存更改并提示
async function checkUnsavedChanges() {
    if (currentFile.modified) {
        const result = window.confirm('当前文档有未保存的更改，是否保存？');
        if (result) {
            await saveFile();
        }
        return true; // 用户已做出选择
    }
    return true;
}

// === 撤销/重做功能 ===

// 初始化历史记录
function initHistory() {
    historyStack.length = 0;
    historyIndex = -1;
    pushHistory();
}

// 添加历史记录
function pushHistory() {
    const content = elements.editor.value;
    
    // 如果当前不在历史栈末尾，删除后面的记录
    if (historyIndex < historyStack.length - 1) {
        historyStack.splice(historyIndex + 1);
    }
    
    // 避免重复记录相同内容
    if (historyStack.length > 0 && historyStack[historyStack.length - 1] === content) {
        return;
    }
    
    // 添加新记录
    historyStack.push(content);
    
    // 限制历史记录数量
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    } else {
        historyIndex++;
    }
    
    updateUndoRedoButtons();
}

// 撤销
function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreFromHistory();
    }
}

// 重做
function redo() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        restoreFromHistory();
    }
}

// 从历史记录恢复
function restoreFromHistory() {
    isHistoryAction = true;
    const scrollTop = elements.editor.scrollTop;
    const content = historyStack[historyIndex];
    
    elements.editor.value = content;
    currentFile.content = content;
    
    // 更新预览但不标记为修改（撤销/重做不应该触发 modified）
    updatePreview();
    
    elements.editor.scrollTop = scrollTop;
    isHistoryAction = false;
    
    updateUndoRedoButtons();
}

// 更新撤销/重做按钮状态
function updateUndoRedoButtons() {
    elements.btnUndo.disabled = historyIndex <= 0;
    elements.btnRedo.disabled = historyIndex >= historyStack.length - 1;
}
