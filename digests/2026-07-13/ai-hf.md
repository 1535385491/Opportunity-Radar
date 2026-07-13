# Hugging Face 热门模型日报 2026-07-13

> 数据来源: [Hugging Face Hub](https://huggingface.co/) | 共 30 个模型 | 生成时间: 2026-07-13 03:24 UTC

---

# Hugging Face 热门模型日报
**日期：2026年7月13日**

---

### 📢 今日速览

本周Hugging Face社区热度不减，开源生态持续爆发。**Qwen系列（3.5/3.6）凭借强大的多模态能力和高效的量化版本（如MTP-GGUF）占据榜单多个席位**，显示出其在开发者社区的统治力。来自中国团队的**GLM-5.2**（点赞3,859）和**腾讯Hy3**（点赞729）表现抢眼，标志着中国开源大模型在全球生态中的核心地位。**多模态与视觉理解**成为显著趋势，多个模型（如NVIDIA LocateAnything、百度Unlimited-OCR）在图像文本处理领域取得高关注。同时，**量化与微调活动异常活跃**，GGUF格式模型下载量普遍巨大，社区对部署效率的追求可见一斑。

---

### 🔥 热门模型分类

#### 🧠 语言模型（LLM、对话、指令微调）

| 模型 | 作者 | 👍 点赞 | ⬇️ 下载 | 一句话说明 |
| :--- | :--- | :--- | :--- | :--- |
| [**tencent/Hy3**](https://huggingface.co/tencent/Hy3) | tencent | 729 | 8,655 | 腾讯混元系列新一代模型，凭借文本生成能力上榜。 |
| [**zai-org/GLM-5.2**](https://huggingface.co/zai-org/GLM-5.2) | zai-org | 3,859 | 441,413 | **本周最高点赞模型**，智谱AI的GLM系列最新版本，对话与综合能力强。 |
| [**InternScience/Agents-A1**](https://huggingface.co/InternScience/Agents-A1) | InternScience | 511 | 29,038 | 基于Qwen MoE架构的智能体模型，探索AI代理应用。 |
| [**nvidia/Nemotron-Labs-Audex-30B-A3B**](https://huggingface.co/nvidia/Nemotron-Labs-Audex-30B-A3B) | nvidia | 133 | 901 | NVIDIA实验性模型，专注于特定音频文本生成任务。 |
| [**meituan-longcat/LongCat-2.0**](https://huggingface.co/meituan-longcat/LongCat-2.0) | meituan-longcat | 183 | 1,767 | 美团长上下文模型，可能针对长文本对话优化。 |
| [**SupraLabs/Supra-Router-51M**](https://huggingface.co/SupraLabs/Supra-Router-51M) | SupraLabs | 107 | 1,434 | 轻量级路由器模型，用于智能路由请求到不同的专家模型。 |
| [**deepreinforce-ai/Ornith-1.0-35B-GGUF**](https://huggingface.co/deepreinforce-ai/Ornith-1.0-35B-GGUF) | deepreinforce-ai | 855 | 1,347,036 | 35B参数的通用文本生成模型，以GGUF格式发布，下载量巨大。 |

#### 🎨 多模态与生成（图像、视频、音频、文本到X）

| 模型 | 作者 | 👍 点赞 | ⬇️ 下载 | 一句话说明 |
| :--- | :--- | :--- | :--- | :--- |
| [**baidu/Unlimited-OCR**](https://huggingface.co/baidu/Unlimited-OCR) | baidu | 1,943 | 1,430,656 | 百度发布的强大OCR模型，下载量惊人，解决通用文字识别问题。 |
| [**nvidia/LocateAnything-3B**](https://huggingface.co/nvidia/LocateAnything-3B) | nvidia | 2,717 | 1,501,653 | **视觉理解明星**，能根据文本提示定位图像中任意对象，应用前景广。 |
| [**Alissonerdx/LTX-Best-Face-ID**](https://huggingface.co/Alissonerdx/LTX-Best-Face-ID) | Alissonerdx | 113 | 0 | 面向视频生成的身份保持LoRA模型，解决视频生成中的角色一致性问题。 |
| [**robbyant/lingbot-video-moe-30b-a3b**](https://huggingface.co/robbyant/lingbot-video-moe-30b-a3b) | robbyant | 91 | 461 | 基于MoE架构的视频生成模型，探索视频内容创作。 |
| [**robbyant/lingbot-world-v2-14b-causal-fast**](https://huggingface.co/robbyant/lingbot-world-v2-14b-causal-fast) | robbyant | 85 | 0 | 世界模型（World Model），用于理解和预测视觉物理世界的演进。 |
| [**CohereLabs/cohere-transcribe-arabic-07-2026**](https://huggingface.co/CohereLabs/cohere-transcribe-arabic-07-2026) | CohereLabs | 95 | 9,860 | Cohere推出的阿拉伯语语音识别模型，填补特定语种ASR空白。 |
| [**OpenMOSS-Team/MOSS-Transcribe-Diarize**](https://huggingface.co/OpenMOSS-Team/MOSS-Transcribe-Diarize) | OpenMOSS-Team | 133 | 14,491 | 开源MOSS团队的语音转录与说话人分离模型。 |
| [**nineninesix/gepard-1.0**](https://huggingface.co/nineninesix/gepard-1.0) | nineninesix | 86 | 2,263 | 基于Qwen3.5的文本转语音模型。 |

#### 🔧 专用模型（代码、数学、特定领域）

| 模型 | 作者 | 👍 点赞 | ⬇️ 下载 | 一句话说明 |
| :--- | :--- | :--- | :--- | :--- |
| [**yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF**](https://huggingface.co/yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF) | yuxinlu1 | 1,160 | 445,368 | 基于Gemma4的**代码与智能体专用模型**，在终端环境与工具使用方面表现突出。 |
| [**google/tabfm-1.0.0-pytorch**](https://huggingface.co/google/tabfm-1.0.0-pytorch) | google | 357 | 20,973 | Google发布的表格基础模型，用于**表格分类/回归**任务，支持零样本。 |
| [**HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive**](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive) | HauhauCS | 2,680 | 2,596,384 | 基于Qwen3.6的**无审查、攻击性对话微调**版本，下载量极高。 |
| [**migtissera/Tess-4-27B**](https://huggingface.co/migtissera/Tess-4-27B) | migtissera | 94 | 971 | 基于Qwen3.5的27B参数多模态模型，可能在特定任务上经过优化。 |

#### 📦 微调与量化（社区优化、GGUF、高效部署）

| 模型 | 作者 | 👍 点赞 | ⬇️ 下载 | 一句话说明 |
| :--- | :--- | :--- | :--- | :--- |
| [**unsloth/Qwen3.6-27B-MTP-GGUF**](https://huggingface.co/unsloth/Qwen3.6-27B-MTP-GGUF) | unsloth | 1,059 | 2,905,019 | **下载量冠军**！Qwen3.6-27B的MTP（推测为某种高效微调）量化版本，极度受欢迎。 |
| [**HauhauCS/Qwen3.6-35B-A3B-Uncensored...**](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive) | HauhauCS | 2,680 | 2,596,384 | （重复条目，强调其作为社区微调+量化的成功案例）。 |
| [**unsloth/Qwen3.6-27B-NVFP4**](https://huggingface.co/unsloth/Qwen3.6-27B-NVFP4) | unsloth | 180 | 1,378,663 | Qwen3.6的NVFP4（4-bit浮点）量化版本，适用于高性能GPU。 |
| [**empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF**](https://huggingface.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF) | empero-ai | 2,050 | 1,967,677 | 9B参数的**推理增强模型**量化版，高点赞反映社区对高效推理模型的需求。 |
| [**GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-Thinking-GGUF**](https://huggingface.co/GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-Thinking-GGUF) | GnLOLot | 204 | 49,268 | 仅1B参数的“思考”模型量化版，探索极致轻量化。 |
| [**unsloth/DeepSeek-V4-Flash-GGUF**](https://huggingface.co/unsloth/DeepSeek-V4-Flash-GGUF) | unsloth | 153 | 44,614 | DeepSeek下一代架构V4 Flash的早期量化版本，技术风向标。 |
| [**nvidia/NVIDIA-Nemotron-Labs-3-Puzzle-75B-A9B-NVFP4**](https://huggingface.co/nvidia/NVIDIA-Nemotron-Labs-3-Puzzle-75B-A9B-NVFP4) | nvidia | 113 | 34,796 | NVIDIA的75B参数MoE模型量化版，专为解决复杂谜题（推理）设计。 |
| [**bottlecapai/ThinkingCap-Qwen3.6-27B-GGUF**](https://huggingface.co/bottlecapai/ThinkingCap-Qwen3.6-27B-GGUF) | bottlecapai | 85 | 312,299 | Qwen3.6-27B的思考链（CoT）增强量化版本。 |
| [**froggeric/Qwen-Fixed-Chat-Templates**](https://huggingface.co/froggeric/Qwen-Fixed-Chat-Templates) | froggeric | 868 | 0 | （非模型）修复版的Qwen对话模板，**解决了一个社区痛点**，因此高赞。 |

---

### 🌊 生态信号

1.  **模型家族势头**：**Qwen（通义千问）系列**势头最劲，从3.5到3.6迭代迅速，覆盖了从1B到35B的参数规模，并衍生出大量社区微调、量化和专用版本，是当前开源生态的**绝对主力**。其次是**NVIDIA Nemotron Labs**系列，持续推出实验性大模型。
2.  **开源权重 vs 闭源**：**开源权重生态空前繁荣**。榜单上几乎所有模型都开放了权重或量化格式。即便是像NVIDIA这样的巨头，也通过发布开源权重的实验模型（如Audex, Nemotron Labs-3）来获取社区反馈和推动生态。闭源模型（如部分云服务API）在此次榜单中不占主流，**社区动力明显偏向开源**。
3.  **量化与微调活动**：**量化是当前最活跃的生态活动**。**GGUF格式已成为本地部署的事实标准**，其下载量（如Qwen3.6-27B-MTP-GGUF接近300万）远超原始模型。社区不仅做简单量化，更注重**在量化基础上进行能力增强**（如