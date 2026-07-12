# Hugging Face 热门模型日报 2026-07-12

> 数据来源: [Hugging Face Hub](https://huggingface.co/) | 共 30 个模型 | 生成时间: 2026-07-12 14:47 UTC

---

# Hugging Face 热门模型日报 (2026-07-12)

## 📌 今日速览
Qwen3.5/3.6 系列持续主导开源生态，衍生出大量微调与量化版本，成为社区活跃度的核心引擎。多模态能力（尤其是图像理解与OCR）需求旺盛，百度的Unlimited-OCR与Nvidia的LocateAnything-3B等专用模型下载量极高。以“反审查”、“推理”和“Agent”为特色的社区微调版本（如HauhauCS、empero-ai等）表现抢眼，反映出用户对模型可控性与垂直场景能力的深度追求。开源权重生态极其活跃，量化（GGUF）格式是部署端的事实标准。

## 📊 热门模型分类

### 🧠 语言模型（LLM、对话、指令微调）
1.  **[GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**
    *   作者: zai-org | 点赞: 3,847 | 下载: 441,413
    *   智谱AI推出的最新开源对话模型，凭借其在多项基准测试中的出色表现及原生支持，迅速获得社区广泛关注。
2.  **[Qwen3.6-35B-A3B-Uncensored](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive)**
    *   作者: HauhauCS | 点赞: 2,667 | 下载: 2,596,384
    *   基于Qwen3.6的社区激进去审查微调版本，下载量惊人，反映了用户对无限制对话能力的强烈需求。
3.  **[Hy3](https://huggingface.co/tencent/Hy3)**
    *   作者: tencent | 点赞: 710 | 下载: 8,655
    *   腾讯混元推出的文本生成模型，代表了国内大厂在开源领域的持续投入。
4.  **[LongCat-2.0](https://huggingface.co/meituan-longcat/LongCat-2.0)**
    *   作者: meituan-longcat | 点赞: 179 | 下载: 1,767
    *   美团发布的对话模型，可能在长上下文或特定领域有优化，受到垂直领域开发者关注。
5.  **[MiniCPM5-1B](https://huggingface.co/openbmb/MiniCPM5-1B)**
    *   作者: openbmb | 点赞: 914 | 下载: 368,595
    *   面壁智能推出的极小尺寸模型，在边缘设备或资源受限场景下具有极高实用价值，下载量高。

### 🎨 多模态与生成（图像、视频、音频、文本到X）
1.  **[Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)**
    *   作者: baidu | 点赞: 1,936 | 下载: 1,430,656
    *   百度推出的通用OCR模型，以超百万的下载量证明了工业级文档处理能力的巨大市场需求。
2.  **[LocateAnything-3B](https://huggingface.co/nvidia/LocateAnything-3B)**
    *   作者: nvidia | 点赞: 2,711 | 下载: 1,501,653
    *   Nvidia发布的轻量级多模态定位模型，点赞与下载双高，是视觉定位领域的热门工具。
3.  **[ThinkingCap-Qwen3.6-27B](https://huggingface.co/bottlecapai/ThinkingCap-Qwen3.6-27B)**
    *   作者: bottlecapai | 点赞: 247 | 下载: 4,463
    *   专为图像推理任务设计的模型，体现了“视觉思维链”是多模态研究的前沿方向。
4.  **[MOSS-Transcribe-Diarize](https://huggingface.co/OpenMOSS-Team/MOSS-Transcribe-Diarize)**
    *   作者: OpenMOSS-Team | 点赞: 117 | 下载: 14,491
    *   结合转写与说话人分离的音频处理模型，满足会议记录等场景的实用需求。
5.  **[LTX-Best-Face-ID](https://huggingface.co/Alissonerdx/LTX-Best-Face-ID)**
    *   作者: Alissonerdx | 点赞: 104 | 下载: 0
    *   面向视频生成的身份保持模型，解决了AI视频生成中的角色一致性痛点。

### 🔧 专用模型（代码、数学、表格、音频）
1.  **[gemma-4-12B-agentic](https://huggingface.co/yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF)**
    *   作者: yuxinlu1 | 点赞: 1,155 | 下载: 445,368
    *   面向Agent任务的Gemma4微调版，标签中的“agentic”、“terminal”表明其专攻工具使用与代码执行。
2.  **[tabfm-1.0.0-pytorch](https://huggingface.co/google/tabfm-1.0.0-pytorch)**
    *   作者: google | 点赞: 353 | 下载: 20,973
    *   Google发布的表格基础模型，支持分类/回归的“零样本”学习，标志着基础模型向结构化数据拓展。
3.  **[Supra-Router-51M](https://huggingface.co/SupraLabs/Supra-Router-51M)**
    *   作者: SupraLabs | 点赞: 103 | 下载: 1,434
    *   一个超小尺寸的路由器模型，可能用于在模型集群中进行请求路由，优化成本和延迟。

### 📦 微调与量化（GGUF、社区版本）
1.  **[Qwythos-9B-Claude-Mythos-5-1M-GGUF](https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF)**
    *   作者: empero-ai | 点赞: 2,033 | 下载: 1,967,677
    *   9B参数的Qwen3.5量化版，以“推理”和混合身份命名，下载量近200万，是量化部署的典范。
2.  **[NVIDIA-Nemotron-Labs-3-Puzzle-75B-A9B-NVFP4](https://huggingface.co/nvidia/NVIDIA-Nemotron-Labs-3-Puzzle-75B-A9B-NVFP4)**
    *   作者: nvidia | 点赞: 109 | 下载: 34,796
    *   Nvidia官方提供的FP4量化版本，表明硬件厂商正积极参与推动自家模型的低比特量化生态。
3.  **[DeepSeek-V4-Flash-GGUF](https://huggingface.co/unsloth/DeepSeek-V4-Flash-GGUF)**
    *   作者: unsloth | 点赞: 149 | 下载: 44,614
    *   知名量化团队Unsloth对DeepSeek V4的快速量化响应，体现了社区对新模型的即时支持能力。
4.  **[Ornith-1.0-35B-GGUF](https://huggingface.co/deepreinforce-ai/Ornith-1.0-35B-GGUF)**
    *   作者: deepreinforce-ai | 点赞: 853 | 下载: 1,347,036
    *   一个35B的量化模型，但标签包含`transformers`，可能同时提供了原始格式，下载量极高。

## 🔭 生态信号
*   **模型家族势头**：**Qwen（3.5/3.6）** 和 **MiniCPM** 系列是当前最活跃的创新源头，其MoE架构变体（如MiniCPM5-1B）和多模态版本衍生出大量下游工作。**Gemma4** 在Agent领域也开始崭露头角。
*   **开源 vs 闭源**：本榜单完全由开源权重主导。即便是Google、Nvidia、Baidu等巨头，也主要通过发布可下载的权重来参与竞争。**闭源模型（如Claude）的影响力主要体现在其衍生出的开源微调版本**（如empero-ai的模型），这形成了一种独特的“逆向推动”生态。
*   **量化与微调**：**GGUF** 是绝对主流的量化与部署格式。社区微调方向高度分化，出现了针对“去审查”、“强推理”、“Agent化”等不同需求的专门版本。量化工作（如Unsloth）的响应速度极快，新模型发布后数天内即可获得优质量化版。

## 💡 值得探索
1.  **[Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)**：高达140万的下载量证明了其是解决现实世界文档数字化问题的“利器”，适合需要批量处理复杂文档图像的开发者。
2.  **[LocateAnything-3B](https://huggingface.co/nvidia/LocateAnything-3B)**：一个3B参数却能完成开放词汇视觉定位的模型，潜力巨大。它可能为机器人导航、图像编辑、数据标注等下游任务提供高效的感知基础。
3.  **[GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**：作为新上榜且点赞数最高的模型之一，值得深入评估其在中文语境下的对话能力与创新架构（标签为`glm_moe_dsa`），可能是新一代国产基座模型的有力竞争者。