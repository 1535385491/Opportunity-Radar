# Hugging Face 热门模型日报 2026-07-17

> 数据来源: [Hugging Face Hub](https://huggingface.co/) | 共 30 个模型 | 生成时间: 2026-07-17 02:55 UTC

---

# Hugging Face 热门模型日报 (2026-07-17)

## 📌 今日速览
今日的Hugging Face热榜呈现出几个鲜明趋势：**多模态能力成为新标配**，多款视觉语言模型（如Inkling、Qwythos-9B）名列前茅；**极限量化技术备受追捧**，Ternary-Bonsai-27B（2-bit）等超低精度模型下载量巨大，预示着边缘计算的突破；**国产大模型生态持续发力**，GLM-5.2与Hunyuan Hy3等模型获得社区高度关注。此外，**专用工具模型**（如OCR、语音转录）凭借强大的实用价值，取得了极高的下载量。

## 🔥 热门模型

### 🧠 语言模型（LLM、对话模型、指令微调）
- **[GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**
  作者：zai-org | 点赞：4,030 | 下载：513,061
  > 高性能开源基座模型，基于创新的MoE-DSA架构，成为本周点赞数最高的模型。
- **[Hunyuan Hy3](https://huggingface.co/tencent/Hy3)**
  作者：tencent | 点赞：813 | 下载：11,849
  > 腾讯推出的新一代文本生成模型，展现了国内大厂在开源社区的活跃度。
- **[MiniCPM5-1B-Claude-Opus-Fable5-Thinking](https://huggingface.co/GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-Thinking)**
  作者：GnLOLot | 点赞：131 | 下载：4,117
  > 基于MiniCPM5的“思考”型模型，体现了将高级推理能力注入轻量模型的趋势。

### 🎨 多模态与生成（图像、视频、音频、文本到X）
- **[Inkling](https://huggingface.co/thinkingmachines/Inkling)**
  作者：thinkingmachines | 点赞：821 | 下载：4
  > 一款图像-文本到文本的多模态模型，虽下载量低但点赞高，显示出极高的社区讨论度和前沿性。
- **[Qwythos-9B-Claude-Mythos-5-1M-GGUF](https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF)**
  作者：empero-ai | 点赞：2,239 | 下载：2,042,670
  > 基于Qwen3.5的多模态推理模型，GGUF格式使其下载量惊人，实用性极强。
- **[Wan-Dancer-14B](https://huggingface.co/Wan-AI/Wan-Dancer-14B)**
  作者：Wan-AI | 点赞：92 | 下载：1,884
  > 图像到视频生成模型，标志着AI视频生成领域持续有高质量开源模型产出。
- **[MOSS-Transcribe-Diarize](https://huggingface.co/OpenMOSS-Team/MOSS-Transcribe-Diarize)**
  作者：OpenMOSS-Team | 点赞：233 | 下载：75,105
  > 语音转文本与说话人分割模型，在音频处理领域获得了显著应用。

### 🔧 专用模型（代码、数学、医疗、嵌入）
- **[Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)**
  作者：baidu | 点赞：2,011 | 下载：1,852,722
  > 百度出品的高性能OCR模型，超高的下载量证明了市场对精准文字识别工具的刚需。
- **[Agents-A1](https://huggingface.co/InternScience/Agents-A1)**
  作者：InternScience | 点赞：568 | 下载：33,400
  > 专注智能体任务的模型，表明“AI代理”相关工具在开发者社区热度不减。
- **[gemma-4-12B-agentic-fable5-composer2.5](https://huggingface.co/yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF)**
  作者：yuxinlu1 | 点赞：1,208 | 下载：506,068
  > 针对编程和代理任务优化的Gemma模型，显示了垂直领域模型的巨大需求。

### 📦 微调与量化（社区微调、GGUF、AWQ）
- **[Ternary-Bonsai-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)**
  作者：prism-ml | 点赞：610 | 下载：74,007
  > **2-bit** 极致量化版本，代表了模型压缩技术的极限探索，让27B模型可在消费级硬件运行。
- **[Bonsai-27B-gguf](https://huggingface.co/prism-ml/Bonsai-27B-gguf)**
  作者：prism-ml | 点赞：343 | 下载：559,267
  > **1-bit** 量化模型，下载量极高，证明了社区对超低内存占用模型的热烈需求。
- **[unsloth/Qwen3.6-27B-NVFP4](https://huggingface.co/unsloth/Qwen3.6-27B-NVFP4)**
  作者：unsloth | 点赞：216 | 下载：1,712,974
  > 针对NVIDIA硬件优化的FP4量化版本，体现了量化技术向硬件协同优化发展。
- **[GLM-5.2-colibri-int4](https://huggingface.co/jlnsrk/GLM-5.2-colibri-int4)**
  作者：jlnsrk | 点赞：121 | 下载：2,621
  > 针对CPU推理优化的INT4量化版，标志着高性能模型向更多设备端的渗透。

## 🔭 生态信号
**Qwen家族统治力凸显**：榜单中大量模型基于Qwen3.5/3.6进行微调或量化（如Qwythos、ThinkingCap、Uncensored版本），其生态的丰富度和社区活跃度遥遥领先，已成为开源微调的基石。**极限量化成为新赛场**：从1-bit、2-bit到专用格式（NVFP4），量化技术不再仅是“妥协”，而是催生新模型范式（如Ternary）和关键使用场景（边缘、手机端）的驱动力。**开源权重价值巩固**：所有热门模型均为开源权重，这进一步巩固了开源社区在模型创新、普及和二次开发上的核心地位。

## 💡 值得探索
1.  **[Ternary-Bonsai-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)**：其“三元”（Ternary）2-bit量化是前沿技术，值得研究其如何在极低比特下保持性能，对边缘AI有重大意义。
2.  **[GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**：作为高赞基座模型，其GLM MoE-DSA架构细节和实际表现，对于理解下一代高效开源大模型的方向极具参考价值。
3.  **[Wan-Dancer-14B](https://huggingface.co/Wan-AI/Wan-Dancer-14B)**：作为高规格的开源视频生成模型，是探索当前AI视频创作能力边界和实用化路径的理想标的。