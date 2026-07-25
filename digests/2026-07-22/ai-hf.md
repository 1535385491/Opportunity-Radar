# Hugging Face 热门模型日报 2026-07-22

> 数据来源: [Hugging Face Hub](https://huggingface.co/) | 共 30 个模型 | 生成时间: 2026-07-22 02:56 UTC

---

# Hugging Face 热门模型日报 | 2026-07-22

## 📌 今日速览

本周 Hugging Face 生态呈现三大亮点：首先，**多模态能力**持续爆发，尤其是图像/视觉理解模型（如 Inkling、百度 OCR）下载量与关注度双高。其次，**Qwen 系列**的衍生与微调版本（如 Qwen3.6 的多个 Uncensored 版本）占据榜单近四分之一，显示其强大的社区生态。最后，**极低比特量化**（1-bit， 2-bit）模型热度不减，标志着社区对模型高效部署的探索进入新阶段。此外，来自 OpenBMB 的机器人控制模型也预示着 VLA 模型正走向实用。

## 🏆 热门模型分类

### 🧠 语言模型（LLM、对话模型、指令微调）
1.  **[zai-org/GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**
    - 作者: zai-org | 赞: 4,285 | 下载: 545,109
    - 一句话: 智谱发布的 MoE 架构旗舰对话模型，本周凭借超高点赞与下载量强势登顶，代表国产大模型的前沿水准。
2.  **[google/gemma-4-31B-it](https://huggingface.co/google/gemma-4-31B-it)**
    - 作者: google | 赞: 3,314 | 下载: 12,113,203
    - 一句话: Google 最新发布的 Gemma 4 系列多模态指令模型，下载量破千万，是本周下载量最高的模型，生态号召力惊人。
3.  **[poolside/Laguna-S-2.1](https://huggingface.co/poolside/Laguna-S-2.1)**
    - 作者: poolside | 赞: 207 | 下载: 3,056
    - 一句话: 来自 Poolside AI 的新一代文本生成模型，关注度稳步上升，可能在特定任务或架构上有创新。
4.  **[Motif-Technologies/Motif-3-Beta](https://huggingface.co/Motif-Technologies/Motif-3-Beta)**
    - 作者: Motif-Technologies | 赞: 128 | 下载: 125
    - 一句话: Motif-Technologies 推出的 Beta 版本新模型，虽下载量尚低，但获得一定社区关注，值得观察其后续表现。

### 🎨 多模态与生成（图像、视频、音频、文本到X）
1.  **[thinkingmachines/Inkling](https://huggingface.co/thinkingmachines/Inkling)**
    - 作者: thinkingmachines | 赞: 1,368 | 下载: 16,441
    - 一句话: 本周点赞数最高的模型，主打图像到文本的对话能力，其创新的交互方式吸引了大量用户关注。
2.  **[baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)**
    - 作者: baidu | 赞: 2,614 | 下载: 2,237,351
    - 一句话: 百度推出的“无限”OCR模型，下载量超220万，极高的实用性使其成为文档处理、信息提取领域的热门工具。
3.  **[moonshotai/Kimi-K2.7-Code](https://huggingface.co/moonshotai/Kimi-K2.7-Code)**
    - 作者: moonshotai | 赞: 1,200 | 下载: 722,058
    - 一句话: 月之暗面发布的面向代码的多模态模型，下载量大，体现了代码智能与视觉理解结合的应用前景。
4.  **[OpenMOSS-Team/MOSS-Transcribe-Diarize](https://huggingface.co/OpenMOSS-Team/MOSS-Transcribe-Diarize)**
    - 作者: OpenMOSS-Team | 赞: 299 | 下载: 92,265
    - 一句话: 支持转写与说话人分离的音频模型，满足了会议记录等场景的需求，下载量可观。
5.  **[conradlocke/krea2-identity-edit](https://huggingface.co/conradlocke/krea2-identity-edit)**
    - 作者: conradlocke | 赞: 476 | 下载: 0
    - 一句话: 针对 Krea-2 模型的身份保持图像编辑 LoRA，虽未公开权重，但其创意在社区获得了高赞。
6.  **[Alissonerdx/LTX-Best-Face-ID](https://huggingface.co/Alissonerdx/LTX-Best-Face-ID)**
    - 作者: Alissonerdx | 赞: 223 | 下载: 0
    - 一句话: LTX 视频生成模型的面部保持 LoRA，体现了社区对生成内容一致性的精细化需求。

### 🔧 专用模型（代码、数学、医疗、嵌入）
1.  **[nvidia/Nemotron-3-Embed-1B-BF16](https://huggingface.co/nvidia/Nemotron-3-Embed-1B-BF16)**
    - 作者: nvidia | 赞: 96 | 下载: 93,021
    - 一句话: NVIDIA 发布的轻量级文本嵌入模型，专注于句子相似度，是构建 RAG 等应用的基础组件。
2.  **[nvidia/nemotron-3.5-asr-streaming-0.6b](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b)**
    - 作者: nvidia | 赞: 903 | 下载: 590,230
    - 一句话: NVIDIA 的流式自动语音识别模型，下载量近60万，为实时语音应用提供了高性能的开源选择。
3.  **[openbmb/MiniCPM-RobotManip](https://huggingface.co/openbmb/MiniCPM-RobotManip)**
    - 作者: openbmb | 赞: 147 | 下载: 58
    - 一句话: 基于 MiniCPM 的机器人操作视觉语言动作（VLA）模型，是 AI 从数字世界迈向物理世界控制的代表。
4.  **[openbmb/MiniCPM-RobotTrack](https://huggingface.co/openbmb/MiniCPM-RobotTrack)**
    - 作者: openbmb | 赞: 107 | 下载: 72
    - 一句话: 同样来自 OpenBMB，专注于机器人追踪任务的 VLA 模型，与上一个模型共同展现了 VLA 赛道的热度。

### 📦 微调与量化（社区微调、GGUF、AWQ）
1.  **[HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive)**
    - 作者: HauhauCS | 赞: 2,971 | 下载: 1,997,690
    - 一句话: 基于 Qwen3.6 MoE 架构的激进风格 Uncensored 微调版，高赞高下载，满足了特定用户对无限制对话的需求。
2.  **[prism-ml/Ternary-Bonsai-27B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf)**
    - 作者: prism-ml | 赞: 900 | 下载: 432,196
    - 一句话: 基于 Qwen 的 2-bit 三值量化模型，展示了在极低资源下运行大型语言模型的可能性。
3.  **[prism-ml/Bonsai-27B-gguf](https://huggingface.co/prism-ml/Bonsai-27B-gguf)**
    - 作者: prism-ml | 赞: 571 | 下载: 1,404,962
    - 一句话: 惊人的 1-bit 量化版本，下载量超 140 万，是极限量化领域的标杆，证明了极端压缩的可行性。
4.  **[empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF](https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF)**
    - 作者: empero-ai | 赞: 2,391 | 下载: 2,133,420
    - 一句话: 结合了多款优秀模型特性的复杂微调 GGUF 版本，下载量超 213 万，是社区“缝合”创意的典型代表。
5.  **[GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF](https://huggingface.co/GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF)**
    - 作者: GnLOLot | 赞: 147 | 下载: 51,746
    - 一句话: 基于 MiniCPM5-1B 的“思维链”量化模型，反映了社区对小模型推理能力提升的关注。
6.  **[unsloth/inkling-GGUF](https://huggingface.co/unsloth/inkling-GGUF)**
    - 作者: unsloth | 赞: 116 | 下载: 7,377
    - 一句话: 量化工具 Unsloth 官方为热门模型 Inkling 提供的 GGUF 版本，体现了官方与社区在模型优化上的协作。

## 🔭 生态信号

1.  **Qwen 生态持续繁荣**：榜单中近四分之一模型基于 Qwen 系列（特别是 Qwen3.6）进行微调或量化，覆盖了多模态、对话、代码等多种场景，显示其已成为社区二次创新的重要基座。
2.  **闭源权重加速开源化**：Google（Gemma 4）、智谱（GLM 5.2）、月之暗面（Kimi K2.7）等头部公司的模型均提供官方或高质量社区量化版本，推动了先进模型的普惠化。
3.  **极限量化成为新赛道**：1-bit 和 2-bit 模型（如 Bonsai 系列）获得巨大下载量，表明社区对“如何在消费级硬件上运行大模型”的探索已进入深水区，这对边缘计算和本地部署具有重要意义。
4.  **AI 走向物理世界**：OpenBMB 的 MiniCPM 机器人控制模型虽下载量小，但其出现在热门榜上，预示着 **VLA（视觉语言动作）** 模型正从学术研究走向开发者视野，是下一个值得观察的增长点。

## 🔍 值得探索

1.  **[thinkingmachines/Inkling](https://huggingface.co/thinkingmachines/Inkling)**：作为本周点赞冠军，其“图像到文本对话”的新颖交互方式值得亲身体验，可以探索多模态模型在创意对话中的潜力。
2.  **[zai-org/GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**：高赞、高下载的国产 MoE 旗舰，代表了当前开源模型的顶级水平之一，值得在各类基准任务上进行深度评测和对比。
3.  **[prism-ml/Bonsai-27B-gguf](https://huggingface.co/prism-ml/Bonsai-27B-gguf)**：1-bit 量化模型是技术上的一个奇迹。尝试在极低配置设备上运行它，不仅能了解其实际性能，更能感受边缘计算的未来图景。