# Hugging Face 热门模型日报 2026-07-29

> 数据来源: [Hugging Face Hub](https://huggingface.co/) | 共 30 个模型 | 生成时间: 2026-07-29 02:55 UTC

---

# Hugging Face 热门模型日报
**日期：2026-07-29**

## 📌 今日速览
1.  **多模态融合主导榜单**：榜首的 **Kimi-K3** 和第10名的 **GLM-5.2** 等高人气模型均为多模态架构，表明强大的视觉-语言理解能力已成为当前模型发布的核心竞争力。
2.  **“去审查”与专用微调成风潮**：榜单中出现大量基于 **Qwen3.6** 和 **Laguna-S** 系列的“Uncensored”（去审查）及角色扮演（如Hermes、Aggressive）微调版本，显示社区对模型高度定制化和人格化的旺盛需求。
3.  **量化技术驱动边缘部署**：**Ternary-Bonsai**（2-bit）和 **Bonsai**（1-bit）等极致量化模型下载量惊人，结合 **NVFP4** 格式的流行，表明高效推理和本地化部署仍是生态发展的关键方向。
4.  **中国AI势力强劲**：来自 **月之暗面（moonshotai）**、 **百度**、 **智谱（zai-org）**、 **通义千问（Qwen）** 等中国团队的模型在点赞和下载量上均占据显著位置，展现了中国AI开源生态的全球影响力。

## 📊 热门模型分类

### 🧠 语言模型
1.  **[zai-org/GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**
    *   作者：zai-org | 点赞：4,608 | 下载：1,267,198
    *   **说明**：智谱发布的最新一代多模态对话大模型，凭借其强大的综合能力和开源权重迅速获得社区极高关注。
2.  **[poolside/Laguna-S-2.1](https://huggingface.co/poolside/Laguna-S-2.1)**
    *   作者：poolside | 点赞：801 | 下载：67,286
    *   **说明**：新兴的高性能开源文本生成模型，其多个量化（GGUF， NVFP4）版本同步上榜，显示了其架构的潜力和社区的积极适配。
3.  **[Nanbeige/Nanbeige4.2-3B](https://huggingface.co/Nanbeige/Nanbeige4.2-3B)**
    *   作者：Nanbeige | 点赞：530 | 下载：18,933
    *   **说明**：一款轻量级（3B参数）的对话模型，高点赞数表明社区对高效、可本地运行的模型有持续需求。

### 🎨 多模态与生成
1.  **[moonshotai/Kimi-K3](https://huggingface.co/moonshotai/Kimi-K3)**
    *   作者：moonshotai | 点赞：8,079 | 下载：99,214
    *   **说明**：登顶本周热榜的多模态模型，其卓越的图文理解与生成能力使其成为当前最受关注的发布。
2.  **[baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)**
    *   作者：baidu | 点赞：3,424 | 下载：2,694,935
    *   **说明**：专注于OCR（光学字符识别）的多模态模型，高达270万的下载量证明了其在文档数字化等实用场景中的巨大价值。
3.  **[microsoft/Mage-Flow](https://huggingface.co/microsoft/Mage-Flow)**
    *   作者：microsoft | 点赞：418 | 下载：2,007
    *   **说明**：微软推出的文本到图像及图像编辑模型，结合了生成与编辑能力，代表了多模态生成工具的新方向。
4.  **[owensong/Inflect-Micro-v2](https://huggingface.co/owensong/Inflect-Micro-v2)**
    *   作者：owensong | 点赞：268 | 下载：645
    *   **说明**：一款支持在CPU上运行的文本转语音（TTS）模型，突出了本地化、轻量级音频生成的趋势。

### 🔧 专用模型
1.  **[Kwaipilot/KAT-Coder-V2.5-Dev](https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev)**
    *   作者：Kwaipilot | 点赞：289 | 下载：6,275
    *   **说明**：基于Qwen3.5 MoE架构的专用代码生成模型，显示了MoE架构在专业领域的应用。
2.  **[ATH-MaaS/OvisOCR2](https://huggingface.co/ATH-MaaS/OvisOCR2)**
    *   作者：ATH-MaaS | 点赞：340 | 下载：47,129
    *   **说明**：另一款高性能OCR模型，与百度的Unlimited-OCR共同显示了该垂直领域的激烈竞争和高需求。

### 📦 微调与量化
1.  **[DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored...](https://huggingface.co/DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF)**
    *   作者：DavidAU | 点赞：857 | 下载：736,692
    *   **说明**：基于Qwen3.6的深度定制化微调版本，集“去审查”、叙事融合等多种特性于一身，下载量很高，代表社区对模型进行“魔改”的热情。
2.  **[HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive)**
    *   作者：HauhauCS | 点赞：3,158 | 下载：1,855,505
    *   **说明**：针对Qwen3.6 MoE模型进行“Aggressive”（激进风格）微调并去审查，极高的下载量表明特定风格化微调的巨大市场。
3.  **[prism-ml/Ternary-Bonsai-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)**
    *   作者：prism-ml | 点赞：1,085 | 下载：665,427
    *   **说明**：将27B模型量化至前所未有的2-bit精度（Ternary，三值量化），在压缩技术上实现突破，吸引了大量关注。
4.  **[empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF](https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF)**
    *   作者：empero-ai | 点赞：2,503 | 下载：1,262,662
    *   **说明**：基于Qwen3.5架构并融合了长上下文（1M）与强化推理能力的量化版本，体现了对长文本和复杂推理需求的满足。

## 🌐 生态信号
**Qwen家族成为核心基座**：榜单中超过三分之一的模型（包括多个热门微调版）基于 **Qwen3.5/3.6** 系列架构，无论是通用对话还是垂直领域微调，Qwen已成为开源社区最重要的基础模型之一。

**闭源模型加速开源化**：**GLM-5.2**（智谱）、**Kimi-K3**（月之暗面）等原本具备强大闭源API的模型相继发布完整开源权重，这一趋势正在加速，极大地丰富了开源生态并推动了二次创新。

**极致量化与高效推理成为焦点**：社区不仅满足于传统的FP16或INT8量化，正在积极探索 **2-bit（三值）、1-bit** 等极致压缩方案，以及 **NVFP4** 等新型高效格式，其目标是在消费级硬件上运行更大、更强的模型。

## 🚀 值得探索
1.  **[moonshotai/Kimi-K3](https://huggingface.co/moonshotai/Kimi-K3)**：本周人气王。作为一款高性能多模态模型，其开源权重值得深入测试，尤其是在复杂图文理解和生成任务上的表现，可能是应用开发的强大基座。
2.  **[poolside/Laguna-S-2.1](https://huggingface.co/poolside/Laguna-S-2.1) 及其量化版本**：Laguna模型迅速衍生出多种优化版本（GGUF， NVFP4），显示其架构具有良好的适配性和潜力。值得对比其不同量化版本在性能与效率上的平衡。
3.  **[prism-ml/Ternary-Bonsai-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)**：挑战模型压缩的极限。2-bit量化是一个前沿且充满争议的技术方向，研究这个模型可以帮助理解极端压缩下模型能力的保留情况与边界。