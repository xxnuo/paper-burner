// 全局变量
let pdfFile = null;
let markdownContent = '';
let translationContent = '';
let imagesData = [];

// DOM 元素
const mistralApiKeyInput = document.getElementById('mistralApiKey');
const toggleMistralKeyBtn = document.getElementById('toggleMistralKey');
const rememberMistralKeyCheckbox = document.getElementById('rememberMistralKey');
const translationApiKeyInput = document.getElementById('translationApiKey');
const toggleTranslationKeyBtn = document.getElementById('toggleTranslationKey');
const rememberTranslationKeyCheckbox = document.getElementById('rememberTranslationKey');

const translationModelSelect = document.getElementById('translationModel');
const customModelSettings = document.getElementById('customModelSettings');

// 高级设置相关
const advancedSettingsToggle = document.getElementById('advancedSettingsToggle');
const advancedSettings = document.getElementById('advancedSettings');
const advancedSettingsIcon = document.getElementById('advancedSettingsIcon');
const maxTokensPerChunk = document.getElementById('maxTokensPerChunk');
const maxTokensPerChunkValue = document.getElementById('maxTokensPerChunkValue');

// 文件上传相关
const dropZone = document.getElementById('dropZone');
const pdfFileInput = document.getElementById('pdfFileInput');
const browseFilesBtn = document.getElementById('browseFilesBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');

// 翻译相关
const targetLanguage = document.getElementById('targetLanguage');

// 按钮
const processBtn = document.getElementById('processBtn');
const downloadMarkdownBtn = document.getElementById('downloadMarkdownBtn');
const downloadTranslationBtn = document.getElementById('downloadTranslationBtn');

// 结果展示
const resultsSection = document.getElementById('resultsSection');
const markdownPreview = document.getElementById('markdownPreview');
const translationPreview = document.getElementById('translationPreview');
const translationResultCard = document.getElementById('translationResultCard');

// 进度相关
const progressSection = document.getElementById('progressSection');
const progressStep = document.getElementById('progressStep');
const progressPercentage = document.getElementById('progressPercentage');
const progressBar = document.getElementById('progressBar');
const progressLog = document.getElementById('progressLog');

document.addEventListener('DOMContentLoaded', () => {
    // 初始化 - 从本地存储加载 API Key
    if (localStorage.getItem('mistralApiKey')) {
        mistralApiKeyInput.value = localStorage.getItem('mistralApiKey');
        rememberMistralKeyCheckbox.checked = true;
    }

    if (localStorage.getItem('translationApiKey')) {
        translationApiKeyInput.value = localStorage.getItem('translationApiKey');
        rememberTranslationKeyCheckbox.checked = true;
    }

    // 加载设置
    loadSettings();

    // API Key 显示/隐藏切换
    toggleMistralKeyBtn.addEventListener('click', () => {
        if (mistralApiKeyInput.type === 'password') {
            mistralApiKeyInput.type = 'text';
            toggleMistralKeyBtn.innerHTML = '<iconify-icon icon="carbon:view-off" width="20"></iconify-icon>';
        } else {
            mistralApiKeyInput.type = 'password';
            toggleMistralKeyBtn.innerHTML = '<iconify-icon icon="carbon:view" width="20"></iconify-icon>';
        }
    });

    toggleTranslationKeyBtn.addEventListener('click', () => {
        if (translationApiKeyInput.type === 'password') {
            translationApiKeyInput.type = 'text';
            toggleTranslationKeyBtn.innerHTML = '<iconify-icon icon="carbon:view-off" width="20"></iconify-icon>';
        } else {
            translationApiKeyInput.type = 'password';
            toggleTranslationKeyBtn.innerHTML = '<iconify-icon icon="carbon:view" width="20"></iconify-icon>';
        }
    });

    // API Key 记住选项
    rememberMistralKeyCheckbox.addEventListener('change', () => {
        if (rememberMistralKeyCheckbox.checked) {
            localStorage.setItem('mistralApiKey', mistralApiKeyInput.value);
        } else {
            localStorage.removeItem('mistralApiKey');
        }
    });

    rememberTranslationKeyCheckbox.addEventListener('change', () => {
        if (rememberTranslationKeyCheckbox.checked) {
            localStorage.setItem('translationApiKey', translationApiKeyInput.value);
        } else {
            localStorage.removeItem('translationApiKey');
        }
    });

    mistralApiKeyInput.addEventListener('input', () => {
        if (rememberMistralKeyCheckbox.checked) {
            localStorage.setItem('mistralApiKey', mistralApiKeyInput.value);
        }
    });

    translationApiKeyInput.addEventListener('input', () => {
        if (rememberTranslationKeyCheckbox.checked) {
            localStorage.setItem('translationApiKey', translationApiKeyInput.value);
        }
    });

    // PDF 文件拖放上传
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500', 'bg-blue-50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        
        if (e.dataTransfer.files.length > 0 && e.dataTransfer.files[0].type === 'application/pdf') {
            handleFileSelection(e.dataTransfer.files[0]);
        } else {
            showNotification('请上传PDF文件', 'error');
        }
    });

    // 浏览文件按钮
    browseFilesBtn.addEventListener('click', () => {
        pdfFileInput.click();
    });

    // 文件选择处理
    pdfFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    // 移除文件
    removeFileBtn.addEventListener('click', () => {
        pdfFile = null;
        fileInfo.classList.add('hidden');
        pdfFileInput.value = '';
        updateProcessButtonState();
    });

    // 处理按钮
    processBtn.addEventListener('click', async () => {
        try {
            const mistralKey = mistralApiKeyInput.value.trim();
            
            if (!mistralKey) {
                showNotification('请输入Mistral API Key', 'error');
                return;
            }

            if (!pdfFile) {
                showNotification('请上传PDF文件', 'error');
                return;
            }

            // 开始处理
            processBtn.disabled = true;
            showProgressSection();
            updateProgress('开始处理...', 5);
            addProgressLog('开始OCR处理...');
            
            try {
                // 执行OCR处理
                await processPdfWithMistral(mistralKey);
                
                // 如果选择了翻译，则执行翻译
                if (translationModelSelect.value !== 'none') {
                    const translationKey = translationApiKeyInput.value.trim();
                    if (translationModelSelect.value !== 'none' && !translationKey) {
                        showNotification('请输入翻译API Key', 'error');
                        updateProgress('翻译需要API Key', 100);
                        addProgressLog('错误: 缺少翻译API Key');
                        processBtn.disabled = false;
                        return;
                    }
                    updateProgress('开始翻译...', 60);
                    addProgressLog(`使用${translationModelSelect.value}模型进行翻译...`);
                    
                    // 获取文档大小估计
                    const estimatedTokens = estimateTokenCount(markdownContent);
                    const tokenLimit = 8192; // 设置一个安全的token限制
                    
                    if (estimatedTokens > tokenLimit) {
                        // 使用分段翻译
                        addProgressLog(`文档较大(~${Math.round(estimatedTokens/1000)}K tokens)，将进行分段翻译`);
                        translationContent = await translateLongDocument(markdownContent, targetLanguage.value, translationModelSelect.value, translationKey);
                    } else {
                        // 直接翻译
                        addProgressLog(`文档较小(~${Math.round(estimatedTokens/1000)}K tokens)，不分段直接翻译`);
                        translationContent = await translateMarkdown(markdownContent, targetLanguage.value, translationModelSelect.value, translationKey);
                    }
                }

                // 显示结果
                updateProgress('处理完成!', 100);
                addProgressLog('全部处理完成!');
                showResultsSection();
            } catch (error) {
                console.error('处理错误:', error);
                showNotification('处理过程中出错: ' + error.message, 'error');
                addProgressLog('错误: ' + error.message);
                updateProgress('处理失败', 100);
            } finally {
                processBtn.disabled = false;
            }
        } catch (error) {
            console.error('处理错误:', error);
            showNotification('处理过程中出错: ' + error.message, 'error');
            addProgressLog('错误: ' + error.message);
            updateProgress('处理失败', 100);
            processBtn.disabled = false;
        }
    });

    // 下载按钮
    downloadMarkdownBtn.addEventListener('click', () => {
        if (markdownContent) {
            downloadMarkdownWithImages();
        }
    });

    downloadTranslationBtn.addEventListener('click', () => {
        if (translationContent) {
            //downloadText(translationContent, 'translation.md');
            downloadTranslationWithImages();
        }
    });

    // 翻译模型变更
    translationModelSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customModelSettings.classList.remove('hidden');
        } else {
            customModelSettings.classList.add('hidden');
        }
        
        // 更新翻译界面可见性
        updateTranslationUIVisibility();
        
        // 保存设置
        saveSettings();
    });
    
    // 高级设置开关
    advancedSettingsToggle.addEventListener('click', function() {
        advancedSettings.classList.toggle('hidden');
        
        // 更新图标方向
        if (advancedSettings.classList.contains('hidden')) {
            advancedSettingsIcon.setAttribute('icon', 'carbon:chevron-down');
        } else {
            advancedSettingsIcon.setAttribute('icon', 'carbon:chevron-up');
        }
        
        // 保存设置
        saveSettings();
    });
    
    // 最大Token数设置滑动条
    maxTokensPerChunk.addEventListener('input', function() {
        maxTokensPerChunkValue.textContent = this.value;
        saveSettings();
    });

    // 为自定义模型设置添加变更事件监听器
    const customModelInputs = [
        document.getElementById('customModelName'),
        document.getElementById('customApiEndpoint'),
        document.getElementById('customModelId'),
        document.getElementById('customRequestFormat')
    ];
    
    customModelInputs.forEach(input => {
        input.addEventListener('change', function() {
            saveSettings();
        });
        // 同时监听输入事件，实时保存
        input.addEventListener('input', function() {
            saveSettings();
        });
    });

    // 初始化 UI 状态
    updateProcessButtonState();
    updateTranslationUIVisibility();
});

// 辅助函数
function handleFileSelection(file) {
    pdfFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').classList.remove('hidden');
    updateProcessButtonState();
}

function updateProcessButtonState() {
    const mistralKey = document.getElementById('mistralApiKey').value.trim();
    const processBtn = document.getElementById('processBtn');
    processBtn.disabled = !pdfFile || !mistralKey;
}

function updateTranslationUIVisibility() {
    const translationModelValue = translationModelSelect.value;

    // 如果选择了翻译模型，显示API Key输入框和提示
    const translationApiKeySection = document.querySelector('#translationApiKey').closest('div').parentNode;
    if (translationModelValue !== 'none') {
        translationApiKeySection.style.display = 'block';
    } else {
        translationApiKeySection.style.display = 'none';
    }
}

function showResultsSection() {
    document.getElementById('progressSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');
    
    // 显示Markdown内容
    document.getElementById('markdownPreview').textContent = markdownContent.substring(0, 500) + '...';
    
    // 显示翻译内容（如果有）
    if (translationContent) {
        document.getElementById('translationPreview').textContent = translationContent.substring(0, 500) + '...';
        document.getElementById('translationResultCard').classList.remove('hidden');
    } else {
        document.getElementById('translationResultCard').classList.add('hidden');
    }
    
    window.scrollTo({
        top: document.getElementById('resultsSection').offsetTop - 20,
        behavior: 'smooth'
    });
}

function showProgressSection() {
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('progressSection').classList.remove('hidden');
    document.getElementById('progressLog').innerHTML = '';
    updateProgress('初始化...', 0);
    
    window.scrollTo({
        top: document.getElementById('progressSection').offsetTop - 20,
        behavior: 'smooth'
    });
}

function updateProgress(stepText, percentage) {
    document.getElementById('progressStep').textContent = stepText;
    document.getElementById('progressPercentage').textContent = `${percentage}%`;
    document.getElementById('progressBar').style.width = `${percentage}%`;
}

function addProgressLog(text) {
    const logElement = document.getElementById('progressLog');
    const timestamp = new Date().toLocaleTimeString();
    logElement.innerHTML += `<div>[${timestamp}] ${text}</div>`;
    logElement.scrollTop = logElement.scrollHeight;
}

function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    
    // 根据类型设置样式和图标
    let bgColor, iconName, textColor;
    switch (type) {
        case 'success':
            bgColor = 'bg-green-50 border-green-500';
            textColor = 'text-green-800';
            iconName = 'carbon:checkmark-filled';
            break;
        case 'error':
            bgColor = 'bg-red-50 border-red-500';
            textColor = 'text-red-800';
            iconName = 'carbon:error-filled';
            break;
        case 'warning':
            bgColor = 'bg-yellow-50 border-yellow-500';
            textColor = 'text-yellow-800';
            iconName = 'carbon:warning-filled';
            break;
        default: // info
            bgColor = 'bg-blue-50 border-blue-500';
            textColor = 'text-blue-800';
            iconName = 'carbon:information-filled';
    }
    
    // 设置通知样式
    notification.className = `flex items-center p-4 mb-4 max-w-md border-l-4 ${bgColor} ${textColor} shadow-md rounded-r-lg transform transition-all duration-300 ease-in-out`;
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    
    // 设置通知内容
    notification.innerHTML = `
        <iconify-icon icon="${iconName}" class="flex-shrink-0 w-5 h-5 mr-2"></iconify-icon>
        <div class="ml-3 text-sm font-medium flex-grow">${message}</div>
        <button type="button" class="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 hover:bg-gray-200 focus:ring-2 focus:ring-gray-400">
            <iconify-icon icon="carbon:close" class="w-5 h-5"></iconify-icon>
        </button>
    `;
    
    // 获取通知容器
    const container = document.getElementById('notification-container');
    container.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // 添加关闭按钮点击事件
    const closeButton = notification.querySelector('button');
    closeButton.addEventListener('click', () => {
        closeNotification(notification);
    });
    
    // 自动关闭（5秒后）
    const timeout = setTimeout(() => {
        closeNotification(notification);
    }, 5000);
    
    // 保存timeout引用，以便可以在手动关闭时清除
    notification.dataset.timeout = timeout;
    
    // 返回通知元素，以便可以手动关闭
    return notification;
}

// 关闭通知的辅助函数
function closeNotification(notification) {
    // 清除自动关闭的timeout
    clearTimeout(notification.dataset.timeout);
    
    // 淡出动画
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    
    // 动画完成后移除元素
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 300);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
}

// Mistral OCR 处理
async function processPdfWithMistral(apiKey) {
    try {
        addProgressLog('准备PDF文件...');
        updateProgress('PDF处理准备中', 10);
        
        // 检查API密钥长度
        if (apiKey.length < 30) {
            throw new Error('Mistral API密钥格式可能不正确，请检查');
        }
        
        // 从上传文件到获取OCR结果的完整流程
        const formData = new FormData();
        // 关键点：文件上传字段名必须是file
        formData.append('file', pdfFile);
        formData.append('purpose', 'ocr');
        
        addProgressLog('准备上传PDF文件...');
        updateProgress('上传文件中...', 20);
        addProgressLog('开始上传到Mistral...');
        
        console.log('开始上传文件，文件名:', pdfFile.name, '文件大小:', pdfFile.size);
        
        // 尝试上传文件
        let response;
        try {
            response = await fetch('https://api.mistral.ai/v1/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                    // 不要设置Content-Type，让浏览器自动设置multipart/form-data和boundary
                },
                body: formData
            });
        } catch (uploadError) {
            console.error('上传错误详情:', uploadError);
            addProgressLog(`网络错误: ${uploadError.message || '未知网络错误'}`);
            throw new Error(`文件上传失败，网络错误: ${uploadError.message || '未知网络错误'}`);
        }
        
        if (!response.ok) {
            let errorInfo = '未知错误';
            try {
                const responseText = await response.text();
                console.error('上传失败原始响应:', responseText);
                try {
                    const jsonError = JSON.parse(responseText);
                    errorInfo = jsonError.error?.message || jsonError.message || jsonError.detail || responseText;
                } catch (e) {
                    errorInfo = responseText || `HTTP错误: ${response.status} ${response.statusText}`;
                }
            } catch (e) {
                errorInfo = `HTTP错误: ${response.status} ${response.statusText}`;
            }
            
            addProgressLog(`上传失败: ${response.status} - ${errorInfo}`);
            
            if (response.status === 401) {
                throw new Error('API密钥无效或未授权，请检查您的Mistral API密钥');
            } else {
                throw new Error(`文件上传失败 (${response.status}): ${errorInfo}`);
            }
        }
        
        let fileData;
        try {
            fileData = await response.json();
            console.log('文件上传响应:', JSON.stringify(fileData));
        } catch (e) {
            console.error('解析文件数据错误:', e);
            throw new Error('无法解析文件上传响应数据');
        }
        
        if (!fileData || !fileData.id) {
            console.error('文件数据无效:', fileData);
            throw new Error('上传成功但未返回有效的文件ID');
        }
        
        const fileId = fileData.id;
        addProgressLog(`文件上传成功，ID: ${fileId}`);
        updateProgress('获取文件访问权限...', 30);
        
        // 确保fileId是有效的字符串
        if (typeof fileId !== 'string' || fileId.trim() === '') {
            throw new Error('文件ID无效，无法继续处理');
        }
        
        // 等待一下确保文件已经处理完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 获取签名URL - 使用文档中的确切格式
        try {
            // 使用/url端点并传递expiry参数
            const urlEndpoint = `https://api.mistral.ai/v1/files/${fileId}/url?expiry=24`;
            console.log('请求签名URL:', urlEndpoint);
            
            response = await fetch(urlEndpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                }
            });
        } catch (urlError) {
            console.error('获取URL错误详情:', urlError);
            addProgressLog(`获取URL错误: ${urlError.message || '未知网络错误'}`);
            throw new Error(`获取签名URL失败，网络错误: ${urlError.message || '未知网络错误'}`);
        }
        
        if (!response.ok) {
            let errorInfo = '未知错误';
            try {
                const responseText = await response.text();
                console.error('获取URL失败原始响应:', responseText);
                try {
                    const jsonError = JSON.parse(responseText);
                    errorInfo = jsonError.error?.message || jsonError.message || jsonError.detail || responseText;
                } catch (e) {
                    errorInfo = responseText || `HTTP错误: ${response.status} ${response.statusText}`;
                }
            } catch (e) {
                errorInfo = `HTTP错误: ${response.status} ${response.statusText}`;
            }
            
            addProgressLog(`获取签名URL失败: ${response.status} - ${errorInfo}`);
            throw new Error(`获取签名URL失败 (${response.status}): ${errorInfo}`);
        }
        
        let urlData;
        try {
            urlData = await response.json();
            console.log('签名URL响应:', JSON.stringify(urlData));
        } catch (e) {
            console.error('解析URL数据错误:', e);
            throw new Error('无法解析签名URL响应数据');
        }
        
        if (!urlData || !urlData.url) {
            console.error('URL数据无效:', urlData);
            addProgressLog('返回的URL格式不正确');
            throw new Error('获取的签名URL格式不正确');
        }
        
        const signedUrl = urlData.url;
        addProgressLog('成功获取文件访问URL');
        updateProgress('开始OCR处理...', 40);
        
        // 进行OCR处理 - 请求体需要匹配最新文档
        try {
            response = await fetch('https://api.mistral.ai/v1/ocr', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    // 完全匹配文档示例
                    model: 'mistral-ocr-latest',
                    document: {
                        type: "document_url",
                        document_url: signedUrl
                    },
                    include_image_base64: true
                })
            });
        } catch (ocrError) {
            console.error('OCR错误详情:', ocrError);
            addProgressLog(`OCR处理网络错误: ${ocrError.message || '未知网络错误'}`);
            throw new Error(`OCR处理失败，网络错误: ${ocrError.message || '未知网络错误'}`);
        }
        
        if (!response.ok) {
            let errorInfo = '未知错误';
            try {
                const responseText = await response.text();
                console.error('OCR处理失败原始响应:', responseText);
                try {
                    const jsonError = JSON.parse(responseText);
                    errorInfo = jsonError.error?.message || jsonError.message || jsonError.detail || responseText;
                } catch (e) {
                    errorInfo = responseText || `HTTP错误: ${response.status} ${response.statusText}`;
                }
            } catch (e) {
                errorInfo = `HTTP错误: ${response.status} ${response.statusText}`;
            }
            
            addProgressLog(`OCR处理失败: ${response.status} - ${errorInfo}`);
            throw new Error(`OCR处理失败 (${response.status}): ${errorInfo}`);
        }
        
        let ocrData;
        try {
            ocrData = await response.json();
            console.log('OCR处理成功，返回数据类型:', typeof ocrData);
        } catch (e) {
            console.error('解析OCR数据错误:', e);
            throw new Error('无法解析OCR处理响应数据');
        }
        
        if (!ocrData || !ocrData.pages) {
            console.error('OCR数据无效:', ocrData);
            throw new Error('OCR处理成功但返回的数据格式不正确');
        }
        
        addProgressLog('OCR处理完成，开始生成Markdown');
        updateProgress('生成Markdown...', 50);
        
        // 处理OCR结果
        await processOcrResults(ocrData);
        addProgressLog('Markdown生成完成');
        
        return true;
    } catch (error) {
        console.error('Mistral OCR处理错误:', error);
        addProgressLog(`处理失败: ${error.message || '未知错误'}`);
        throw error;
    }
}

// 处理OCR结果
async function processOcrResults(ocrResponse) {
    try {
        markdownContent = '';
        imagesData = [];
        
        // 处理每一页
        for (const page of ocrResponse.pages) {
            // 处理图片
            const pageImages = {};
            
            for (const img of page.images) {
                const imgId = img.id;
                const imgData = img.image_base64;
                imagesData.push({
                    id: imgId,
                    data: imgData
                });
                pageImages[imgId] = `images/${imgId}.png`;
            }
            
            // 替换Markdown中的图片引用
            let pageMarkdown = page.markdown;
            for (const [imgName, imgPath] of Object.entries(pageImages)) {
                pageMarkdown = pageMarkdown.replace(
                    new RegExp(`!\\[${imgName}\\]\\(${imgName}\\)`, 'g'), 
                    `![${imgName}](${imgPath})`
                );
            }
            
            markdownContent += pageMarkdown + '\n\n';
        }
        
        return true;
    } catch (error) {
        console.error('处理OCR结果错误:', error);
        throw new Error('处理OCR结果失败: ' + error.message);
    }
}

// 翻译Markdown
async function translateMarkdown(markdownText, targetLang, model, apiKey) {
    try {
        // 允许使用全局变量或传入参数
        const content = markdownText || markdownContent;
        const lang = targetLang || document.getElementById('targetLanguage').value;
        const selectedModel = model || document.getElementById('translationModel').value;
        const key = apiKey || document.getElementById('translationApiKey').value.trim();
        
        if (!content) {
            throw new Error('没有要翻译的内容');
        }

        if (!key) {
            throw new Error('未提供API密钥');
        }
        
        if (selectedModel === 'none') {
            return content; // 不需要翻译
        }

        // 修正targetLanguage值
        const actualLang = lang === 'chinese' ? 'zh' : lang;

        // 构建统一的翻译提示词
        const translationPromptTemplate = `请将以下${actualLang === 'zh' ? '英文' : '中文'}内容翻译为${actualLang === 'zh' ? '中文' : '英文'}，
        要求：

1. 保持所有Markdown语法元素不变（如#标题, *斜体*, **粗体**, [链接](), ![图片]()等）

2. 学术/专业术语应准确翻译，必要时可保留英文原文在括号中

3. 保持原文的段落结构和格式

4. 仅翻译内容，不要添加额外解释 

5. 对于行间公式，使用：
$$
...
$$
标记

文档内容：

${content}`;

        //对温度等参数做统一默认设置, 若未单独设置, 则使用默认值
        const temperature = 0.5;
        const maxTokens = 8192;
        const sys_prompt = "你是一个专业的文档翻译助手，擅长保持原文档格式进行精确翻译。";
        
        // 配置各种翻译API
        const apiConfigs = {
            'deepseek': {
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                modelName: 'DeepSeek Chat (deepseek-chat)',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                bodyBuilder: () => ({
                    model: "deepseek-chat",
                    messages: [
                        { role: "system", content: sys_prompt },
                        { role: "user", content: translationPromptTemplate }
                    ],
                    temperature: temperature,
                    max_tokens: maxTokens
                }),
                responseExtractor: (data) => data.choices[0].message.content
            },
            'gemini': {
                endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
                modelName: 'Google Gemini 2.0 Flash',
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: () => ({
                    contents: [
                        { 
                            role: "user", 
                            parts: [{ text: translationPromptTemplate }]
                        }
                    ],
                    generationConfig: {
                        temperature: temperature,
                        maxOutputTokens: maxTokens
                    }
                }),
                responseExtractor: (data) => data.candidates[0].content.parts[0].text
            },
            'claude': {
                endpoint: 'https://api.anthropic.com/v1/messages',
                modelName: 'Claude 3.5 Sonnet',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01'
                },
                bodyBuilder: () => ({
                    model: "claude-3-5-sonnet",
                    max_tokens: maxTokens,
                    messages: [
                        { role: "user", content: translationPromptTemplate }
                    ]
                }),
                responseExtractor: (data) => data.content[0].text
            },
            'mistral': {
                endpoint: 'https://api.mistral.ai/v1/chat/completions',
                modelName: 'Mistral Large (mistral-large-latest)',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                bodyBuilder: () => ({
                    model: "mistral-large-latest",
                    messages: [
                        { role: "system", content: sys_prompt },
                        { role: "user", content: translationPromptTemplate }
                    ],
                    temperature: temperature,
                    max_tokens: maxTokens
                }),
                responseExtractor: (data) => data.choices[0].message.content
            },
            'tongyi-deepseek-v3': {
                endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
                modelName: '阿里云通义百炼 DeepSeek v3',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                bodyBuilder: () => ({
                    model: "deepseek-v3",
                    messages: [
                        { role: "system", content: sys_prompt },
                        { role: "user", content: translationPromptTemplate }
                    ],
                    temperature: temperature,
                    max_tokens: maxTokens
                }),
                responseExtractor: (data) => data.choices[0].message.content
            },
            'volcano-deepseek-v3': {
                endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
                modelName: '火山引擎 DeepSeek v3',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                bodyBuilder: () => ({
                    model: "deepseek-v3-250324",
                    messages: [
                        { role: "system", content: sys_prompt },
                        { role: "user", content: translationPromptTemplate }
                    ],
                    temperature: temperature,
                    max_tokens: Math.min(maxTokens, 16384)
                }),
                responseExtractor: (data) => data.choices[0].message.content
            },
            'custom': {
                // 自定义模型配置将动态生成
                createConfig: () => {
                    // 获取用户设置的参数
                    const customModelName = document.getElementById('customModelName').value.trim();
                    const customApiEndpoint = document.getElementById('customApiEndpoint').value.trim();
                    const customModelId = document.getElementById('customModelId').value.trim();
                    const customRequestFormat = document.getElementById('customRequestFormat').value;
                    
                    if (!customModelName || !customApiEndpoint || !customModelId) {
                        throw new Error('请填写完整的自定义模型信息');
                    }
                    
                    // 根据选择的请求格式创建不同的配置
                    const config = {
                        endpoint: customApiEndpoint,
                        modelName: customModelName,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        bodyBuilder: null,
                        responseExtractor: null
                    };
                    
                    // 添加授权头
                    if (customApiEndpoint.includes('anthropic')) {
                        config.headers['x-api-key'] = key;
                        config.headers['anthropic-version'] = '2023-06-01';
                    } else {
                        config.headers['Authorization'] = `Bearer ${key}`;
                    }
                    
                    // 根据格式设置请求体构建器和响应提取器
                    switch (customRequestFormat) {
                        case 'openai':
                            config.bodyBuilder = () => ({
                                model: customModelId,
                                messages: [
                                    { role: "system", content: sys_prompt },
                                    { role: "user", content: translationPromptTemplate }
                                ],
                                temperature: temperature,
                                max_tokens: maxTokens
                            });
                            config.responseExtractor = (data) => data.choices[0].message.content;
                            break;
                            
                        case 'anthropic':
                            config.bodyBuilder = () => ({
                                model: customModelId,
                                max_tokens: maxTokens,
                                messages: [
                                    { role: "user", content: translationPromptTemplate }
                                ]
                            });
                            config.responseExtractor = (data) => data.content[0].text;
                            break;
                            
                        case 'gemini':
                            config.bodyBuilder = () => ({
                                contents: [
                                    { 
                                        role: "user", 
                                        parts: [{ text: translationPromptTemplate }]
                                    }
                                ],
                                generationConfig: {
                                    temperature: temperature,
                                    maxOutputTokens: maxTokens
                                }
                            });
                            config.responseExtractor = (data) => data.candidates[0].content.parts[0].text;
                            break;
                    }
                    
                    return config;
                }
            }
        };

        // 选择API配置
        const apiConfig = apiConfigs[selectedModel];
        
        if (!apiConfig) {
            throw new Error(`不支持的翻译模型: ${selectedModel}`);
        }

        addProgressLog(`正在调用${apiConfig.modelName || selectedModel}翻译API...`);
        let response;
        // 使用常规模型配置
        if (selectedModel !== 'custom') {
            response = await fetch(apiConfig.endpoint, {
                method: 'POST',
                headers: apiConfig.headers,
                body: JSON.stringify(apiConfig.bodyBuilder())
            });
        } else {
            // 使用自定义模型配置
            const customConfig = apiConfig.createConfig();
            response = await fetch(customConfig.endpoint, {
                method: 'POST',
                headers: customConfig.headers,
                body: JSON.stringify(customConfig.bodyBuilder())
            });
        }

        if (!response.ok) {
            let errorText;
            try {
                const errorJson = await response.json();
                errorText = JSON.stringify(errorJson);
            } catch (e) {
                errorText = await response.text();
            }
            
            console.error(`API错误 (${response.status}): ${errorText}`);
            throw new Error(`翻译API返回错误 (${response.status}): ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        
        // 提取翻译后的内容
        let translatedContent;
        
        if (selectedModel !== 'custom') {
            // 使用预定义模型的响应提取器
            translatedContent = apiConfig.responseExtractor(data);
        } else {
            // 使用自定义模型的响应提取器
            const customConfig = apiConfig.createConfig();
            translatedContent = customConfig.responseExtractor(data);
        }
        
        try {
            // 提取翻译结果
            if (!translatedContent) {
                throw new Error('译文为空');
            }
            
            return translatedContent;
        } catch (error) {
            console.error('提取翻译结果错误:', error, '原始响应:', data);
            throw new Error(`提取翻译结果失败: ${error.message}`);
        }
    } catch (error) {
        console.error('翻译错误:', error);
        throw new Error(`调用${model}翻译API失败: ${error.message}`);
    }
}

// 长文档翻译函数
async function translateLongDocument(markdownText, targetLang, model, apiKey) {
    const parts = splitMarkdownIntoChunks(markdownText);
    console.log(`将文档分割为${parts.length}个部分进行翻译`);
    addProgressLog(`文档被分割为${parts.length}个部分进行翻译`);
    
    let translatedContent = '';
    
    for (let i = 0; i < parts.length; i++) {
        updateProgress(`翻译第 ${i+1}/${parts.length} 部分...`, 60 + Math.floor((i / parts.length) * 30));
        addProgressLog(`正在翻译第 ${i+1}/${parts.length} 部分...`);
        
        try {
            // 翻译当前部分
            const partResult = await translateMarkdown(parts[i], targetLang, model, apiKey);
            translatedContent += partResult;
            
            // 添加分隔符（如果不是最后一部分）
            if (i < parts.length - 1) {
                translatedContent += '\n\n';
            }
            
            // 简单的节流，避免API速率限制
            if (i < parts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(`第 ${i+1} 部分翻译失败:`, error);
            addProgressLog(`第 ${i+1} 部分翻译失败: ${error.message}`);
            
            // 继续尝试其余部分
            translatedContent += `\n\n> **翻译错误 (第 ${i+1} 部分), 使用原语言**: ${error.message}\n\n${parts[i]}\n\n`;
        }
    }
    
    
    return translatedContent;
}

// 智能分割Markdown为多个片段
function splitMarkdownIntoChunks(markdown) {
    // 估计每个标记的平均长度
    const estimatedTokens = estimateTokenCount(markdown);
    // 从用户设置获取最大token数限制
    const tokenLimit = parseInt(maxTokensPerChunk.value) || 8192;
    
    // 如果文档足够小，不需要分割
    if (estimatedTokens <= tokenLimit) {
        return [markdown];
    }
    
    // 按章节分割
    const chunks = [];
    const lines = markdown.split('\n');
    let currentChunk = [];
    let currentTokenCount = 0;
    let inCodeBlock = false;
    
    // 定义标题行的正则表达式
    const headingRegex = /^#{1,6}\s+.+$/;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 检测代码块
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }
        
        // 估计当前行的token数
        const lineTokens = estimateTokenCount(line);
        
        // 判断是否应该在这里分割
        const isHeading = headingRegex.test(line) && !inCodeBlock;
        const wouldExceedLimit = currentTokenCount + lineTokens > tokenLimit;
        
        if (isHeading && currentChunk.length > 0 && (wouldExceedLimit || currentTokenCount > tokenLimit * 0.7)) {
            // 在遇到标题且当前段已积累足够内容时分割
            chunks.push(currentChunk.join('\n'));
            currentChunk = [];
            currentTokenCount = 0;
        }
        
        // 如果当前段落即使加上这一行也超过限制，而且已经有内容了
        if (!isHeading && wouldExceedLimit && currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n'));
            currentChunk = [];
            currentTokenCount = 0;
        }
        
        // 添加当前行到当前段落
        currentChunk.push(line);
        currentTokenCount += lineTokens;
    }
    
    // 添加最后一段
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }
    
    // 处理过大的段落（可能是因为没有标题或标记导致的）
    const finalChunks = [];
    for (const chunk of chunks) {
        const chunkTokens = estimateTokenCount(chunk);
        if (chunkTokens > tokenLimit) {
            // 如果段落仍然过大，按段落分割
            const subChunks = splitByParagraphs(chunk, tokenLimit);
            finalChunks.push(...subChunks);
        } else {
            finalChunks.push(chunk);
        }
    }
    
    return finalChunks;
}

// 按段落分割过大的文本块
function splitByParagraphs(text, tokenLimit) {
    const paragraphs = text.split('\n\n');
    const chunks = [];
    let currentChunk = [];
    let currentTokenCount = 0;
    
    for (const paragraph of paragraphs) {
        const paragraphTokens = estimateTokenCount(paragraph);
        
        // 如果单个段落就超过了限制，则需要进一步分割
        if (paragraphTokens > tokenLimit) {
            // 如果当前段已有内容，先保存
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n\n'));
                currentChunk = [];
                currentTokenCount = 0;
            }
            
            // 按句子分割大段落
            const sentenceChunks = splitBySentences(paragraph, tokenLimit);
            chunks.push(...sentenceChunks);
            continue;
        }
        
        // 检查是否加上这个段落会超出限制
        if (currentTokenCount + paragraphTokens > tokenLimit && currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n\n'));
            currentChunk = [];
            currentTokenCount = 0;
        }
        
        currentChunk.push(paragraph);
        currentTokenCount += paragraphTokens;
    }
    
    // 添加最后一段
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
    }
    
    return chunks;
}

// 按句子分割过大的段落
function splitBySentences(paragraph, tokenLimit) {
    // 简单的句子分割规则（这里可以根据需要改进）
    const sentences = paragraph.replace(/([.!?。！？])\s*/g, "$1\n").split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentTokenCount = 0;
    
    for (const sentence of sentences) {
        if (!sentence.trim()) continue;
        
        const sentenceTokens = estimateTokenCount(sentence);
        
        // 检查是否加上这个句子会超出限制
        if (currentTokenCount + sentenceTokens > tokenLimit && currentChunk.length > 0) {
            chunks.push(currentChunk.join(' '));
            currentChunk = [];
            currentTokenCount = 0;
        }
        
        currentChunk.push(sentence);
        currentTokenCount += sentenceTokens;
    }
    
    // 添加最后一段
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }
    
    return chunks;
}

// 合并翻译后的片段
function mergeTranslatedChunks(chunks) {
    // 简单合并，可以根据需要添加更复杂的处理逻辑
    return chunks.join('\n\n');
}

// 估计文本的token数量（粗略估计）
function estimateTokenCount(text) {
    if (!text) return 0;
    
    // 中文和其他语言的处理方式不同
    // 英文大约每75个字符对应20个token
    // 中文大约每字符对应1.5个token
    
    // 检测是否包含大量中文
    const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length;
    
    if (chineseRatio > 0.5) {
        // 主要是中文文本
        return Math.ceil(text.length * 1.5);
    } else {
        // 主要是英文或其他文本
        return Math.ceil(text.length / 3.75);
    }
}

// 将文件转换为Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// 下载单个文本文件
function downloadText(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    saveAs(blob, filename);
}

// 下载包含图像的Markdown
async function downloadMarkdownWithImages() {
    try {
        const zip = new JSZip();
        
        // 添加Markdown文件
        zip.file('document.md', markdownContent);
        
        // 创建images文件夹
        const imagesFolder = zip.folder('images');
        
        // 添加图片
        for (const img of imagesData) {
            const imgData = img.data.split(',')[1];
            imagesFolder.file(`${img.id}.png`, imgData, { base64: true });
        }
        
        // 生成并下载zip文件
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const pdfName = pdfFile ? pdfFile.name.replace('.pdf', '') : 'document';
        saveAs(zipBlob, `${pdfName}_markdown.zip`);
    } catch (error) {
        console.error('创建ZIP文件失败:', error);
        showNotification('下载失败: ' + error.message, 'error');
    }
}

downloadTranslationWithImages = async () => {
    try {
        const zip = new JSZip();
        
        // 直接添加声明到翻译内容
        const currentDate = new Date().toISOString().split('T')[0];
        const headerDeclaration = `> *本文档由 Paper Burner 工具制作 (${currentDate})。内容由 AI 大模型翻译生成，不保证翻译内容的准确性和完整性。*\n\n`;
        const footerDeclaration = `\n\n---\n> *免责声明：本文档内容由大模型API自动翻译生成，Paper Burner 工具不对翻译内容的准确性、完整性和合法性负责。*`;
        
        // 添加Markdown文件，包含声明
        const contentToDownload = headerDeclaration + translationContent + footerDeclaration;
        zip.file('document.md', contentToDownload);
        
        // 创建images文件夹
        const imagesFolder = zip.folder('images');
        
        // 添加图片
        for (const img of imagesData) {
            const imgData = img.data.split(',')[1];
            imagesFolder.file(`${img.id}.png`, imgData, { base64: true });
        }
        
        // 生成并下载zip文件
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const pdfName = pdfFile ? pdfFile.name.replace('.pdf', '') : 'document';
        saveAs(zipBlob, `${pdfName}_translation.zip`);
    } catch (error) {
        console.error('创建ZIP文件失败:', error);
        showNotification('下载失败: ' + error.message, 'error');
    }
}

// 保存设置
function saveSettings() {
    // 保存高级设置到本地存储
    localStorage.setItem('advancedSettings', JSON.stringify({
        maxTokensPerChunk: maxTokensPerChunk.value
    }));
    
    // 如果是自定义模型，保存自定义模型设置
    if (translationModelSelect.value === 'custom') {
        localStorage.setItem('customModelSettings', JSON.stringify({
            modelName: document.getElementById('customModelName').value,
            apiEndpoint: document.getElementById('customApiEndpoint').value,
            modelId: document.getElementById('customModelId').value,
            requestFormat: document.getElementById('customRequestFormat').value
        }));
    }
    
    // 保存选中的翻译模型
    localStorage.setItem('selectedTranslationModel', translationModelSelect.value);
}

// 加载设置
function loadSettings() {
    // 加载高级设置
    try {
        const advancedSettingsData = localStorage.getItem('advancedSettings');
        if (advancedSettingsData) {
            const settings = JSON.parse(advancedSettingsData);
            if (settings.maxTokensPerChunk) {
                maxTokensPerChunk.value = settings.maxTokensPerChunk;
                maxTokensPerChunkValue.textContent = settings.maxTokensPerChunk;
            }
        }
    } catch (e) {
        console.error('加载高级设置失败:', e);
    }
    
    // 加载自定义模型设置
    try {
        const customModelData = localStorage.getItem('customModelSettings');
        if (customModelData) {
            const settings = JSON.parse(customModelData);
            document.getElementById('customModelName').value = settings.modelName || '';
            document.getElementById('customApiEndpoint').value = settings.apiEndpoint || '';
            document.getElementById('customModelId').value = settings.modelId || '';
            document.getElementById('customRequestFormat').value = settings.requestFormat || 'openai';
        }
    } catch (e) {
        console.error('加载自定义模型设置失败:', e);
    }
    
    // 加载选中的翻译模型
    try {
        const selectedModel = localStorage.getItem('selectedTranslationModel');
        if (selectedModel) {
            translationModelSelect.value = selectedModel;
            // 如果是自定义模型，显示自定义设置
            if (selectedModel === 'custom') {
                customModelSettings.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error('加载选中的翻译模型失败:', e);
    }
}
