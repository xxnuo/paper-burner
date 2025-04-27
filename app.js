// 全局变量
let pdfFiles = []; // Changed from pdfFile to handle multiple files
let allResults = []; // To store results for each file
let processedFilesRecord = {}; // To keep track of processed files { 'filename_size': true }
let isProcessing = false; // Flag to prevent multiple concurrent processes
let activeProcessingCount = 0; // Track active concurrent tasks
let apiKeyManager = { // Object to manage API keys and rotation
    mistral: { keys: [], index: 0 },
    translation: { keys: [], index: 0 },

    // Parses keys from textarea value (newline-separated)
    parseKeys: function(keyType) {
        const textarea = keyType === 'mistral' ? mistralApiKeysTextarea : translationApiKeysTextarea;
        this[keyType].keys = textarea.value
            .split('\n')
            .map(k => k.trim())
            .filter(k => k !== ''); // Filter out empty lines
        this[keyType].index = 0;
        console.log(`Parsed ${this[keyType].keys.length} ${keyType} keys.`);
        return this[keyType].keys.length > 0;
    },

    // Gets the next key in a round-robin fashion
    getNextKey: function(keyType) {
        if (!this[keyType] || this[keyType].keys.length === 0) {
            return null; // No keys available
        }
        const key = this[keyType].keys[this[keyType].index];
        this[keyType].index = (this[keyType].index + 1) % this[keyType].keys.length;
        return key;
    },

    getMistralKey: function() { return this.getNextKey('mistral'); },
    getTranslationKey: function() { return this.getNextKey('translation'); }
};

let retryAttempts = new Map(); // Track retry attempts per file identifier
const MAX_RETRIES = 3; // Maximum number of retries per file

// DOM 元素
const mistralApiKeysTextarea = document.getElementById('mistralApiKeys'); // Updated ID
const rememberMistralKeyCheckbox = document.getElementById('rememberMistralKey');
const translationApiKeysTextarea = document.getElementById('translationApiKeys'); // Updated ID
const rememberTranslationKeyCheckbox = document.getElementById('rememberTranslationKey');

const translationModelSelect = document.getElementById('translationModel');
const customModelSettingsContainer = document.getElementById('customModelSettingsContainer'); // Container for custom settings
const customModelSettings = document.getElementById('customModelSettings');

// 高级设置相关
const advancedSettingsToggle = document.getElementById('advancedSettingsToggle');
const advancedSettings = document.getElementById('advancedSettings');
const advancedSettingsIcon = document.getElementById('advancedSettingsIcon');
const maxTokensPerChunk = document.getElementById('maxTokensPerChunk');
const maxTokensPerChunkValue = document.getElementById('maxTokensPerChunkValue');
const skipProcessedFilesCheckbox = document.getElementById('skipProcessedFiles');
const concurrencyLevelInput = document.getElementById('concurrencyLevel'); // New concurrency input

// 文件上传相关
const dropZone = document.getElementById('dropZone');
const pdfFileInput = document.getElementById('pdfFileInput');
const browseFilesBtn = document.getElementById('browseFilesBtn');
const fileListContainer = document.getElementById('fileListContainer'); // New container for file list
const fileList = document.getElementById('fileList'); // New list element
const clearFilesBtn = document.getElementById('clearFilesBtn'); // New clear button

// 翻译相关
const targetLanguage = document.getElementById('targetLanguage');

// 按钮
const processBtn = document.getElementById('processBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn'); // New download all button

// 结果展示
const resultsSection = document.getElementById('resultsSection');
const resultsSummary = document.getElementById('resultsSummary'); // New summary element

// 进度相关
const progressSection = document.getElementById('progressSection');
const batchProgressText = document.getElementById('batchProgressText'); // New batch progress text
const concurrentProgressText = document.getElementById('concurrentProgressText'); // New concurrent progress text
const progressStep = document.getElementById('progressStep');
const progressPercentage = document.getElementById('progressPercentage');
const progressBar = document.getElementById('progressBar');
const progressLog = document.getElementById('progressLog');

document.addEventListener('DOMContentLoaded', () => {
    // 初始化 - 从本地存储加载 API Key (Handles multiple keys)
    if (localStorage.getItem('mistralApiKeys')) {
        mistralApiKeysTextarea.value = localStorage.getItem('mistralApiKeys');
        rememberMistralKeyCheckbox.checked = true;
    }

    if (localStorage.getItem('translationApiKeys')) {
        translationApiKeysTextarea.value = localStorage.getItem('translationApiKeys');
        rememberTranslationKeyCheckbox.checked = true;
    }

    // 加载设置 (including skipProcessedFiles state and concurrency)
    loadSettings();

    // 加载已处理文件记录
    loadProcessedFilesRecord();

    // API Key 记住选项 (Now for textareas)
    rememberMistralKeyCheckbox.addEventListener('change', () => {
        updateApiKeyStorage('mistralApiKeys', mistralApiKeysTextarea.value, rememberMistralKeyCheckbox.checked);
    });

    rememberTranslationKeyCheckbox.addEventListener('change', () => {
        updateApiKeyStorage('translationApiKeys', translationApiKeysTextarea.value, rememberTranslationKeyCheckbox.checked);
    });

    mistralApiKeysTextarea.addEventListener('input', () => {
        if (rememberMistralKeyCheckbox.checked) {
            localStorage.setItem('mistralApiKeys', mistralApiKeysTextarea.value);
        }
        updateProcessButtonState(); // Update button state on key input
    });

    translationApiKeysTextarea.addEventListener('input', () => {
        if (rememberTranslationKeyCheckbox.checked) {
            localStorage.setItem('translationApiKeys', translationApiKeysTextarea.value);
        }
        updateTranslationUIVisibility(); // Need to check if keys exist now
    });

    // PDF 文件拖放上传
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (isProcessing) return; // Prevent drop during processing
        dropZone.classList.add('border-blue-500', 'bg-blue-50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (isProcessing) return; // Prevent drop during processing
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        handleFileSelection(e.dataTransfer.files);
    });

    // 浏览文件按钮
    browseFilesBtn.addEventListener('click', () => {
        if (isProcessing) return; // Prevent browse during processing
        pdfFileInput.click();
    });

    // 文件选择处理
    pdfFileInput.addEventListener('change', (e) => {
        if (isProcessing) return; // Prevent selection change during processing
        handleFileSelection(e.target.files);
        // Reset the input value to allow selecting the same file(s) again
        e.target.value = null;
    });

    // 清空文件列表按钮
    clearFilesBtn.addEventListener('click', () => {
        if (isProcessing) return; // Prevent clear during processing
        pdfFiles = [];
        updateFileListUI();
        updateProcessButtonState();
    });

    // 处理按钮
    processBtn.addEventListener('click', async () => {
        if (isProcessing) return; // Prevent starting if already processing

        // 1. Parse API Keys
        if (!apiKeyManager.parseKeys('mistral')) {
            showNotification('请输入至少一个有效的 Mistral API Key', 'error');
            return;
        }
        const translationModel = translationModelSelect.value;
        if (translationModel !== 'none' && !apiKeyManager.parseKeys('translation')) {
            showNotification(`选择了 ${translationModel} 翻译模型，请输入至少一个有效的翻译 API Key`, 'error');
            return;
        }

        if (pdfFiles.length === 0) {
            showNotification('请选择至少一个 PDF 文件', 'error');
            return;
        }

        // 2. Validate Custom Model Settings if necessary
        if (translationModel === 'custom') {
            const customModelName = document.getElementById('customModelName').value.trim();
            const customApiEndpoint = document.getElementById('customApiEndpoint').value.trim();
            const customModelId = document.getElementById('customModelId').value.trim();
            if (!customModelName || !customApiEndpoint || !customModelId) {
                showNotification('请填写完整的自定义模型信息', 'error');
                return;
            }
        }

        // 3. Setup Processing State
        isProcessing = true;
        activeProcessingCount = 0;
        retryAttempts.clear(); // Clear previous retry counts
        processBtn.disabled = true;
        processBtn.innerHTML = `<iconify-icon icon="carbon:hourglass" class="mr-2 animate-spin" width="20"></iconify-icon> <span>处理中...</span>`;
        showProgressSection();
        addProgressLog('=== 开始批量处理 ===');
        allResults = new Array(pdfFiles.length); // Initialize results array with fixed size

        const concurrencyLevel = parseInt(concurrencyLevelInput.value) || 1;
        addProgressLog(`设置并发数: ${concurrencyLevel}, 最大重试次数: ${MAX_RETRIES}`);
        updateConcurrentProgress(0); // Initialize concurrent progress text

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        // Use a Set to manage indices of files pending processing (including retries)
        const pendingIndices = new Set();
        const filesToProcess = pdfFiles.slice(); // Create a copy
        const skipEnabled = skipProcessedFilesCheckbox.checked;

        // Initial population of pending indices, skipping already processed files
        for (let i = 0; i < filesToProcess.length; i++) {
            const file = filesToProcess[i];
            const fileIdentifier = `${file.name}_${file.size}`;
            if (skipEnabled && isAlreadyProcessed(fileIdentifier)) {
                addProgressLog(`[${file.name}] 已处理过，跳过初始处理。`);
                skippedCount++;
                allResults[i] = { file: file, skipped: true }; // Mark as skipped in results
            } else {
                pendingIndices.add(i); // Add index to the processing set
            }
        }

        // Update initial progress based on skipped files
        updateOverallProgress(successCount, skippedCount, errorCount, filesToProcess.length);

        // 4. Concurrency Control Logic with Retries
        const processQueue = async () => {
            // Keep looping as long as there are pending files or active tasks
            while (pendingIndices.size > 0 || activeProcessingCount > 0) {
                // Check if we can start a new task
                while (pendingIndices.size > 0 && activeProcessingCount < concurrencyLevel) {
                    // Get the next index from the set
                    const currentFileIndex = pendingIndices.values().next().value;
                    pendingIndices.delete(currentFileIndex); // Remove from pending set

                    const currentFile = filesToProcess[currentFileIndex];
                    const fileIdentifier = `${currentFile.name}_${currentFile.size}`;
                    const currentRetry = retryAttempts.get(fileIdentifier) || 0;

                    // Increment active count and launch the task
                    activeProcessingCount++;
                    updateConcurrentProgress(activeProcessingCount);

                    const retryText = currentRetry > 0 ? ` (重试 ${currentRetry}/${MAX_RETRIES})` : '';
                    addProgressLog(`--- [${successCount + skippedCount + errorCount + 1}/${filesToProcess.length}] 开始处理: ${currentFile.name}${retryText} ---`);

                    // Get keys for this specific task
                    const mistralKeyForTask = apiKeyManager.getMistralKey();
                    const translationKeyForTask = apiKeyManager.getTranslationKey();

                    // Process the file (async)
                    processSinglePdf(currentFile, mistralKeyForTask, translationKeyForTask, translationModel)
                        .then(result => {
                            if (result && !result.error) {
                                allResults[currentFileIndex] = result;
                                markFileAsProcessed(fileIdentifier);
                                addProgressLog(`[${currentFile.name}] 处理成功！`);
                                successCount++;
                                retryAttempts.delete(fileIdentifier); // Clear retry count on success
                            } else {
                                // Handle failure and potential retry
                                const errorMsg = result?.error || '未知错误';
                                const nextRetryCount = (retryAttempts.get(fileIdentifier) || 0) + 1;

                                if (nextRetryCount <= MAX_RETRIES) {
                                    retryAttempts.set(fileIdentifier, nextRetryCount);
                                    pendingIndices.add(currentFileIndex); // Add back to the queue for retry
                                    addProgressLog(`[${currentFile.name}] 处理失败: ${errorMsg}. 将在稍后重试 (${nextRetryCount}/${MAX_RETRIES}).`);
                                } else {
                                    addProgressLog(`[${currentFile.name}] 处理失败: ${errorMsg}. 已达到最大重试次数 (${MAX_RETRIES}).`);
                                    allResults[currentFileIndex] = result || { file: currentFile, error: errorMsg };
                                    errorCount++; // Increment final error count
                                    retryAttempts.delete(fileIdentifier); // Clear retry count after final failure
                                }
                            }
                        })
                        .catch(error => {
                            // Catch unexpected errors from processSinglePdf itself
                            console.error(`处理文件 ${currentFile.name} 时发生意外错误:`, error);
                            addProgressLog(`错误: 处理文件 ${currentFile.name} 失败 - ${error.message}`);
                            allResults[currentFileIndex] = { file: currentFile, error: error.message };
                            errorCount++;
                            retryAttempts.delete(fileIdentifier);
                        })
                        .finally(() => {
                            // Task finished (success, retry scheduled, or final failure)
                            activeProcessingCount--;
                            updateConcurrentProgress(activeProcessingCount);
                            // Update overall progress based on completed states
                            updateOverallProgress(successCount, skippedCount, errorCount, filesToProcess.length);
                        });

                    // Optional slight delay between starting tasks
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // If loop exits, either queue is empty or concurrency limit reached.
                // If queue is not empty but limit is reached, or if queue is empty but tasks are active,
                // wait before checking again.
                if (pendingIndices.size > 0 || activeProcessingCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, 200)); // Wait before checking queue/active count again
                }
            }
        };

        // 5. Start processing and handle completion
        try {
            await processQueue(); // Run the concurrent processing with retries
        } catch (err) {
            console.error("处理队列时发生错误:", err);
            addProgressLog(`严重错误: 处理队列失败 - ${err.message}`);
            // Estimate final error count if queue logic fails catastrophically
            const currentCompleted = successCount + skippedCount + errorCount;
            errorCount = filesToProcess.length - currentCompleted;
        } finally {
            addProgressLog('=== 批量处理完成 ===');
            updateOverallProgress(successCount, skippedCount, errorCount, filesToProcess.length);
            updateProgress('全部完成!', 100);
            updateConcurrentProgress(0);

            isProcessing = false;
            processBtn.disabled = false; // Re-enable button
            processBtn.innerHTML = `<iconify-icon icon="carbon:play" class="mr-2" width="20"></iconify-icon> <span>开始处理</span>`;
            showResultsSection(successCount, skippedCount, errorCount);
            saveProcessedFilesRecord(); // Save the updated record

            // Clean up the results array (remove empty slots if any)
            allResults = allResults.filter(r => r !== undefined && r !== null);
            console.log("Final results count:", allResults.length);
        }
    });

    // 下载按钮 (Now Download All)
    downloadAllBtn.addEventListener('click', () => {
        if (allResults.length > 0) {
            downloadAllResults();
        } else {
            showNotification('没有可下载的结果', 'warning');
        }
    });

    // 翻译模型变更
    translationModelSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customModelSettingsContainer.classList.remove('hidden'); // Show the container
            customModelSettings.classList.remove('hidden'); // Show the settings fields
        } else {
            customModelSettingsContainer.classList.add('hidden'); // Hide the container
            customModelSettings.classList.add('hidden'); // Hide the settings fields
        }
        updateTranslationUIVisibility();
        saveSettings();
    });

    // 高级设置开关
    advancedSettingsToggle.addEventListener('click', function() {
        advancedSettings.classList.toggle('hidden');
        advancedSettingsIcon.setAttribute('icon', advancedSettings.classList.contains('hidden') ? 'carbon:chevron-down' : 'carbon:chevron-up');
        // No need to save settings here, handled by individual controls
    });

    // 最大Token数设置滑动条
    maxTokensPerChunk.addEventListener('input', function() {
        maxTokensPerChunkValue.textContent = this.value;
        saveSettings(); // Save on change
    });

    // 跳过已处理文件复选框
    skipProcessedFilesCheckbox.addEventListener('change', function() {
        saveSettings(); // Save on change
    });

    // 并发级别输入框
    concurrencyLevelInput.addEventListener('input', function() {
        // Optional: Add validation or clamp value
        let value = parseInt(this.value);
        if (isNaN(value) || value < 1) value = 1;
        if (value > 10) value = 10; // Limit max concurrency for safety
        this.value = value;
        saveSettings(); // Save on change
    });

    // 为自定义模型设置添加变更事件监听器
    const customModelInputs = [
        document.getElementById('customModelName'),
        document.getElementById('customApiEndpoint'),
        document.getElementById('customModelId'),
        document.getElementById('customRequestFormat')
    ];

    customModelInputs.forEach(input => {
        input.addEventListener('change', saveSettings); // Save on change
        input.addEventListener('input', saveSettings); // Save on input
    });

    // 初始化 UI 状态
    updateProcessButtonState();
    updateTranslationUIVisibility();
    // Ensure custom model settings visibility is correct on load
    if (translationModelSelect.value === 'custom') {
        customModelSettingsContainer.classList.remove('hidden');
        customModelSettings.classList.remove('hidden');
    } else {
        customModelSettingsContainer.classList.add('hidden');
        customModelSettings.classList.add('hidden');
    }
});

// 辅助函数

// Toggle password visibility
// function togglePasswordVisibility(inputElement, buttonElement) { ... }

// Update API Key in localStorage
function updateApiKeyStorage(keyName, value, shouldRemember) {
    if (shouldRemember) {
        localStorage.setItem(keyName, value);
    } else {
        localStorage.removeItem(keyName);
    }
}

// Handle single or multiple file selections
function handleFileSelection(selectedFiles) {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newlyAddedFiles = [];
    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        if (file.type === 'application/pdf') {
            // Avoid adding duplicates based on name and size
            if (!pdfFiles.some(existingFile => existingFile.name === file.name && existingFile.size === file.size)) {
                pdfFiles.push(file);
                newlyAddedFiles.push(file);
            } else {
                showNotification(`文件 "${file.name}" 已在列表中`, 'info');
            }
        } else {
            showNotification(`文件 "${file.name}" 不是PDF，已忽略`, 'warning');
        }
    }

    if (newlyAddedFiles.length > 0) {
        updateFileListUI();
        updateProcessButtonState();
    }
}

// Update the UI list of selected files
function updateFileListUI() {
    fileList.innerHTML = ''; // Clear existing list
    if (pdfFiles.length > 0) {
        fileListContainer.classList.remove('hidden');
        pdfFiles.forEach((file, index) => {
            const listItem = document.createElement('div');
            listItem.className = 'file-list-item';
            listItem.innerHTML = `
                <div class="flex items-center overflow-hidden mr-2">
                    <iconify-icon icon="carbon:document-pdf" class="text-red-500 mr-2 flex-shrink-0" width="20"></iconify-icon>
                    <span class="text-sm text-gray-800 truncate" title="${file.name}">${file.name}</span>
                    <span class="text-xs text-gray-500 ml-2 flex-shrink-0">(${formatFileSize(file.size)})</span>
                </div>
                <button data-index="${index}" class="remove-file-btn text-gray-400 hover:text-red-600 flex-shrink-0">
                    <iconify-icon icon="carbon:close" width="16"></iconify-icon>
                </button>
            `;
            fileList.appendChild(listItem);
        });

        // Add event listeners to new remove buttons
        document.querySelectorAll('.remove-file-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                if (isProcessing) return; // Prevent removal during processing
                const indexToRemove = parseInt(e.currentTarget.getAttribute('data-index'));
                pdfFiles.splice(indexToRemove, 1);
                updateFileListUI(); // Re-render the list
                updateProcessButtonState();
            });
        });
    } else {
        fileListContainer.classList.add('hidden');
    }
}

function updateProcessButtonState() {
    // Check if there are any valid keys entered in the mistral textarea
    const mistralKeys = mistralApiKeysTextarea.value
        .split('\n')
        .map(k => k.trim())
        .filter(k => k !== '');
    processBtn.disabled = pdfFiles.length === 0 || mistralKeys.length === 0 || isProcessing;
}

function updateTranslationUIVisibility() {
    const translationModelValue = translationModelSelect.value;
    const translationApiKeyDiv = translationApiKeysTextarea.closest('div').parentNode; // Find the parent div containing label and input
    const translationKeys = translationApiKeysTextarea.value
        .split('\n')
        .map(k => k.trim())
        .filter(k => k !== '');

    if (translationModelValue !== 'none') {
        translationApiKeyDiv.style.display = 'block';
        // Optionally, add visual indication if keys are missing but translation is selected
        if (translationKeys.length === 0 && !isProcessing) {
             // Example: Add a red border or warning icon - check if translationApiKeyDiv exists
             if (translationApiKeyDiv) {
                  const textarea = translationApiKeyDiv.querySelector('textarea');
                  if (textarea) {
                      textarea.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
                  }
             }
        } else {
             // Remove warning style if keys are present
             if (translationApiKeyDiv) {
                 const textarea = translationApiKeyDiv.querySelector('textarea');
                 if (textarea) {
                     textarea.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
                 }
             }
        }
    } else {
        translationApiKeyDiv.style.display = 'none';
        // Remove warning style if translation is not needed
        if (translationApiKeyDiv) {
             const textarea = translationApiKeyDiv.querySelector('textarea');
             if (textarea) {
                 textarea.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500');
             }
         }
    }
    // Handle custom model section visibility separately
    if (translationModelValue === 'custom') {
        customModelSettingsContainer.classList.remove('hidden');
        customModelSettings.classList.remove('hidden');
    } else {
        customModelSettingsContainer.classList.add('hidden');
        customModelSettings.classList.add('hidden');
    }
}

// Updated to show batch summary
function showResultsSection(successCount, skippedCount, errorCount) {
    progressSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    concurrentProgressText.textContent = ''; // Clear concurrent progress text

    const totalAttempted = successCount + skippedCount + errorCount;
    resultsSummary.innerHTML = `
        <p><strong>处理总结:</strong></p>
        <ul class="list-disc list-inside ml-4">
            <li>成功处理: ${successCount} 文件</li>
            <li>跳过 (已处理): ${skippedCount} 文件</li>
            <li>处理失败 (含重试): ${errorCount} 文件</li>
        </ul>
        <p class="mt-2">在 ${pdfFiles.length} 个选定文件中，尝试处理了 ${totalAttempted} 个。</p>
    `;

    // Enable or disable download button based on success count
    downloadAllBtn.disabled = successCount === 0;

    window.scrollTo({
        top: resultsSection.offsetTop - 20,
        behavior: 'smooth'
    });
}

// Updated to reset batch progress text and concurrent text
function showProgressSection() {
    resultsSection.classList.add('hidden');
    progressSection.classList.remove('hidden');
    progressLog.innerHTML = '';
    batchProgressText.textContent = ''; // Reset batch progress text
    concurrentProgressText.textContent = ''; // Reset concurrent progress text
    updateProgress('初始化...', 0);

    window.scrollTo({
        top: progressSection.offsetTop - 20,
        behavior: 'smooth'
    });
}

// New function to update concurrent progress text
function updateConcurrentProgress(count) {
     concurrentProgressText.textContent = `当前并发任务数: ${count}`;
}

// New function to update overall batch progress based on completed tasks
function updateOverallProgress(success, skipped, errors, totalFiles) {
    const completedCount = success + skipped + errors;
    if (totalFiles > 0) {
        const percentage = totalFiles > 0 ? Math.round((completedCount / totalFiles) * 100) : 0;
        batchProgressText.textContent = `整体进度: ${completedCount} / ${totalFiles} 完成`;
        progressPercentage.textContent = `${percentage}%`;
        progressBar.style.width = `${percentage}%`;
    } else {
        batchProgressText.textContent = '';
        progressPercentage.textContent = `0%`;
        progressBar.style.width = `0%`;
    }
}

// Update progress (Now primarily for step text)
function updateProgress(stepText, percentage) {
    progressStep.textContent = stepText;
    // Individual percentage is less relevant for the main bar now
    // progressPercentage.textContent = `${percentage}%`;
    // progressBar.style.width = `${percentage}%`;
}

function addProgressLog(text) {
    const logElement = progressLog;
    const timestamp = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    // Basic escaping to prevent accidental HTML injection from file names
    logLine.textContent = `[${timestamp}] ${text}`;
    logElement.appendChild(logLine);
    logElement.scrollTop = logElement.scrollHeight; // Auto-scroll
}

// Modified notification to handle potentially long messages better
function showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = 'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 mb-2 transition-all duration-300 ease-in-out transform translate-x-full opacity-0';

    let iconName, iconColor, borderColor;
    switch (type) {
        case 'success':
            iconName = 'carbon:checkmark-filled'; iconColor = 'text-green-500'; borderColor = 'border-green-500';
            break;
        case 'error':
            iconName = 'carbon:error-filled'; iconColor = 'text-red-500'; borderColor = 'border-red-500';
            break;
        case 'warning':
            iconName = 'carbon:warning-filled'; iconColor = 'text-yellow-500'; borderColor = 'border-yellow-500';
            break;
        default: // info
            iconName = 'carbon:information-filled'; iconColor = 'text-blue-500'; borderColor = 'border-blue-500';
            break;
    }

    notification.innerHTML = `
        <div class="p-4 border-l-4 ${borderColor}">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <iconify-icon icon="${iconName}" class="h-6 w-6 ${iconColor}" aria-hidden="true"></iconify-icon>
            </div>
            <div class="ml-3 w-0 flex-1 pt-0.5">
              <p class="text-sm font-medium text-gray-900">通知</p>
              <p class="mt-1 text-sm text-gray-500 break-words">${message}</p>
            </div>
            <div class="ml-4 flex flex-shrink-0">
              <button type="button" class="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <span class="sr-only">关闭</span>
                <iconify-icon icon="carbon:close" class="h-5 w-5" aria-hidden="true"></iconify-icon>
        </button>
            </div>
          </div>
        </div>
    `;

    container.appendChild(notification);

    // Show animation
    requestAnimationFrame(() => {
        notification.classList.remove('translate-x-full', 'opacity-0');
        notification.classList.add('translate-x-0', 'opacity-100');
    });

    const closeButton = notification.querySelector('button');
    const closeFunc = () => closeNotification(notification);
    closeButton.addEventListener('click', closeFunc);

    // Auto close
    const timeout = setTimeout(closeFunc, duration);
    notification.dataset.timeout = timeout;

    return notification;
}

// Close notification helper
function closeNotification(notification) {
    if (!notification || !notification.parentNode) return; // Already removed

    clearTimeout(notification.dataset.timeout);
    notification.classList.remove('translate-x-0', 'opacity-100');
    notification.classList.add('translate-x-full', 'opacity-0');

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 300); // Corresponds to transition duration
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- Process Single PDF Function --- (Now uses passed-in keys)
async function processSinglePdf(fileToProcess, mistralKey, translationKey, translationModel) {
    let currentMarkdownContent = '';
    let currentTranslationContent = '';
    let currentImagesData = [];
    let fileId = null; // Keep track of the uploaded file ID
    const logPrefix = `[${fileToProcess.name}]`; // Use a prefix for logs

    try {
        addProgressLog(`${logPrefix} 开始处理 (使用 Mistral Key: ...${mistralKey ? mistralKey.slice(-4) : 'N/A'})`);
        // updateProgress(`${logPrefix} 准备上传...`, 10); // Individual file progress is less meaningful now

        if (!mistralKey || mistralKey.length < 20) { // Basic sanity check
            throw new Error('无效的 Mistral API Key 提供给处理函数');
        }

        const formData = new FormData();
        formData.append('file', fileToProcess);
        formData.append('purpose', 'ocr');

        addProgressLog(`${logPrefix} 开始上传到 Mistral...`);
        // updateProgress(`${logPrefix} 上传中...`, 20);

        // 1. Upload File
        let response = await fetch('https://api.mistral.ai/v1/files', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${mistralKey}` },
            body: formData
        });

        if (!response.ok) {
            const errorInfo = await getApiError(response, '文件上传失败');
            addProgressLog(`${logPrefix} 上传失败: ${response.status} - ${errorInfo}`);
            if (response.status === 401) throw new Error(`Mistral API Key (...${mistralKey.slice(-4)}) 无效或未授权`);
            throw new Error(`文件上传失败 (${response.status}): ${errorInfo}`);
        }

        const fileData = await response.json();
        if (!fileData || !fileData.id) throw new Error('上传成功但未返回有效的文件ID');
        fileId = fileData.id; // Store the file ID
        addProgressLog(`${logPrefix} 上传成功, File ID: ${fileId}`);
        // updateProgress(`${logPrefix} 获取签名URL...`, 30);

        // Small delay before getting URL
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Get Signed URL
        const urlEndpoint = `https://api.mistral.ai/v1/files/${fileId}/url?expiry=24`;
        response = await fetch(urlEndpoint, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${mistralKey}`, 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorInfo = await getApiError(response, '获取签名URL失败');
            addProgressLog(`${logPrefix} 获取签名URL失败: ${response.status} - ${errorInfo}`);
            throw new Error(`获取签名URL失败 (${response.status}): ${errorInfo}`);
        }

        const urlData = await response.json();
        if (!urlData || !urlData.url) throw new Error('获取的签名URL格式不正确');
        const signedUrl = urlData.url;
        addProgressLog(`${logPrefix} 成功获取文件访问URL`);
        // updateProgress(`${logPrefix} OCR 处理中...`, 40);

        // 3. Perform OCR
        response = await fetch('https://api.mistral.ai/v1/ocr', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${mistralKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model: 'mistral-ocr-latest',
                document: { type: "document_url", document_url: signedUrl },
                include_image_base64: true
            })
        });

        if (!response.ok) {
            const errorInfo = await getApiError(response, 'OCR处理失败');
            addProgressLog(`${logPrefix} OCR处理失败: ${response.status} - ${errorInfo}`);
            throw new Error(`OCR处理失败 (${response.status}): ${errorInfo}`);
        }

        const ocrData = await response.json();
        if (!ocrData || !ocrData.pages) throw new Error('OCR处理成功但返回的数据格式不正确');

        addProgressLog(`${logPrefix} OCR 完成, 生成 Markdown...`);
        // updateProgress(`${logPrefix} 生成 Markdown...`, 50);

        // 4. Process OCR Results (extract markdown and images)
        const processedOcr = processOcrResults(ocrData); // Now returns markdown and images
        currentMarkdownContent = processedOcr.markdown;
        currentImagesData = processedOcr.images;
        addProgressLog(`${logPrefix} Markdown 生成完成`);
        // updateProgress(`${logPrefix} Markdown 完成`, 60);

        // 5. Translate if needed
        if (translationModel !== 'none') {
            if (!translationKey) {
                // This check might be redundant if the main loop ensures a key is passed when needed,
                // but good for robustness.
                addProgressLog(`${logPrefix} 警告: 需要翻译但未提供有效的翻译 API Key。`);
                // Optionally decide whether to proceed without translation or throw error
                // For now, just log and skip translation
            } else {
                 addProgressLog(`${logPrefix} 开始翻译 (${translationModel}) (使用 Key: ...${translationKey.slice(-4)})`);
                 // updateProgress(`${logPrefix} 翻译中...`, 70);

                const estimatedTokens = estimateTokenCount(currentMarkdownContent);
                const tokenLimit = parseInt(maxTokensPerChunk.value) || 2000;

                if (estimatedTokens > tokenLimit * 1.2) { // Add a buffer before splitting
                    addProgressLog(`${logPrefix} 文档较大 (~${Math.round(estimatedTokens/1000)}K tokens), 进行分段翻译`);
                    currentTranslationContent = await translateLongDocument(
                        currentMarkdownContent,
                        targetLanguage.value,
                        translationModel,
                        translationKey, // Pass the specific key for this task
                        logPrefix // Pass file context for logging
                    );
                } else {
                    addProgressLog(`${logPrefix} 文档较小 (~${Math.round(estimatedTokens/1000)}K tokens), 直接翻译`);
                    currentTranslationContent = await translateMarkdown(
                        currentMarkdownContent,
                        targetLanguage.value,
                        translationModel,
                        translationKey, // Pass the specific key for this task
                        logPrefix // Pass file context for logging
                    );
                }
                addProgressLog(`${logPrefix} 翻译完成`);
                // updateProgress(`${logPrefix} 翻译完成`, 95);
            }
        } else {
            addProgressLog(`${logPrefix} 不需要翻译`);
        }

        // updateProgress(`${logPrefix} 文件处理完成!`, 100);

        // Return results for this file
        return {
            file: fileToProcess,
            markdown: currentMarkdownContent,
            translation: currentTranslationContent,
            images: currentImagesData,
            error: null
        };

    } catch (error) {
        console.error(`处理文件 ${fileToProcess.name} 时出错:`, error);
        addProgressLog(`${logPrefix} 错误: ${error.message}`);
        // updateProgress(`${logPrefix} 处理失败`, 100); // Mark progress as failed for this file
        // Return error information
        return {
            file: fileToProcess,
            markdown: null,
            translation: null,
            images: [],
            error: error.message
        };
    } finally {
        // Clean up the uploaded file on Mistral, regardless of success or failure
        if (fileId && mistralKey) { // Ensure we have a key to use for deletion
            try {
                await deleteMistralFile(fileId, mistralKey);
                addProgressLog(`${logPrefix} 已清理 Mistral 上的临时文件 (ID: ${fileId})`);
            } catch (deleteError) {
                console.warn(`${logPrefix} 无法清理 Mistral 文件 ${fileId}:`, deleteError);
                addProgressLog(`${logPrefix} 清理 Mistral 文件 ${fileId} 失败: ${deleteError.message}`);
                // Don't throw an error here, just log the warning
            }
        }
    }
}

// Helper to get error message from API response
async function getApiError(response, defaultMessage) {
    let errorInfo = defaultMessage;
    try {
        const responseText = await response.text();
        console.error('API Error Response Text:', responseText); // Log raw response
        try {
            const jsonError = JSON.parse(responseText);
            // Try common error message locations
            errorInfo = jsonError.error?.message || jsonError.message || jsonError.detail || JSON.stringify(jsonError);
        } catch (e) {
            errorInfo = responseText || `HTTP ${response.status} ${response.statusText}`;
        }
    } catch (e) {
        errorInfo = `${defaultMessage} (HTTP ${response.status} ${response.statusText})`;
    }
    // Limit length of error message
    return errorInfo.substring(0, 300) + (errorInfo.length > 300 ? '...' : '');
}

// Helper to delete a file from Mistral
async function deleteMistralFile(fileId, apiKey) {
    const deleteUrl = `https://api.mistral.ai/v1/files/${fileId}`;
    const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) {
        const errorInfo = await getApiError(response, '文件删除失败');
        // Don't throw here, let the caller decide
        console.warn(`Failed to delete file ${fileId}: ${response.status} - ${errorInfo}`);
        // Optionally return the error or just let it log
    }
    // Optionally check response.json() for { "id": "...", "object": "file.deleted", "deleted": true }
}

// Process OCR results - Now returns markdown and images
function processOcrResults(ocrResponse) {
    let markdownContent = '';
    let imagesData = []; // Store { id: string, data: string (base64) }

    try {
        for (const page of ocrResponse.pages) {
            const pageImages = {}; // Map image ID to its path within the eventual ZIP

            if (page.images && Array.isArray(page.images)) {
                for (const img of page.images) {
                    if (img.id && img.image_base64) {
                        const imgId = img.id;
                        const imgData = img.image_base64; // This is just the base64 part
                        imagesData.push({ id: imgId, data: imgData });
                        // Path used in markdown, relative to the markdown file inside the zip
                        pageImages[imgId] = `images/${imgId}.png`;
                    }
                }
            }

            let pageMarkdown = page.markdown || '';

            // Replace local image references in markdown with the relative path
            for (const [imgName, imgPath] of Object.entries(pageImages)) {
                // Regex needs to handle potential markdown image syntax variations
                // Matches ![alt_text](image_id) or ![image_id](image_id)
                const imgRegex = new RegExp(`!\\[([^\\]]*?)\\]\\(${imgName}\\)`, 'g');
                pageMarkdown = pageMarkdown.replace(imgRegex, (match, altText) => {
                    // Keep original alt text if present, otherwise use image id
                    const finalAltText = altText || imgName;
                    return `![${finalAltText}](${imgPath})`;
                });
            }

            markdownContent += pageMarkdown + '\n\n';
        }

        return { markdown: markdownContent.trim(), images: imagesData };
    } catch (error) {
        console.error('处理OCR结果时出错:', error);
        // Return empty results on error to avoid breaking the entire batch
        return { markdown: '', images: [] };
    }
}

// Translate Markdown - Added context and uses passed-in apiKey
async function translateMarkdown(markdownText, targetLang, model, apiKey, logContext = "") {
    try {
        const content = markdownText;
        const lang = targetLang;
        const selectedModel = model;
        const key = apiKey; // Use the passed-in key

        if (!content) throw new Error('没有要翻译的内容');
        if (!key) {
            // This might happen if getTranslationKey returned null
            addProgressLog(`${logContext} 警告: 尝试翻译但没有有效的 API Key。`);
            return `> [翻译跳过：缺少 API Key]\n\n${content}`;
        }
        if (selectedModel === 'none') return content; // No translation needed

        const actualLang = lang === 'chinese' ? 'zh' : lang;
        const sourceLang = actualLang === 'zh' ? '英文' : '中文';
        const targetLangName = actualLang === 'zh' ? '中文' : '英文';

        const translationPromptTemplate = `Please translate the following ${sourceLang} text into ${targetLangName}. Follow these instructions precisely:
1.  **Preserve Markdown:** Maintain all original Markdown syntax elements (e.g., #, *, **, [], (), ![](), \`\`, $$...$$). Do not alter the structure.
2.  **Accurate Terminology:** Translate technical and academic terms accurately. If a standard translation is unavailable or ambiguous, you may keep the original term in parentheses after the translation.
3.  **Paragraph Structure:** Keep the original paragraph breaks and formatting.
4.  **Content Only:** Output only the translated text. Do not add any introductory phrases, concluding remarks, or explanations about the translation process itself.
5.  **Code Blocks:** Preserve code blocks (\`\`\`...\`\`\`) exactly as they are, without translating their content.
6.  **Inline Code:** Preserve inline code (\`...\`) exactly as it is.
7.  **Math Formulas:** Preserve LaTeX math formulas within $$...$$ or $...$ delimiters exactly as they are.
8.  **Image Links:** Preserve Markdown image links like ![alt text](path/to/image.png) exactly. Do not translate alt text or paths.
9.  **HTML Tags:** Preserve any HTML tags present in the text.

Translate the following document content:

${content}`;

        const temperature = 0.5;
        const maxTokens = 100000; // Note: Actual limit depends on the model
        const sys_prompt = `You are a professional document translator specializing in ${sourceLang} to ${targetLangName} translation. Your primary goal is to provide an accurate translation while strictly preserving the original Markdown formatting, code blocks, math formulas, and image links.`;

        const apiConfigs = {
            'deepseek': {
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                modelName: 'DeepSeek v3',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                bodyBuilder: () => ({
                    model: "deepseek-chat", // Use the chat model ID
                    messages: [{ role: "system", content: sys_prompt }, { role: "user", content: translationPromptTemplate }],
                    temperature: temperature, max_tokens: 8000 // Adjusted max_tokens
                }),
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            'gemini': {
                // Correct endpoint for v1beta (Flash model often here)
                endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`,
                modelName: 'Google Gemini 1.5 Flash',
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: () => ({
                    contents: [{ role: "user", parts: [{ text: translationPromptTemplate }] }],
                    generationConfig: { temperature: temperature, maxOutputTokens: 8192 } // Gemini uses maxOutputTokens
                }),
                responseExtractor: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text
            },
            'claude': {
                endpoint: 'https://api.anthropic.com/v1/messages',
                modelName: 'Claude 3.5 Sonnet',
                headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
                bodyBuilder: () => ({
                    // Claude 3.5 Sonnet ID confirmed
                    model: "claude-3-5-sonnet-20240620",
                    system: sys_prompt, // Claude uses 'system' parameter
                    messages: [{ role: "user", content: translationPromptTemplate }],
                    temperature: temperature, max_tokens: 8000 // Adjusted max_tokens for Claude 3.5 Sonnet
                }),
                responseExtractor: (data) => data?.content?.[0]?.text
            },
            'mistral': {
                endpoint: 'https://api.mistral.ai/v1/chat/completions',
                modelName: 'Mistral Large',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                bodyBuilder: () => ({
                    // Use the latest recommended model
                    model: "mistral-large-latest",
                    messages: [{ role: "system", content: sys_prompt }, { role: "user", content: translationPromptTemplate }],
                    temperature: temperature, max_tokens: 8000 // Adjusted max_tokens
                }),
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            'tongyi-deepseek-v3': {
                endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
                modelName: '阿里云通义 DeepSeek v3',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                bodyBuilder: () => ({
                    model: "deepseek-v3",
                    messages: [{ role: "system", content: sys_prompt }, { role: "user", content: translationPromptTemplate }],
                    temperature: temperature, max_tokens: 8000
                }),
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            'volcano-deepseek-v3': {
                // Endpoint needs verification for DeepSeek v3 on Volcano
                endpoint: 'https://api.volcengine.com/ml/api/v1/open/llm/inference',
                modelName: '火山引擎 DeepSeek v3',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                bodyBuilder: () => ({
                    // Model ID might differ on Volcano, needs confirmation
                    model: { name: "deepseek-v3" }, // Example structure, check Volcano docs
                    messages: [{ role: "system", content: sys_prompt }, { role: "user", content: translationPromptTemplate }],
                    parameters: { temperature: temperature, max_tokens: 8000 }
                }),
                responseExtractor: (data) => data?.choices?.[0]?.message?.content // Check response structure
            },
            'custom': {
                createConfig: () => {
                    const customModelName = document.getElementById('customModelName').value.trim();
                    const customApiEndpoint = document.getElementById('customApiEndpoint').value.trim();
                    const customModelId = document.getElementById('customModelId').value.trim();
                    const customRequestFormat = document.getElementById('customRequestFormat').value;

                    if (!customModelName || !customApiEndpoint || !customModelId) {
                        throw new Error('请填写完整的自定义模型信息');
                    }

                    const config = {
                        endpoint: customApiEndpoint,
                        modelName: customModelName,
                        headers: { 'Content-Type': 'application/json' },
                        bodyBuilder: null,
                        responseExtractor: null
                    };

                    // Simplified Authorization/API Key header handling
                    if (customApiEndpoint.includes('anthropic')) {
                        config.headers['x-api-key'] = key;
                        config.headers['anthropic-version'] = '2023-06-01'; // Or latest if needed
                    } else if (customApiEndpoint.includes('google')) {
                        // Gemini typically uses key in URL, but some proxy might need header
                        // config.headers['Authorization'] = `Bearer ${key}`; // Or other header if needed
                    } else { // Assume Bearer token for others (OpenAI, Mistral, etc.)
                        config.headers['Authorization'] = `Bearer ${key}`;
                    }

                    switch (customRequestFormat) {
                        case 'openai':
                            config.bodyBuilder = () => ({
                                model: customModelId,
                                messages: [{ role: "system", content: sys_prompt }, { role: "user", content: translationPromptTemplate }],
                                temperature: temperature, max_tokens: 8000
                            });
                            config.responseExtractor = (data) => data?.choices?.[0]?.message?.content;
                            break;
                        case 'anthropic':
                            config.bodyBuilder = () => ({
                                model: customModelId,
                                system: sys_prompt,
                                messages: [{ role: "user", content: translationPromptTemplate }],
                                temperature: temperature, max_tokens: 8000
                            });
                            config.responseExtractor = (data) => data?.content?.[0]?.text;
                            break;
                        case 'gemini':
                            config.bodyBuilder = () => ({
                                contents: [{ role: "user", parts: [{ text: translationPromptTemplate }] }],
                                generationConfig: { temperature: temperature, maxOutputTokens: 8192 }
                            });
                            config.responseExtractor = (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text;
                            break;
                        default:
                            throw new Error(`不支持的自定义请求格式: ${customRequestFormat}`);
                    }
                    return config;
                }
            }
        };

        const apiConfig = apiConfigs[selectedModel];
        if (!apiConfig) throw new Error(`不支持的翻译模型: ${selectedModel}`);

        let effectiveConfig;
        let modelDisplayName;
        if (selectedModel === 'custom') {
            effectiveConfig = apiConfig.createConfig();
            modelDisplayName = effectiveConfig.modelName;
        } else {
            effectiveConfig = apiConfig;
            modelDisplayName = apiConfig.modelName;
        }

        addProgressLog(`${logContext} 调用 ${modelDisplayName} 翻译 API (Key: ...${key.slice(-4)})...`);
        console.log(`${logContext} Calling translation API: ${modelDisplayName} at ${effectiveConfig.endpoint}`);

        const response = await fetch(effectiveConfig.endpoint, {
            method: 'POST',
            headers: effectiveConfig.headers,
            body: JSON.stringify(effectiveConfig.bodyBuilder())
        });

        if (!response.ok) {
            const errorText = await getApiError(response, '翻译API返回错误');
            console.error(`${logContext} API Error (${response.status}): ${errorText}`);
            throw new Error(`翻译 API 返回错误 (${response.status}) (Key: ...${key.slice(-4)})`); // Simplified error for user
        }

        const data = await response.json();
        // console.log(`${logContext} Translation API Response Data:`, data); // Log raw response data for debugging

        const translatedContent = effectiveConfig.responseExtractor(data);

        if (translatedContent === null || translatedContent === undefined) {
            console.error(`${logContext} Failed to extract translation from response:`, data);
            throw new Error('无法从 API 响应中提取翻译内容');
        }

        addProgressLog(`${logContext} ${modelDisplayName} API 调用成功`);
        return translatedContent.trim(); // Trim whitespace

    } catch (error) {
        console.error(`${logContext} 翻译错误:`, error);
        addProgressLog(`${logContext} 错误: 调用 ${model || 'custom'} 翻译 API 失败 - ${error.message}`);
        throw new Error(`调用翻译 API 失败: ${error.message}`); // Re-throw to be caught by the main loop
    }
}

// Long document translation - Added context and uses passed-in apiKey
async function translateLongDocument(markdownText, targetLang, model, apiKey, logContext = "") {
    // Use the refined splitting function
    const parts = splitMarkdownIntoChunks(markdownText, logContext);
    console.log(`${logContext} 文档分割为 ${parts.length} 部分进行翻译`);
    addProgressLog(`${logContext} 文档被分割为 ${parts.length} 部分进行翻译`);

    let translatedChunks = [];
    let hasErrors = false;

    for (let i = 0; i < parts.length; i++) {
        const currentPart = parts[i];
        // Estimate progress more granularly within the translation step (e.g., 70% to 95%)
        // const baseProgress = 70;
        // const progressRange = 25;
        // const partProgress = baseProgress + Math.floor(((i + 1) / parts.length) * progressRange);
        // updateProgress(`翻译中 (部分 ${i + 1}/${parts.length})...`, partProgress);
        addProgressLog(`${logContext} 正在翻译第 ${i + 1}/${parts.length} 部分...`);

        try {
            // Add context and pass the key to the recursive call
            const partResult = await translateMarkdown(currentPart, targetLang, model, apiKey, `${logContext} (Part ${i+1}/${parts.length})`);
            translatedChunks.push(partResult);

            // Optional delay between parts
            if (i < parts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 0.5s delay
            }
        } catch (error) {
            console.error(`${logContext} 第 ${i + 1} 部分翻译失败:`, error);
            addProgressLog(`${logContext} 警告: 第 ${i + 1} 部分翻译失败: ${error.message}. 将保留原文.`);
            // Keep the original part on error
            translatedChunks.push(`\n\n> **[翻译错误 - 保留原文 Part ${i+1}]**\n\n${currentPart}\n\n`);
            hasErrors = true;
        }
    }

    if (hasErrors) {
        addProgressLog(`${logContext} 翻译完成，但部分内容未能成功翻译。`);
    } else {
        addProgressLog(`${logContext} 所有部分翻译完成。`);
    }

    // Merge chunks preserving double newlines which often indicate paragraph breaks
    return translatedChunks.join('\n\n');
}

// --- Markdown Splitting --- (No changes needed here likely)
// Updated Markdown Splitting Logic
// Main function to split markdown
function splitMarkdownIntoChunks(markdown, logContext = "") {
    const tokenLimit = parseInt(maxTokensPerChunk.value) || 2000;
    const estimatedTokens = estimateTokenCount(markdown);
    addProgressLog(`${logContext} 估算总 token 数: ~${estimatedTokens}, 分段限制: ${tokenLimit}`);

    if (estimatedTokens <= tokenLimit * 1.1) { // Allow slight overshoot to avoid unnecessary splits
        addProgressLog(`${logContext} 文档未超过大小限制，不进行分割。`);
        return [markdown];
    }

    addProgressLog(`${logContext} 文档超过大小限制，开始分割...`);
    const lines = markdown.split('\n');
    const chunks = [];
    let currentChunkLines = [];
    let currentTokenCount = 0;
    let inCodeBlock = false;
    const headingRegex = /^(#+)\s+.*/; // Matches any level heading

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTokens = estimateTokenCount(line);

        // Track code blocks
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        let shouldSplit = false;

        // Conditions to split *before* adding the current line:
        if (currentChunkLines.length > 0) {
            // 1. If adding the line exceeds the limit
            if (currentTokenCount + lineTokens > tokenLimit) {
                // Only split if the current chunk isn't tiny (prevents splitting very large single lines/blocks prematurely)
                if (currentTokenCount > tokenLimit * 0.1) {
                    shouldSplit = true;
                    addProgressLog(`${logContext} 分割点: 超过 Token 限制 (${currentTokenCount} + ${lineTokens} > ${tokenLimit}) at line ${i+1}`);
                }
            }
            // 2. If the current line is a major heading (H1/H2) and the chunk is reasonably large, split for logical structure
            //    (and not inside a code block)
            else if (!inCodeBlock && headingRegex.test(line)) {
                const match = line.match(headingRegex);
                if (match && match[1].length <= 2 && currentTokenCount > tokenLimit * 0.5) { // Split on H1/H2 if chunk is >50% full
                    shouldSplit = true;
                    addProgressLog(`${logContext} 分割点: 遇到 H${match[1].length} 标题 and chunk size > 50% (${currentTokenCount}) at line ${i+1}`);
                }
            }
        }

        if (shouldSplit) {
            chunks.push(currentChunkLines.join('\n'));
            currentChunkLines = [];
            currentTokenCount = 0;
        }

        // Add the current line to the chunk
        currentChunkLines.push(line);
        currentTokenCount += lineTokens;
    }

    // Add the last remaining chunk
    if (currentChunkLines.length > 0) {
        chunks.push(currentChunkLines.join('\n'));
    }

    addProgressLog(`${logContext} 初始分割为 ${chunks.length} 个片段.`);

    // Secondary pass: Check if any chunk is still too large (e.g., due to massive code block or image data)
    // This is a simplified fallback; more sophisticated splitting might be needed for extreme cases.
    const finalChunks = [];
    for(let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        const chunkTokens = estimateTokenCount(chunk);
        if (chunkTokens > tokenLimit * 1.1) { // Allow some leeway
            addProgressLog(`${logContext} 警告: 第 ${j+1} 段 (${chunkTokens} tokens) 仍然超过限制 ${tokenLimit}. 可能导致翻译失败或截断.`);
            // Attempt basic split by paragraphs as a fallback
            const subChunks = splitByParagraphs(chunk, tokenLimit, logContext, j+1);
            finalChunks.push(...subChunks);
        } else {
            finalChunks.push(chunk);
        }
    }

    if (finalChunks.length !== chunks.length) {
        addProgressLog(`${logContext} 二次分割后总片段数: ${finalChunks.length}`);
    }

    return finalChunks;
}

// Fallback: Split large chunks by paragraphs
function splitByParagraphs(text, tokenLimit, logContext, chunkIndex) {
    addProgressLog(`${logContext} 对第 ${chunkIndex} 段进行段落分割...`);
    const paragraphs = text.split('\n\n');
    const chunks = [];
    let currentChunkLines = [];
    let currentTokenCount = 0;

    for (const paragraph of paragraphs) {
        const paragraphTokens = estimateTokenCount(paragraph);

        // If a single paragraph is itself too large, add it as its own chunk (further splitting needed)
        if (paragraphTokens > tokenLimit * 1.1) {
            addProgressLog(`${logContext} 警告: 第 ${chunkIndex} 段中的一个段落 (${paragraphTokens} tokens) 超过限制.`);
            // Add previous chunk if exists
            if (currentChunkLines.length > 0) {
                chunks.push(currentChunkLines.join('\n\n'));
            }
            // Add the huge paragraph as its own chunk
            chunks.push(paragraph);
            currentChunkLines = [];
            currentTokenCount = 0;
            continue;
        }

        if (currentTokenCount + paragraphTokens > tokenLimit && currentChunkLines.length > 0) {
            chunks.push(currentChunkLines.join('\n\n'));
            currentChunkLines = [];
            currentTokenCount = 0;
        }

        currentChunkLines.push(paragraph);
        currentTokenCount += paragraphTokens;
    }

    if (currentChunkLines.length > 0) {
        chunks.push(currentChunkLines.join('\n\n'));
    }
    addProgressLog(`${logContext} 第 ${chunkIndex} 段被分割为 ${chunks.length} 个子段落.`);
    return chunks;
}

// Estimate token count (improved slightly)
function estimateTokenCount(text) {
    if (!text) return 0;
    // Simple estimate: words + non-whitespace characters for punctuation/symbols
    const words = text.match(/\b\w+\b/g)?.length || 0;
    // Count non-space, non-alphanumeric characters as potential tokens (crude)
    const symbols = text.replace(/\s+/g, '').replace(/\w/g, '').length;
    // Chinese characters count roughly as 1 token each, adjust estimate
    const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;

    // Weighted estimate (very rough)
    return Math.ceil(words * 1.2 + symbols * 0.8 + chineseChars * 1.1);
}

// --- Local Storage for Processed Files ---

const PROCESSED_FILES_KEY = 'paperBurnerProcessedFiles';

function loadProcessedFilesRecord() {
    try {
        const storedRecord = localStorage.getItem(PROCESSED_FILES_KEY);
        if (storedRecord) {
            processedFilesRecord = JSON.parse(storedRecord);
            console.log("Loaded processed files record:", processedFilesRecord);
        } else {
            processedFilesRecord = {};
        }
    } catch (e) {
        console.error("Failed to load processed files record from localStorage:", e);
        processedFilesRecord = {}; // Reset on error
    }
}

function saveProcessedFilesRecord() {
    try {
        localStorage.setItem(PROCESSED_FILES_KEY, JSON.stringify(processedFilesRecord));
        console.log("Saved processed files record.");
    } catch (e) {
        console.error("Failed to save processed files record to localStorage:", e);
        showNotification("无法保存已处理文件记录到浏览器缓存", "error");
    }
}

function isAlreadyProcessed(fileIdentifier) {
    return processedFilesRecord.hasOwnProperty(fileIdentifier) && processedFilesRecord[fileIdentifier] === true;
}

function markFileAsProcessed(fileIdentifier) {
    processedFilesRecord[fileIdentifier] = true;
    // Saving happens at the end of the batch process
}

// --- Download All Results ---

async function downloadAllResults() {
    // Filter results to only include successful ones before zipping
    const successfulResults = allResults.filter(result => result && !result.error && result.markdown && !result.skipped);

    if (successfulResults.length === 0) {
        showNotification('没有成功的处理结果可供下载', 'warning');
        return;
    }

    addProgressLog('开始打包下载结果...');
    const zip = new JSZip();
    let filesAdded = 0;

    for (const result of successfulResults) { // Iterate over successful results only
        const pdfName = result.file.name.replace(/\.pdf$/i, ''); // Remove .pdf extension
        // Sanitize filename to avoid issues in zip files
        const safeFolderName = pdfName.replace(/[/\\:*?"<>|]/g, '_').substring(0, 100);
        const folder = zip.folder(safeFolderName); // Create a folder for each PDF

        // 1. Add Markdown file
        folder.file('document.md', result.markdown);

        // 2. Add Translation file (if exists)
        if (result.translation) {
            const currentDate = new Date().toISOString().split('T')[0];
            const headerDeclaration = `> *本文档由 Paper Burner 工具制作 (${currentDate})。内容由 AI 大模型翻译生成，不保证翻译内容的准确性和完整性。*\n\n`;
            const footerDeclaration = `\n\n---\n> *免责声明：本文档内容由大模型API自动翻译生成，Paper Burner 工具不对翻译内容的准确性、完整性和合法性负责。*`;
            const contentToDownload = headerDeclaration + result.translation + footerDeclaration;
            folder.file('translation.md', contentToDownload);
        }

        // 3. Add Images (if any)
        if (result.images && result.images.length > 0) {
            const imagesFolder = folder.folder('images');
            for (const img of result.images) {
                try {
                    // Ensure the data is just the base64 part
                    const base64Data = img.data.includes(',') ? img.data.split(',')[1] : img.data;
                    if (base64Data) {
                        imagesFolder.file(`${img.id}.png`, base64Data, { base64: true });
                    } else {
                        console.warn(`Skipping image ${img.id} in ${safeFolderName} due to missing data.`);
                    }
                } catch (imgError) {
                    console.error(`Error adding image ${img.id} to zip for ${safeFolderName}:`, imgError);
                    addProgressLog(`警告: 打包图片 ${img.id} (文件: ${safeFolderName}) 时出错: ${imgError.message}`);
                }
            }
        }
        filesAdded++;
    }

    if (filesAdded === 0) { // Should not happen if successfulResults.length > 0, but good check
        showNotification('没有成功处理的文件可以打包下载', 'warning');
        addProgressLog('没有可打包的文件。');
        return;
    }

    try {
        addProgressLog(`正在生成包含 ${filesAdded} 个文件结果的 ZIP 包...`);
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: "DEFLATE",
            compressionOptions: {
                level: 6 // Adjust compression level (1-9) as needed
            }
        }, (metadata) => {
            // Optional: Update progress during zip generation
            // updateProgress(`压缩中... ${metadata.percent.toFixed(0)}%`, 95 + (metadata.percent / 10));
            // console.log(`Zipping progress: ${metadata.percent.toFixed(2)} %`);
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        saveAs(zipBlob, `PaperBurner_Results_${timestamp}.zip`);
        addProgressLog('ZIP 文件生成完毕，开始下载。');
    } catch (error) {
        console.error('创建或下载 ZIP 文件失败:', error);
        showNotification('创建 ZIP 文件失败: ' + error.message, 'error');
        addProgressLog('错误: 创建 ZIP 文件失败 - ' + error.message);
    }
}

// --- Settings Load/Save ---

function saveSettings() {
    const settings = {
        maxTokensPerChunk: maxTokensPerChunk.value,
        skipProcessedFiles: skipProcessedFilesCheckbox.checked,
        selectedTranslationModel: translationModelSelect.value,
        concurrencyLevel: concurrencyLevelInput.value // Save concurrency level
    };

    if (translationModelSelect.value === 'custom') {
        settings.customModelSettings = {
            modelName: document.getElementById('customModelName').value,
            apiEndpoint: document.getElementById('customApiEndpoint').value,
            modelId: document.getElementById('customModelId').value,
            requestFormat: document.getElementById('customRequestFormat').value
        };
    }

    try {
        localStorage.setItem('paperBurnerSettings', JSON.stringify(settings));
    } catch (e) {
        console.error('保存设置失败:', e);
        showNotification('无法保存设置到浏览器缓存', 'error');
    }
}

function loadSettings() {
    try {
        const storedSettings = localStorage.getItem('paperBurnerSettings');
        if (storedSettings) {
            const settings = JSON.parse(storedSettings);

            // Load advanced settings
            if (settings.maxTokensPerChunk) {
                maxTokensPerChunk.value = settings.maxTokensPerChunk;
                maxTokensPerChunkValue.textContent = settings.maxTokensPerChunk;
            }
            if (settings.hasOwnProperty('skipProcessedFiles')) { // Check property existence
                skipProcessedFilesCheckbox.checked = settings.skipProcessedFiles;
            } else {
                skipProcessedFilesCheckbox.checked = false; // Default to false if not found
            }
            if (settings.concurrencyLevel) { // Load concurrency level
                concurrencyLevelInput.value = settings.concurrencyLevel;
            } else {
                concurrencyLevelInput.value = 1; // Default to 1 if not found
            }

            // Load selected translation model
            if (settings.selectedTranslationModel) {
                translationModelSelect.value = settings.selectedTranslationModel;
            }

            // Load custom model settings if applicable
            if (settings.selectedTranslationModel === 'custom' && settings.customModelSettings) {
                const cms = settings.customModelSettings;
                document.getElementById('customModelName').value = cms.modelName || '';
                document.getElementById('customApiEndpoint').value = cms.apiEndpoint || '';
                document.getElementById('customModelId').value = cms.modelId || '';
                document.getElementById('customRequestFormat').value = cms.requestFormat || 'openai';
                // Ensure UI is visible
                customModelSettingsContainer.classList.remove('hidden');
                customModelSettings.classList.remove('hidden');
            } else {
                // Ensure UI is hidden if not custom
                customModelSettingsContainer.classList.add('hidden');
                customModelSettings.classList.add('hidden');
            }
            // Update UI elements based on loaded settings
            updateTranslationUIVisibility();
        }
    } catch (e) {
        console.error('加载设置失败:', e);
        // Apply defaults or leave as is
        skipProcessedFilesCheckbox.checked = false; // Default skip to false on load error
        concurrencyLevelInput.value = 1; // Default concurrency to 1 on load error
    }
}
