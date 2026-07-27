# Hugging Face 热门模型日报 2026-07-27

> 数据来源: [Hugging Face Hub](https://huggingface.co/) | 共 30 个模型 | 生成时间: 2026-07-27 03:32 UTC

---

# Hugging Face 热门模型日报 (2026-07-27)

## 📌 今日速览

本周 Hugging Face 生态呈现三大显著趋势：**中国团队发布的模型持续霸榜**，如智谱AI的 GLM-5.2、百度的 Unlimited-OCR 和 Moonshot 的 Kimi-K2.7-Code 获得极高关注；**多模态能力，特别是 OCR（光学字符识别）需求爆发**，顶级模型的下载量高达数百万；**社区驱动的量化与微调生态空前繁荣**，基于 Qwen 3.6 等新模型的 GGUF 量化版本下载量屡破百万，显示出对本地化部署的强劲需求。

## 🔥 热门模型

### 🧠 语言模型（LLM、对话模型、指令微调）
*   [**zai-org/GLM-5.2**](https://huggingface.co/zai-org/GLM-5.2) - 作者: zai-org | 👍 4,481 | ⬇️ 827,191
    - 智谱AI发布的超大规模中文通用对话模型，凭借其卓越的性能和开放权重，成为本周关注度最高的模型。
*   [**upstage/Solar-Open2-250B**](https://huggingface.co/upstage/Solar-Open2-250B) - 作者: upstage | 👍 599 | ⬇️ 3,305
    - 韩国公司发布的2500亿参数巨型开源模型，展示了社区向更大规模开放模型迈进的趋势。
*   [**poolside/Laguna-S-2.1**](https://huggingface.co/poolside/Laguna-S-2.1) - 作者: poolside | 👍 704 | ⬇️ 56,445
    - 新一代文本生成模型，其完整版与量化版（见下文）共同上榜，体现了模型发布与社区优化紧密联动的生态。

### 🎨 多模态与生成（图像、视频、音频、文本到X）
*   [**baidu/Unlimited-OCR**](https://huggingface.co/baidu/Unlimited-OCR) - 作者: baidu | 👍 3,217 | ⬇️ 2,593,460
    - 百度发布的“无限OCR”模型，能处理复杂场景的图文理解，是本周下载量最高的模型，引爆了工业级OCR应用需求。
*   [**microsoft/Mage-Flow**](https://huggingface.co/microsoft/Mage-Flow) - 作者: microsoft | 👍 339 | ⬇️ 1,375
    - 微软发布的文本到图像生成模型，集成图像生成与编辑功能，代表了生成式AI工具的集成化趋势。
*   [**owensong/Inflect-Micro-v2**](https://huggingface.co/owensong/Inflect-Micro-v2) - 作者: owensong | 👍 180 | ⬇️ 298
    - 轻量级文本转语音（TTS）模型，标签强调“CPU”和“边缘AI”，预示着语音合成技术向端侧设备的迁移。
*   [**nvidia/Cosmos3-Edge**](https://huggingface.co/nvidia/Cosmos3-Edge) - 作者: nvidia | 👍 125 | ⬇️ 32,700
    - NVIDIA面向边缘计算的Cosmos视觉模型，专注于高效的视觉理解与生成，适用于资源受限场景。

### 🔧 专用模型（代码、数学、机器人等）
*   [**moonshotai/Kimi-K2.7-Code**](https://huggingface.co/moonshotai/Kimi-K2.7-Code) - 作者: moonshotai | 👍 1,298 | ⬇️ 730,129
    - 月之暗面推出的强代码能力多模态模型，下载量巨大，显示出开发者对高质量AI编程助手的迫切需求。
*   [**Kwaipilot/KAT-Coder-V2.5-Dev**](https://huggingface.co/Kwaipilot/KAT-Coder-V2.5-Dev) - 作者: Kwaipilot | 👍 198 | ⬇️ 3,764
    - 专注于代码生成与理解的开发版模型，是众多代码专用模型中的一个活跃参与者。
*   [**openbmb/MiniCPM-RobotManip**](https://huggingface.co/openbmb/MiniCPM-RobotManip) - 作者: openbmb | 👍 177 | ⬇️ 643
    - 面向机器人操作的视觉-语言-动作（VLA）模型，标志着基础模型在机器人控制领域的落地探索。

### 📦 微调与量化（社区微调、GGUF、AWQ）
*   [**HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive**](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive) - 作者: HauhauCS | 👍 3,114 | ⬇️ 1,927,138
    - 基于Qwen 3.6 MoE架构的无审查、风格激进微调版，下载量接近200万，反映了社区对模型“可玩性”和角色扮演的强烈兴趣。
*   [**DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF**](https://huggingface.co/DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF) - 作者: DavidAU | 👍 644 | ⬇️ 552,026
    - 另一个高人气的Qwen 3.6 GGUF量化微调版本，突显了基于新架构的量化生态已迅速建立。
*   [**prism-ml/Bonsai-27B-gguf**](https://huggingface.co/prism-ml/Bonsai-27B-gguf) - 作者: prism-ml | 👍 652 | ⬇️ 2,187,304
    - 达到惊人的**1-bit量化**的27B模型，下载量超218万，展示了极端量化技术的巨大吸引力和实用价值。
*   [**empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF**](https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF) - 作者: empero-ai | 👍 2,480 | ⬇️ 1,410,054
    - 结合了强推理能力与超长上下文（1M tokens）的GGUF量化模型，满足复杂任务的本地化需求。

## 📡 生态信号

当前模型生态呈现出 **“中国驱动、多模态爆发、量化为王”** 的鲜明特征。Qwen 3.x 系列已成为社区微调和量化的**主力基座**，其MoE版本尤其受到欢迎。**开源权重模型**持续占据主导，不仅来自中国团队（GLM， Qwen），也来自韩国（Solar）、法国（Laguna）等地，形成了多元化的全球竞赛格局。**量化技术**是连接顶级模型与实际应用的关键桥梁，GGUF格式几乎垄断了下载榜，社区对能在消费级硬件上运行的高效模型需求极大。闭源模型（如Claude、GPT）的压力正通过社区微调和“无审查”变体的流行间接体现。

## 🔍 值得探索

1.  **[zai-org/GLM-5.2](https://huggingface.co/zai-org/GLM-5.2)**：作为周点赞数和下载量双冠王的中文通用大模型，它是评估当前开源中文模型性能天花板的必测基准。
2.  **[baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR)**：其爆炸性的下载量证明了它是当前最强的OCR模型之一。对于需要处理文档、票据、复杂图片文本提取的应用开发者而言，这是首选工具。
3.  **[prism-ml/Bonsai-27B-gguf](https://huggingface.co/prism-ml/Bonsai-27B-gguf)**：这款1-bit量化模型具有里程碑意义。它代表了模型压缩技术的极限探索，对于研究超低比特宽下的模型行为、以及极端边缘部署具有重要价值。