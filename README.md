# Paper Burner - PDF文档OCR与翻译工具

<div align="center">
  <img src="https://img.shields.io/badge/版本-1.0.0-blue.svg" alt="版本">
  <img src="https://img.shields.io/badge/许可证-MIT-green.svg" alt="许可证">
  <img src="https://img.shields.io/badge/Pure-JavaScript-yellow.svg" alt="JavaScript">
</div>

## 📝 项目介绍

Paper Burner是为研究生和研究人员设计的PDF文档处理工具。它能够从PDF文档中提取文本（OCR），将其转换为Markdown格式，并支持使用多种AI模型进行高质量翻译，完美保留公式、图表和格式。

本工具完全在浏览器中运行。

## ✨ 核心特性

- **PDF文本提取**：使用Mistral AI的OCR技术从PDF文档中精确提取文本内容
- **Markdown转换**：自动将提取的内容转换为规范的Markdown格式
- **图像处理**：自动提取并保存PDF中的图片
- **多模型翻译**：支持多种顶级AI大模型进行翻译
- **长文档翻译**：自动按照文章小节分段处理长文档，避免段落中出现断点，确保翻译质量和内容一致性
- **保留格式**：翻译过程中完美保留原文档的格式、公式和结构

## 📚 支持的翻译大模型

  - DeepSeek v3
  - Gemini 2.0 Flash
  - Claude 3.5 Sonnet
  - 阿里云百炼Deepseek-v3
  - 火山引擎Deepseek-v3
  - Mistral Large
  - 与OpenAI、Anthropic、Gemini请求格式兼容的自定义模型

## 🚀 快速开始

### 在线使用

本工具可以直接通过浏览器使用，无需安装：

1. 访问[在线版Paper Burner](https://baoyu.space/paper-burner/)
2. 输入必要的API密钥
3. 上传PDF文档
4. 选择所需的翻译模型和目标语言
5. 点击处理按钮
6. 等待处理完成，下载压缩包
7. 使用你喜欢的Markdown阅读器打开Markdown文件


## 🔑 API密钥配置

本工具需要以下API密钥才能正常工作：

1. **Mistral API Key**（必需）：用于PDF文档的OCR处理
   - 获取方式：[Mistral AI官网](https://mistral.ai/)

2. **翻译API Key**（可选）：根据选择的翻译模型而定
   - DeepSeek: [DeepSeek AI官网](https://deepseek.com/)
   - Gemini: [Google AI Studio](https://makersuite.google.com/)
   - Claude: [Anthropic官网](https://www.anthropic.com/)
   - 通义百炼: [阿里云官网](https://www.aliyun.com/)
   - 火山引擎: [火山引擎官网](https://www.volcengine.com/)

所有API密钥均在本地浏览器中处理，不会上传到任何服务器，确保安全性。您可以选择通过浏览器本地存储功能保存密钥，方便下次使用。


## ⚠️ 注意事项

- AI模型翻译结果仅供参考，重要内容请以原文为准
- 大型文档的处理可能需要较长时间，请耐心等待
- 对于包含特殊格式的PDF，OCR结果可能需要人工校对
- 使用API时请遵守相应服务提供商的使用条款

## 🤝 贡献指南

欢迎为Paper Burner做出贡献！您可以通过以下方式参与：

1. 提交Issue：报告Bug或提出新功能建议
2. 提交Pull Request：改进代码或添加新功能
3. 改进文档：完善使用说明或提供使用示例

## 📄 许可证

本项目采用MIT许可证 - 详见 [LICENSE](LICENSE) 文件


<div align="center">
  <p>由 <a href="#">Bao Yu</a> 开发 © 2025</p>
  <p>如果这个工具对您有帮助，请考虑给项目一个⭐</p>
</div>
