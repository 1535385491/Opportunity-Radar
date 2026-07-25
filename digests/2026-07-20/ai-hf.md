# Hugging Face 热门模型日报 2026-07-20

> 数据来源: [Hugging Face Hub](https://huggingface.co/) | 共 30 个模型 | 生成时间: 2026-07-20 03:42 UTC

---

# Hugging Face 热门模型日报（2026-07-20）

## 📌 今日速览

今日的 Hugging Face 生态呈现出三个显著趋势：首先，**开源权重模型的极大影响力**持续得到验证，如 GLM-5.2 和 Gemma-4 在点赞和下载量上遥遥领先，驱动着本地化部署的浪潮。其次，**多模态任务（尤其是图像、视频理解与生成）** 依然是绝对的主流赛道，相关模型占据了近半数热门榜席位。最后，**以极低比特量化和高效微调为代表的社区生态异常活跃**，从 1-bit 到 2-bit 模型层出不穷，不断推动着在消费级硬件上运行强大模型的边界。中国团队（如智谱AI、百度、腾讯、OpenMOSS）在原创架构、专用模型和社区优化方面都展现了强劲的创新能力。

## 🔥 热门模型

### 🧠 语言模型（LLM、对话模型、指令微调）

*   **[GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)** by zai-org
    *   **点赞**：4,172 | **下载**：536,177
    *   **一句话**：智谱AI推出的最新一代对话模型，凭借其卓越的性能和生态，在本周收获了极高的关注度和下载量。
*   **[gemma-4-31B-it](https://huggingface.co/google/gemma-4-31B-it)** by Google
    *   **点赞**：3,276 | **下载**：12,337,374
    *   **一句话**：谷歌最新发布的多模态指令微调模型，巨大的下载量表明了其作为重要基准模型的地位。
*   **[tencent/Hy3](https://huggingface.co/tencent/Hy3)** by tencent
    *   **点赞**：836 | **下载**：13,698
    *   **一句话**：腾讯发布的混元系列新模型，提供官方原版权重，是构建中文对话系统的新选择。
*   **[ThinkingCap-Qwen3.6-27B](https://huggingface.co/bottlecapai/ThinkingCap-Qwen3.6-27B)** by bottlecapai
    *   **点赞**：463 | **下载**：10,647
    *   **一句话**：基于 Qwen3.6 的微调版本，专注于增强多模态推理与思考能力。

### 🎨 多模态与生成（图像、视频、音频、文本到X）

*   **[Inkling](https://huggingface.co/thinkingmachines/Inkling)** by thinkingmachines
    *   **点赞**：1,158 | **下载**：13,462
    *   **一句话**：本周最火的多模态对话模型，能够处理图像和文本输入，引发了广泛的讨论和测试。
*   **[baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)** by baidu
    *   **点赞**：2,201 | **下载**：2,122,848
    *   **一句话**：百度推出的强大 OCR 解决方案，极高的下载量证明了工业场景中对高质量文字识别的巨大需求。
*   **[OvisOCR2](https://huggingface.co/ATH-MaaS/OvisOCR2)** by ATH-MaaS
    *   **点赞**：196 | **下载**：14,587
    *   **一句话**：另一个专注于 OCR 任务的多模态模型，基于 Qwen3.5 构建，显示了该领域的细分竞争。
*   **[MOSS-Transcribe-Diarize](https://huggingface.co/OpenMOSS-Team/MOSS-Transcribe-Diarize)** by OpenMOSS-Team
    *   **点赞**：280 | **下载**：87,533
    *   **一句话**：开源 MOSS 团队推出的音频转录与说话人分离模型，填补了中文语音处理链中的一个实用工具。
*   **[Wan-Dancer-14B](https://huggingface.co/Wan-AI/Wan-Dancer-14B)** by Wan-AI
    *   **点赞**：129 | **下载**：2,408
    *   **一句话**：万象物语团队发布的图像到视频生成模型，专注于高质量的人物动态生成。
*   **[MOSS-VL-Realtime](https://huggingface.co/OpenMOSS-Team/MOSS-VL-Realtime)** by OpenMOSS-Team
    *   **点赞**：83 | **下载**：544
    *   **一句话**：旨在实现实时视频理解的视觉语言模型，虽下载量不高但代表了重要的前沿探索方向。

### 🔧 专用模型（代码、数学、医疗、嵌入）

*   **[baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)** by baidu
    *   **点赞**：2,201 | **下载**：2,122,848
    *   **一句话**：**（同上）** 作为高度专用的文字识别模型，是“专用模型”类的典型代表。
*   **[needle](https://huggingface.co/Cactus-Compute/needle)** by Cactus-Compute
    *   **点赞**：280 | **下载**：955
    *   **一句话**：一个专注于函数调用和工具使用的模型，对构建 AI Agent 至关重要。
*   **[InternScience/Agents-A1](https://huggingface.co/InternScience/Agents-A1)** by InternScience
    *   **点赞**：584 | **下载**：35,833
    *   **一句话**：可能为科学计算或通用智能体设计的模型，其高点赞数引发了对其具体能力的好奇。

### 📦 微调与量化（社区微调、GGUF、AWQ）

*   **[Ternary-Bonsai-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)** by prism-ml
    *   **点赞**：796 | **下载**：338,945
    *   **一句话**：首个广受欢迎的 2-bit 量化模型，展示了极端量化技术的可行性，为边缘设备部署开辟道路。
*   **[Bonsai-27B-gguf](https://huggingface.co/prism-ml/Bonsai-27B-gguf)** by prism-ml
    *   **点赞**：503 | **下载**：1,262,894
    *   **一句话**：prism-ml 团队推出的 1-bit 量化版本，下载量破百万，证明了社区对高效本地运行的强烈需求。
*   **[HauhauCS/Qwen3.6-35B-A3B-Uncensored](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive)** by HauhauCS
    *   **点赞**：2,903 | **下载**：2,084,530
    *   **一句话**：基于 Qwen3.6 的“无审查”微调 GGUF 模型，其高人气反映了用户对模型可控性和自由度的不同需求。
*   **[Qwythos-9B-Claude-Mythos-5-1M-GGUF](https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF)** by empero-ai
    *   **点赞**：2,350 | **下载**：2,118,995
    *   **一句话**：结合了特定命名风格和思维链能力的微调量化模型，在社区中形成了独特的品牌认知。
*   **[inkling-GGUF](https://huggingface.co/unsloth/inkling-GGUF)** by unsloth
    *   **点赞**：105 | **下载**：6,771
    *   **一句话**：由知名优化团队 Unsloth 快速跟进发布的 Inkling 模型 GGUF 格式，方便本地部署。
*   **[GLM-5.2-colibri-int4](https://huggingface.co/jlnsrk/GLM-5.2-colibri-int4)** by jlnsrk
    *   **点赞**：142 | **下载**：4,035
    *   **一句话**：将强大的 GLM-5.2 进行 INT4 量化并优化为 CPU 友好型，旨在降低硬件门槛。
*   **[Qwen-Fixed-Chat-Templates](https://huggingface.co/froggeric/Qwen-Fixed-Chat-Templates)** by froggeric
    *   **点赞**：948 | **下载**：0
    *   **一句话**：虽非模型，但修复了 Qwen 系列模型聊天模板的关键问题，获得高赞，体现了基础工具的重要性。

## 🌊 生态信号

当前模型生态的焦点清晰地集中在 **“如何将强大的大模型高效、低成本地落地”**。**Qwen 家族（3.5, 3.6）** 成为社区微调和量化的核心基座，衍生出众多专注于特定场景（如无审查、推理增强）的变体。开源权重模型已成为绝对主流，官方发布（如 GLM-5.2, Gemma-4）与社区再创作（如 Bonsai 系列）形成了强大的互补生态。**量化技术的竞争已白热化**，prism-ml 的 1-bit/2-bit 模型和大量 GGUF 文件的流行，标志着对内存和算力极致优化的需求已从“可选”变为“刚需”。此外，多模态能力（尤其是视觉理解）正成为新模型的标配，而非独立门类。

## ✨ 值得探索

1.  **[GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**：作为本周最热门的原生中文对话模型，其架构设计和性能水平代表了当前开源 LLM 的前沿，是了解国产大模型最新进展的必看之作。
2.  **[prism-ml/Ternary-Bonsai-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)**：如果你对 AI 的未来在“边缘”和“端侧”感兴趣，这个极端的 2-bit 量化模型是绝佳的研究对象。它挑战了模型能力的下限，并展示了在极端资源约束下的可能性。
3.  **[Inkling](https://huggingface.co/thinkingmachines/Inkling)**：作为本周爆发的多模态对话模型，其具体的模型架构（`inkling_mm_model`）和在图像理解对话中的表现值得深入测试和对比，以评估其在真实多模态交互场景中的实力。